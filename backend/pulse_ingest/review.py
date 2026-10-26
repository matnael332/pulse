"""The review of a proposed mapping: what the customer sees, and the fixes they may make.

The customer approves the mapping on the site. They see which of their tables became which of
ours, which data groups are there, and which of their columns were left out (the personal ones
among them). They may change only what the proposal flagged:

- a column of ours whose source is uncertain (a fuzzy name, a date joined to a time, the LLM's
  guess) or missing: they pick one of their own columns of a compatible kind;
- a category spelling the rules did not recognise: they pick one of our values for it, or leave
  it as written.

The flags are decided once, at propose time (``flags``), and stored with the ingestion: a fixed
column becomes certain, and recomputing would hide it from the customer who wants to change it
again. Values come from the staged ``values.json``; the LLM never sees any of this.
"""

from __future__ import annotations

from pathlib import Path

from pulse_core.io import read_json, write_json_lf
from pulse_ingest import heuristics
from pulse_ingest.contract import IngestContract, TargetColumn
from pulse_ingest.mapping import ColumnSource, Mapping
from pulse_ingest.profile import SourceTable, from_json
from pulse_ingest.refusal import Refused

CERTAIN = 1.0  # an exact name, the rules and the LLM agreeing, or the customer's own choice


class InvalidEdit(Refused):
    """A fix the review does not allow; nothing was changed."""

    def __init__(self, message: str, reason: str) -> None:
        super().__init__(message, "invalid_edit", reason=reason)


class Staged:
    """The staged proposal of one ingestion: the mapping, the profile and the values."""

    def __init__(self, staging: Path) -> None:
        self.staging = staging
        self.mapping = Mapping.model_validate(read_json(staging / "mapping.proposed.json"))
        self.profile: list[SourceTable] = from_json(read_json(staging / "profile.json")["tables"])
        self.values: dict[str, dict[str, list[str]]] = read_json(staging / "values.json")

    def save(self) -> None:
        write_json_lf(
            self.staging / "mapping.proposed.json", self.mapping.model_dump(), ndigits=None
        )

    def source(self, name: str) -> SourceTable:
        return next(t for t in self.profile if t.name == name)


def _has_source(source: ColumnSource | None) -> bool:
    return bool(source and (source.column or source.constant or source.generate))


def flags(mapping: Mapping, contract: IngestContract, values: dict) -> dict:
    """What the customer may fix: ``{"columns": [{table, column, reason}], "values": {...}}``."""
    columns = []
    for name, table in mapping.tables.items():
        for column in contract.table(name).columns:
            source = table.columns.get(column.name)
            if column.required and not _has_source(source):
                columns.append({"table": name, "column": column.name, "reason": "missing"})
            elif source and source.column and source.confidence < CERTAIN:
                columns.append({"table": name, "column": column.name, "reason": "uncertain"})
    unknown = heuristics.unrecognised_values(mapping, contract, values)
    return {"columns": columns, "values": unknown}


def blocking(mapping: Mapping, contract: IngestContract) -> list[dict]:
    """Required columns still without a source: approval waits for them."""
    return [
        {"table": name, "column": column.name}
        for name, table in mapping.tables.items()
        for column in contract.table(name).columns
        if column.required and not _has_source(table.columns.get(column.name))
    ]


def _options(staged: Staged, table: str, column: TargetColumn) -> list[dict]:
    allowed = heuristics.COMPATIBLE.get(column.kind, set())
    out = []
    for source_name in staged.mapping.tables[table].sources:
        for col in staged.source(source_name).columns:
            if col.kind in allowed:
                out.append({"name": col.name, "kind": col.kind})
    return out


def view(staged: Staged, contract: IngestContract, stored: dict) -> dict:
    """The review screen's content (names, kinds and the customer's own category spellings)."""
    mapping = staged.mapping
    present = contract.groups_present(list(mapping.tables))
    all_groups = list(dict.fromkeys(t.group for t in contract.tables))
    tables = []
    for name, table in mapping.tables.items():
        target = contract.table(name)
        mapped = sum(1 for c in table.columns.values() if c.column)
        tables.append(
            {
                "target": name,
                "group": target.group,
                "sources": table.sources,
                "rows": sum(staged.source(s).rows for s in table.sources),
                "mapped": mapped,
                "total": len(target.columns),
            }
        )
    columns = []
    for item in stored["columns"]:
        target = contract.table(item["table"]).column(item["column"])
        source = mapping.tables[item["table"]].columns.get(item["column"])
        columns.append(
            {
                **item,
                "required": target.required,
                "kind": target.kind,
                "current": source.column if source else None,
                "time_column": source.time_column if source else None,
                "origin": source.origin if source else None,
                "options": _options(staged, item["table"], target),
            }
        )
    values = []
    for key, spellings in stored["values"].items():
        table, column = key.split(".", 1)
        known = mapping.value_maps.get(key, {})
        values.append(
            {
                "table": table,
                "column": column,
                "allowed": list(contract.table(table).column(column).values),
                "spellings": [{"spelling": s, "value": known.get(s)} for s in spellings],
            }
        )
    return {
        "version": mapping.version,
        "tables": tables,
        "groups": {
            "present": list(present),
            "missing": [g for g in all_groups if g not in present],
            "core": list(contract.core_groups),
        },
        "ignored": {k: v for k, v in mapping.ignored.items() if v},
        "columns": columns,
        "values": values,
        "notes": list(mapping.review),
        "blocking": blocking(mapping, contract),
    }


