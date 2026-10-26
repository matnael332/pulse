"""One ingestion, from an uploaded zip to a data folder the pipeline can run on.

The customer folder's layout is in ``pulse_ingest.layout``.

After ``apply`` nothing of the original export is left but the mapped columns, pseudonymised.
"""

from __future__ import annotations

import json
import shutil
import uuid
from collections.abc import Sequence
from datetime import UTC, datetime
from pathlib import Path

import pandas as pd

from pulse_core.io import read_json, write_json_lf
from pulse_core.raw import write_raw_dir
from pulse_ingest import heuristics, llm
from pulse_ingest.contract import IngestContract
from pulse_ingest.layout import CustomerDir
from pulse_ingest.mapping import Mapping
from pulse_ingest.normalize import normalize
from pulse_ingest.profile import fingerprint, profile_tables, to_json, union_groups
from pulse_ingest.pseudonymize import EntityMap, load_secret
from pulse_ingest.readers import read_files
from pulse_ingest.sources import ZipSource

RAW_FLOAT_FORMAT = "%.4f"
MAX_DISTINCT = 200  # values.json keeps the distinct values of columns with at most this many


def new_ingestion_id() -> str:
    return f"{datetime.now(UTC):%Y%m%d-%H%M%S}-{uuid.uuid4().hex[:6]}"


def _staging(customer_dir: Path, ingestion: str) -> Path:
    return CustomerDir(customer_dir).staging(ingestion)


def distinct_values(tables: dict[str, pd.DataFrame]) -> dict[str, dict[str, list[str]]]:
    """Source table -> column -> its distinct non-empty values, for columns with few of them.

    Staged for the review screen (unrecognised spellings, a different source for an enum column);
    deleted with the staging folder by ``apply``. Never sent to the LLM."""
    out: dict[str, dict[str, list[str]]] = {}
    for name, df in tables.items():
        columns = {}
        for column in df.columns:
            raw = df[column].dropna().unique()
            if len(raw) > MAX_DISTINCT * 4:  # many raw spellings: not a category column
                continue
            values = sorted({str(v).strip() for v in raw} - {""})
            if 0 < len(values) <= MAX_DISTINCT:
                columns[str(column)] = values
        out[name] = columns
    return out


def latest_approved(customer_dir: Path) -> Mapping | None:
    mappings = CustomerDir(customer_dir).mappings
    versions = sorted(mappings.glob("v*.json"), key=lambda p: int(p.stem[1:]))
    return Mapping.model_validate(read_json(versions[-1])) if versions else None


def propose(
    zip_path: Path,
    customer_dir: Path,
    contract: IngestContract,
    *,
    use_llm: bool = True,
    ingestion: str | None = None,
    llm_client=None,
) -> tuple[str, Mapping]:
    """Stage the export and write ``mapping.proposed.json``; returns the ingestion id.

    The zip may already be in ``uploads/<ingestion>/`` (the site streams it there); otherwise it
    is copied in. A structure seen before reuses its approved mapping, unless the export brings
    enum spellings that mapping does not know: then it goes back to review as a new version."""
    ingestion = ingestion or new_ingestion_id()
    upload = CustomerDir(customer_dir).uploads(ingestion)
    staging = _staging(customer_dir, ingestion)
    upload.mkdir(parents=True, exist_ok=True)
    staging.mkdir(parents=True)
    stored = upload / zip_path.name
    if zip_path.resolve() != stored.resolve():
        shutil.copyfile(zip_path, stored)
    files = ZipSource(stored).fetch(staging)
    tables, read_info = read_files(files, staging / "files")
    groups = union_groups(tables)
    grouped = {
        name: pd.concat([tables[m] for m in members], ignore_index=True)
        for name, members in groups.items()
    }
    (staging / "tables").mkdir()
    index = {}
    for i, (name, df) in enumerate(grouped.items()):
        df.to_parquet(staging / "tables" / f"{i:03d}.parquet", index=False)
        index[name] = f"{i:03d}.parquet"
    shutil.rmtree(staging / "files")  # the extracted originals: the parquet copies suffice
    profile = profile_tables(grouped)
    structure = fingerprint(profile)
    write_json_lf(staging / "tables.json", index)
    write_json_lf(staging / "profile.json", {"read": read_info, "tables": to_json(profile)})
    values = distinct_values(grouped)
    write_json_lf(staging / "values.json", values, ndigits=None)

    previous = latest_approved(customer_dir)
    if previous and previous.fingerprint == structure:
        mapping = previous.model_copy(deep=True)
        mapping.review = [f"same structure as the approved mapping v{previous.version}"]
        new = heuristics.unrecognised_values(mapping, contract, values)
        if new:
            mapping.status = "proposed"
            mapping.version = previous.version + 1
            mapping.review += [f"{key}: new spelling(s) {', '.join(v)}" for key, v in new.items()]
    else:
        mapping = heuristics.propose(profile, contract, structure)
        if use_llm:
            try:
                answer, tokens = llm.ask(profile, contract, client=llm_client)
                llm.merge(mapping, answer, profile, contract)
                mapping.review.append(f"LLM mapping used ({tokens})")
            except Exception as exc:  # noqa: BLE001 - the heuristic proposal stands alone
                mapping.review.append(f"LLM mapping unavailable: {type(exc).__name__}: {exc}")
        heuristics.finalize(mapping, profile, contract)
        heuristics.propose_values(mapping, contract, grouped)
        mapping.version = (previous.version + 1) if previous else 1
        mapping.status = "proposed"
    write_json_lf(staging / "mapping.proposed.json", mapping.model_dump(), ndigits=None)
    return ingestion, mapping


