import csv

from fastapi import APIRouter

from ..parsing import clean_text
from ..services.csv_files import iter_csv_paths

router = APIRouter(tags=["schema"])


@router.get("/schema")
def schema():
    """Return the union of column names across all uploaded CSVs.

    Columns are deduplicated case-insensitively after HTML/whitespace cleanup,
    preserving the first original-case spelling encountered.
    """
    seen: dict[str, str] = {}
    order: list[str] = []
    for p in iter_csv_paths():
        with p.open("r", encoding="utf-8", newline="", errors="replace") as f:
            reader = csv.reader(f)
            try:
                header = next(reader)
            except StopIteration:
                continue
        for raw in header:
            cleaned = clean_text(raw)
            if not cleaned:
                continue
            key = cleaned.lower()
            if key in seen:
                continue
            seen[key] = cleaned
            order.append(cleaned)
    return {"columns": order}
