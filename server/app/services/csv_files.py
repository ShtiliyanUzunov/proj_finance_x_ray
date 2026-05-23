"""File-system operations and per-file metadata for uploaded CSVs."""

from __future__ import annotations

from datetime import date, datetime, timezone
from pathlib import Path

from fastapi import HTTPException

from ..config import DATA_DIR
from ..parsing import parse_amount, parse_date, read_csv_rows


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


def summarize(path: Path) -> dict:
    """Return row count, debit/credit totals, and date range for a CSV file."""
    debit_total = 0.0
    credit_total = 0.0
    any_debit = False
    any_credit = False
    date_min: date | None = None
    date_max: date | None = None
    row_count = 0
    for schema, _row_idx, row in read_csv_rows(path):
        row_count += 1
        for i in schema.debit_idxs:
            if i < len(row):
                v = parse_amount(row[i])
                if v is not None:
                    debit_total += v
                    any_debit = True
        for i in schema.credit_idxs:
            if i < len(row):
                v = parse_amount(row[i])
                if v is not None:
                    credit_total += v
                    any_credit = True
        if schema.date_col is not None and schema.date_col < len(row):
            d = parse_date(row[schema.date_col])
            if d:
                if date_min is None or d < date_min:
                    date_min = d
                if date_max is None or d > date_max:
                    date_max = d
    return {
        "rows": row_count,
        "debit": round(debit_total, 2) if any_debit else None,
        "credit": round(credit_total, 2) if any_credit else None,
        "date_min": date_min.isoformat() if date_min else None,
        "date_max": date_max.isoformat() if date_max else None,
    }


def file_info(path: Path) -> dict:
    stat = path.stat()
    summary = summarize(path)
    return {
        "name": path.name,
        "size": stat.st_size,
        "uploaded_at": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
        "rows": summary["rows"],
        "debit": summary["debit"],
        "credit": summary["credit"],
        "date_min": summary["date_min"],
        "date_max": summary["date_max"],
    }


def list_files() -> list[dict]:
    return [
        file_info(p)
        for p in sorted(DATA_DIR.glob("*.csv"), key=lambda f: f.stat().st_mtime, reverse=True)
    ]


def iter_csv_paths():
    """Iterate uploaded CSV paths in deterministic order."""
    return sorted(DATA_DIR.glob("*.csv"))