def edit(
    staged: Staged,
    contract: IngestContract,
    stored: dict,
    columns: list[dict] = (),
    values: list[dict] = (),
) -> dict:
    """Apply the customer's fixes to the staged mapping (saved); returns the updated flags.

    ``columns``: ``[{table, column, source}]`` (``source`` None: no source). ``values``:
    ``[{table, column, spelling, value}]`` (``value`` None: keep the spelling as written)."""
    mapping = staged.mapping.model_copy(deep=True)
    stored = {"columns": list(stored["columns"]), "values": dict(stored["values"])}
    allowed_columns = {(c["table"], c["column"]) for c in stored["columns"]}
    for fix in columns:
        key = (fix["table"], fix["column"])
        if key not in allowed_columns:
            raise InvalidEdit(f"{key} was not flagged", "not_flagged")
        table = mapping.tables[fix["table"]]
        target = contract.table(fix["table"]).column(fix["column"])
        if fix["source"] is None:
            if target.required:
                raise InvalidEdit(f"{key} is required", "required")
            table.columns.pop(fix["column"], None)
            continue
        options = {o["name"]: o["kind"] for o in _options(staged, fix["table"], target)}
        if fix["source"] not in options:
            raise InvalidEdit(f"{fix['source']} is not a column of a compatible kind", "option")
        taken = {
            c.column for name, c in table.columns.items() if name != fix["column"] and c.column
        }
        if fix["source"] in taken:
            raise InvalidEdit(f"{fix['source']} is already used in {fix['table']}", "taken")
        profile = next(
            col
            for s in table.sources
            for col in staged.source(s).columns
            if col.name == fix["source"]
        )
        before = table.columns.get(fix["column"])
        kept = before if before and before.column == fix["source"] else ColumnSource()
        table.columns[fix["column"]] = ColumnSource(  # confirming a date keeps its time column
            column=fix["source"],
            format=profile.format,
            time_column=kept.time_column,
            time_format=kept.time_format,
            origin="user",
            confidence=CERTAIN,
        )
        if target.values:  # an enum: recognise the new source's spellings
            _revalue(mapping, contract, staged.values, fix["table"], target, stored)
    for fix in values:
        key = f"{fix['table']}.{fix['column']}"
        if fix["spelling"] not in stored["values"].get(key, []):
            raise InvalidEdit(f"{fix['spelling']!r} of {key} was not flagged", "not_flagged")
        allowed = contract.table(fix["table"]).column(fix["column"]).values
        known = mapping.value_maps.setdefault(key, {})
        if fix["value"] is None:
            known.pop(fix["spelling"], None)
        elif fix["value"] in allowed:
            known[fix["spelling"]] = fix["value"]
        else:
            raise InvalidEdit(f"{fix['value']!r} is not a value of {key}", "value")
    heuristics.finalize(mapping, staged.profile, contract)
    staged.mapping = mapping
    staged.save()
    return stored


def _revalue(
    mapping: Mapping,
    contract: IngestContract,
    values: dict,
    table: str,
    column: TargetColumn,
    stored: dict,
) -> None:
    key = f"{table}.{column.name}"
    source = mapping.tables[table].columns[column.name].column
    seen = sorted(
        {v for s in mapping.tables[table].sources for v in values.get(s, {}).get(source, [])}
    )
    known = {}
    for value in seen:
        canonical = heuristics.canonical_value(value, column)
        if canonical:
            known[value] = canonical
    mapping.value_maps[key] = known
    unknown = [v for v in seen if v not in known and v.lower() not in column.values]
    if unknown:
        stored["values"][key] = unknown
    else:
        stored["values"].pop(key, None)
