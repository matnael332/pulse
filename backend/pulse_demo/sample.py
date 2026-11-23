"""The export a visitor without one of their own can download: small, invented, like a customer's.

The product's own synthetic world (``synth``) with fewer people and a shorter history, scrambled the
way customers export (``scramble``: Hebrew sheets, monthly files, Israeli dates, columns that must be
left out), with invented company names. Two optional data groups are left out on purpose, so the
demo also shows what the product says about missing data. About 1.7 MB: recognised, cleaned,
modelled and scored in about a minute in a browser.
"""

from __future__ import annotations

import tempfile
from pathlib import Path

from pulse_specs.workforce_saas.scramble import scramble
from pulse_specs.workforce_saas.synth import SynthConfig, write_dataset

CONFIG = SynthConfig(
    accounts=80,
    start_month="2023-08",
    emp_sigma=0.3,
    emp_cap=5,
    scheduling_share=0.2,
    absences_share=0.3,
)
LEFT_OUT = ("hours", "money")
FILENAME = "pulse-sample-export.zip"

KINDS = (
    "מאפיית",
    "מוסך",
    "סטודיו",
    "מרפאת",
    "גני",
    "נגריית",
    "קייטרינג",
    "מכבסת",
    "דפוס",
    "משתלת",
)
PLACES = ("הגליל", "הדרום", "השרון", "הכרמל", "הנגב", "הגולן", "השפלה", "העמק")
# invented names, one per account, neighbours of different kinds
NAMES = tuple(
    f"{KINDS[(i + i // len(KINDS)) % len(KINDS)]} {PLACES[i // len(KINDS)]}"
    for i in range(len(KINDS) * len(PLACES))
)


def build(out_dir: str | Path) -> Path:
    """Write the sample export into ``out_dir``; returns the zip."""
    out = Path(out_dir) / FILENAME
    out.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        raw = write_dataset(Path(tmp) / "synth", CONFIG)
        return scramble(raw, out, drop_groups=LEFT_OUT, rows_per_sheet=30_000, account_names=NAMES)