def approve(customer_dir: Path, ingestion: str, mapping_path: Path | None = None) -> Mapping:
    """Mark the proposed (or an edited) mapping approved, in the staging folder."""
    path = mapping_path or _staging(customer_dir, ingestion) / "mapping.proposed.json"
    mapping = Mapping.model_validate(read_json(path))
    mapping.status = "approved"
    write_json_lf(
        _staging(customer_dir, ingestion) / "mapping.proposed.json",
        mapping.model_dump(),
        ndigits=None,
    )
    return mapping


def apply(customer_dir: Path, ingestion: str, contract: IngestContract) -> dict:
    """Normalise, preflight and write data/<ingestion>/; then delete the export's originals."""
    layout = CustomerDir(customer_dir)
    staging = layout.staging(ingestion)
    mapping = Mapping.model_validate(read_json(staging / "mapping.proposed.json"))
    index = read_json(staging / "tables.json")
    tables = {name: pd.read_parquet(staging / "tables" / file) for name, file in index.items()}
    present = contract.groups_present(list(mapping.tables))
    kept = [t.name for t in contract.tables if t.group in present and t.name in mapping.tables]
    mapping.tables = {name: mapping.tables[name] for name in kept}
    entity_map = EntityMap(layout.entity_map)
    built = normalize(mapping, contract, tables, entity_map, load_secret(layout.secret))
    result = contract.preflight(built, present) if contract.preflight else {"spec_params": {}}
    data = layout.data(ingestion)
    write_raw_dir(
        built,
        contract.raw_schema(kept),
        data / "raw",
        {"source": f"customer export, ingestion {ingestion}", "mapping_version": mapping.version},
        float_format=RAW_FLOAT_FORMAT,
    )
    (data / "lookups").mkdir(parents=True, exist_ok=True)
    write_json_lf(data / "spec_params.json", result["spec_params"], ndigits=None)
    write_json_lf(data / "preflight.json", result.get("report", {}), ndigits=None)
    entity_map.save()
    previous = latest_approved(customer_dir)
    if not previous or previous.model_dump(exclude={"review"}) != mapping.model_dump(
        exclude={"review"}
    ):
        layout.mappings.mkdir(parents=True, exist_ok=True)
        write_json_lf(
            layout.mappings / f"v{mapping.version}.json",
            mapping.model_dump(),
            ndigits=None,
        )
    shutil.rmtree(layout.uploads(ingestion), ignore_errors=True)
    shutil.rmtree(staging, ignore_errors=True)
    return {"data_dir": data, **result}


def pipeline_command(
    customer_dir: Path,
    ingestion: str,
    contract: IngestContract,
    *,
    llm: bool = False,
    launcher: Sequence[str] = ("uv", "run", "python"),
    module: str = "pulse_flow.run",
) -> list[str]:
    """The pipeline run on an applied ingestion, into the customer's runs/ and artifacts/.

    ``launcher`` starts Python: ``uv run python`` from a checkout, ``(sys.executable,)`` inside
    the image (where ``uv run`` would try to sync the dev tools)."""
    layout = CustomerDir(customer_dir)
    data = layout.data(ingestion)
    return [
        *launcher,
        "-m",
        module,
        *([] if llm else ["--no-llm"]),
        "--spec",
        contract.spec_ref,
        "--spec-params",
        str(data / "spec_params.json"),
        "--data-dir",
        str(data),
        "--runs-dir",
        str(layout.runs),
        "--artifacts-dir",
        str(layout.artifacts),
    ]


def describe(result: dict) -> str:
    return json.dumps(result.get("report", {}), indent=2, ensure_ascii=False)
