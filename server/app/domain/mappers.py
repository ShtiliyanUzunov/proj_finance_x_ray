"""Bank → Transaction mappers, loaded from JSON.

Each file in `MAPPERS_DIR` is one mapper: a JSON object from internal
`Transaction` field name to the raw CSV column header that holds it for one
bank. Filename (without `.json`) is the mapper's name. To add a new bank,
drop a new JSON file in that directory.

`parse_file` reads a CSV, picks the first mapper whose columns all appear
in the header, and returns the mapper name plus the parsed `Transaction`
list.
"""

from __future__ import annotations

import csv
import json
import logging
from pathlib import Path

from ..config import BGN_TO_EUR_RATE, MAPPERS_DIR
from ..parsing import clean_header, clean_text, parse_amount, parse_date
from .transaction import Transaction

log = logging.getLogger(__name__)


def _load_mappers() -> dict[str, dict[str, str]]:
    """Load every `*.json` in MAPPERS_DIR. Sorted by filename for stable
    detection order — the first mapper whose columns all match a header wins.
    A malformed file is logged and skipped; one bad mapper shouldn't take
    down the whole app."""
    out: dict[str, dict[str, str]] = {}
    for path in sorted(MAPPERS_DIR.glob("*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as e:
            log.warning("Skipping mapper %s: %s", path.name, e)
            continue
        if not isinstance(data, dict) or not all(
            isinstance(k, str) and isinstance(v, str) for k, v in data.items()
        ):
            log.warning("Skipping mapper %s: expected JSON object of string→string", path.name)
            continue
        out[path.stem] = data
    return out


MAPPERS: dict[str, dict[str, str]] = _load_mappers()
log.warning(
    "[mappers] Loaded %d from %s: %s",
    len(MAPPERS),
    MAPPERS_DIR,
    list(MAPPERS.keys()),
)


def _resolve(mapper: dict[str, str], header: list[str]) -> dict[str, int] | None:
    """Map field → column index for this header, or None if any column is missing."""
    cleaned = [clean_header(c) for c in header]
    out: dict[str, int] = {}
    for field, col in mapper.items():
        try:
            out[field] = cleaned.index(clean_header(col))
        except ValueError:
            return None
    return out


def parse_file(path: Path) -> tuple[str, list[Transaction]]:
    """Parse `path` and return `(mapper_name, transactions)`.

    Raises ValueError if no mapper claims the file — silently returning
    nothing would hide real data from the user.
    """
    # `utf-8-sig` strips the BOM that some bank exports (DSK among them) prefix
    # to the file — leaving it in would corrupt the first column's name and
    # break exact-match header detection.
    with path.open("r", encoding="utf-8-sig", newline="", errors="replace") as f:
        reader = csv.reader(f)
        try:
            header = next(reader)
        except StopIteration:
            raise ValueError(f"Empty file: {path.name}")
        chosen: tuple[str, dict[str, int]] | None = None
        for name, mapper in MAPPERS.items():
            idx = _resolve(mapper, header)
            if idx is not None:
                chosen = (name, idx)
                break
        if chosen is None:
            raise ValueError(f"No mapper recognized the format of {path.name}")
        mapper_name, idx = chosen
        # Mappers whose name ends with "-bgn" are BGN-denominated exports;
        # amounts get converted to EUR here so the rest of the app stays
        # currency-agnostic (everything internal is EUR).
        rate = BGN_TO_EUR_RATE if mapper_name.endswith("-bgn") else 1.0
        transactions: list[Transaction] = []
        for row_idx, row in enumerate(reader):
            d = parse_date(row[idx["date"]]) if idx["date"] < len(row) else None
            if d is None:
                continue
            transactions.append(
                Transaction(
                    date=d,
                    debit=_convert(_amount(row, idx, "debit"), rate),
                    credit=_convert(_amount(row, idx, "credit"), rate),
                    description=_text(row, idx, "description"),
                    counterparty=_text(row, idx, "counterparty"),
                    counterparty_account=_text(row, idx, "counterparty_account"),
                    transaction_type=_text(row, idx, "transaction_type"),
                    reference=_text(row, idx, "reference"),
                    source=path.name,
                    row_index=row_idx,
                )
            )
        return mapper_name, transactions


def _text(row: list[str], idx: dict[str, int], field: str) -> str:
    i = idx.get(field)
    if i is None or i >= len(row):
        return ""
    return clean_text(row[i])


def _amount(row: list[str], idx: dict[str, int], field: str) -> float | None:
    i = idx.get(field)
    if i is None or i >= len(row):
        return None
    v = parse_amount(row[i])
    return round(v, 2) if v is not None else None


def _convert(amount: float | None, rate: float) -> float | None:
    if amount is None:
        return None
    return round(amount * rate, 2)
