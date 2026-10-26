"""A customer's folder on our server (``/srv/pulse/customers/<slug>/``), in one place.

    uploads/<ingestion>/         the uploaded zip              (deleted by apply)
    staging/<ingestion>/         extracted files, tables of strings (parquet), profile.json,
                                 mapping.proposed.json         (deleted by apply)
    mappings/v<N>.json           every approved mapping, by version
    data/<ingestion>/raw/        the normalised raw layer (CSV + raw_schema.json + manifest.json)
    data/<ingestion>/lookups/    empty (the spec needs none)
    data/<ingestion>/spec_params.json, preflight.json
    runs/<run id>/               every pipeline run (--runs-dir)
    artifacts/                   the last promoted run, what the dashboard and the API read
    entity_map.csv               pseudonym <-> the customer's account id and name
    secret.key                   the key of the employee, site and device hashes

Every ingestion has its own data folder; the synthetic demo is the ingestion ``synth``.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

SYNTH_INGESTION = "synth"


@dataclass(frozen=True)
class CustomerDir:
    root: Path

    def uploads(self, ingestion: str) -> Path:
        return self.root / "uploads" / ingestion

    def staging(self, ingestion: str) -> Path:
        return self.root / "staging" / ingestion

    @property
    def mappings(self) -> Path:
        return self.root / "mappings"

    def data(self, ingestion: str) -> Path:
        return self.root / "data" / ingestion

    @property
    def runs(self) -> Path:
        return self.root / "runs"

    @property
    def artifacts(self) -> Path:
        return self.root / "artifacts"

    @property
    def entity_map(self) -> Path:
        return self.root / "entity_map.csv"

    @property
    def secret(self) -> Path:
        return self.root / "secret.key"

    def create(self) -> CustomerDir:
        """The folders a new customer starts with; safe to call again."""
        for path in (self.root / "data", self.runs, self.artifacts):
            path.mkdir(parents=True, exist_ok=True)
        return self
