"""The files the demo site ships beside the web build.

    uv run python -m pulse_demo.pack web/public-demo

Writes, under OUT_DIR:

    py/            Pyodide (Python for the browser) and the packages the pipeline needs, at pinned
                   versions, each file checked against its sha256
    py/pulse.zip   our own Python: the modules the runner uses, and openpyxl to read Excel
    sample/        the sample export a visitor can download, and its results for a phone

Everything is served from the demo's own address, so the page may forbid every other one. Nothing
here is committed: the build makes it.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import sys
import tempfile
import urllib.request
import zipfile
from pathlib import Path

from pulse_core.io import write_json_lf
from pulse_demo import runner, sample

PYODIDE = "0.29.3"  # Python 3.13, pandas 2.3.3, as the pipeline's own
SOURCE = f"https://cdn.jsdelivr.net/pyodide/v{PYODIDE}/full/"
LOCK = "pyodide-lock.json"
CORE = {
    "pyodide.mjs": "23213d27e9dacbda6f25f955fb38dabfc40ada082c04ee253047ea5dddcaa3b5",
    "pyodide.asm.js": "1263f02b5b26099b96112378156f242dd98b39a8201ba7765e5fe3d455c5ce91",
    "pyodide.asm.wasm": "e2f4ee75b325e35eb31bfb8c613d4dd5098f5502c156a97847686875b5025480",
    "python_stdlib.zip": "4298b6ee445cb724c3973437da47789752b9e6ff4e26619026b283ec801fc46b",
    LOCK: "3256ffc76388de0e37f4b34d42ab484268d1afc675179ff97b2a5bb14f84ccac",
}
PACKAGES = ("numpy", "pandas", "scikit-learn", "pydantic", "charset-normalizer")

# what the runner imports: whole packages of the pipeline, and of the server only these modules
OURS = ("pulse_core", "pulse_ingest", "pulse_specs")
MODULES = (
    "pulse_demo/__init__.py",
    "pulse_demo/runner.py",
    "pulse_server/__init__.py",
    "pulse_server/errors.py",
    "pulse_server/scores.py",
    "pulse_server/steps.py",
    "pulse_server/view.py",
)
PURE = ("openpyxl", "et_xmlfile")  # pure Python, not among Pyodide's packages
BACKEND = Path(__file__).resolve().parents[1]
STAMP = (2026, 1, 1, 0, 0, 0)  # zip entries carry no time: the same sources pack the same


def _checked(body: bytes, sha256: str, name: str) -> bytes:
    if hashlib.sha256(body).hexdigest() != sha256:
        raise RuntimeError(f"{name}: not the pinned file (sha256 differs)")
    return body


def _fetch(name: str, sha256: str, out: Path) -> None:
    target = out / name
    if target.exists():
        _checked(target.read_bytes(), sha256, name)
        return
    with urllib.request.urlopen(SOURCE + name, timeout=300) as answer:  # noqa: S310 - https, pinned
        target.write_bytes(_checked(answer.read(), sha256, name))


def needed(lock: dict) -> dict[str, dict]:
    """The lock's entries of PACKAGES and everything they depend on."""
    packages = {_plain(name): entry for name, entry in lock["packages"].items()}
    found: dict[str, dict] = {}
    waiting = [_plain(name) for name in PACKAGES]
    while waiting:
        name = waiting.pop()
        if name not in found:
            found[name] = packages[name]
            waiting += [_plain(d) for d in packages[name]["depends"]]
    return found


def _plain(name: str) -> str:
    return name.replace("_", "-").lower()


def fetch_pyodide(out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    for name, sha256 in CORE.items():
        _fetch(name, sha256, out)
    lock = json.loads((out / LOCK).read_text(encoding="utf-8"))
    for entry in needed(lock).values():
        _fetch(entry["file_name"], entry["sha256"], out)


def list_files(out: Path) -> None:
    """files.json: every file Python needs and its size, so the page can show how much is left."""
    files = [
        {"name": p.name, "bytes": p.stat().st_size}
        for p in sorted(out.iterdir())
        if p.name != "files.json"
    ]
    write_json_lf(out / "files.json", files, ndigits=None)


def _sources() -> dict[str, Path]:
    files = {name: BACKEND / name for name in MODULES}
    for package in OURS:
        for path in sorted((BACKEND / package).rglob("*")):
            if path.is_file() and "__pycache__" not in path.parts:
                files[path.relative_to(BACKEND).as_posix()] = path
    for package in PURE:
        root = Path(importlib.util.find_spec(package).origin).parent
        for path in sorted(root.rglob("*.py")):
            files[path.relative_to(root.parent).as_posix()] = path
    return files


def pack_python(target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(target, "w") as archive:
        for name, path in sorted(_sources().items()):
            entry = zipfile.ZipInfo(name, STAMP)
            entry.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(entry, path.read_bytes())


def pack_sample(out: Path) -> None:
    export = sample.build(out)
    with tempfile.TemporaryDirectory() as tmp:
        answer = runner.precompute(export, Path(tmp) / "demo")
    write_json_lf(out / "results.json", answer, ndigits=None)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="pulse_demo.pack", description=__doc__.splitlines()[0])
    parser.add_argument("out_dir", type=Path)
    out = parser.parse_args(argv).out_dir
    pack_python(out / "py" / "pulse.zip")
    fetch_pyodide(out / "py")
    list_files(out / "py")
    pack_sample(out / "sample")
    size = sum(p.stat().st_size for p in out.rglob("*") if p.is_file())
    print(f"{out}: {size / 1048576:.1f} MB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
