"""File-system operations and per-file metadata for uploaded CSVs.

Metadata (row count, debit/credit totals, date range) is derived from the
in-memory transaction index rather than re-walked from disk. The filesystem
is still the source of truth for existence, size, and mtime.
"""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from fastapi import HTTPException

from .. import index
from ..config import DATA_DIR


def safe_csv_path(name: str) -> Path:
    """Resolve `name` inside DATA_DIR, rejecting traversal and non-CSV files."""
    candidate = (DATA_DIR / name).resolve()
    if DATA_DIR not in candidate.parents or candidate.suffix.lower() != ".csv":
        raise HTTPException(status_code=400, detail="Invalid filename")
    return candidate


def unique_path(filename: str) -> Path:
    """Pick a non-colliding destination path inside DATA_DIR (foo.csv → foo_2.csv)."""
    base = Path(filename).name
    if not base.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only .csv files are accepted")
    target = DATA_DIR / base
    if not target.exists():
        return target
    stem, suffix = target.stem, target.suffix
    i = 2
    while True:
        candidate = DATA_DIR / f"{stem}_{i}{suffix}"
        if not candidate.exists():
            return candidate
        i += 1


def file_info(path: Path) -> dict:
    stat = path.stat()
    txns = index.transactions_for(path.name)
    debit_total = sum(t.debit for t in txns if t.debit is not None)
    credit_total = sum(t.credit for t in txns if t.credit is not None)
    any_debit = any(t.debit is not None for t in txns)
    any_credit = any(t.credit is not None for t in txns)
    dates = [t.date for t in txns]
    return {
        "name": path.name,
        "size": stat.st_size,
        "uploaded_at": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
        "rows": len(txns),
        "debit": round(debit_total, 2) if any_debit else None,
        "credit": round(credit_total, 2) if any_credit else None,
        "date_min": min(dates).isoformat() if dates else None,
        "date_max": max(dates).isoformat() if dates else None,
        "mapper": index.mapper_for(path.name),
    }


def list_files() -> list[dict]:
    return [
        file_info(p)
        for p in sorted(DATA_DIR.glob("*.csv"), key=lambda f: f.stat().st_mtime, reverse=True)
    ]
