"""Pure helpers for cleaning and parsing CSV cell content.

These functions have no I/O and no dependencies on the rest of the app. They
exist so router and service modules can share a single consistent interpretation
of dates, amounts, and column headers across the various CSV formats we accept.
"""

from __future__ import annotations

import csv
import html
import re
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Iterator

_TAG_RE = re.compile(r"<[^>]*>")
_AMOUNT_RE = re.compile(r"^-?\d+(\.\d+)?$")
_DATE_FORMATS = (
    "%Y-%m-%d",
    "%d.%m.%Y",
    "%d/%m/%Y",
    "%d-%m-%Y",
    "%Y/%m/%d",
    "%Y.%m.%d",
)


def clean_header(s: str) -> str:
    s = html.unescape(s or "")
    s = _TAG_RE.sub(" ", s)
    return " ".join(s.split()).lower()


def clean_text(s: str) -> str:
    s = html.unescape(s or "")
    s = _TAG_RE.sub(" ", s)
    return " ".join(s.split())


def parse_amount(s: str) -> float | None:
    s = (s or "").strip().replace(" ", "").replace(",", ".")
    if not _AMOUNT_RE.fullmatch(s):
        return None
    return float(s)


def parse_date(s: str) -> date | None:
    s = (s or "").strip()
    if not s:
        return None
    s_head = s.split(" ")[0].split("T")[0]
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(s_head, fmt).date()
        except ValueError:
            continue
    return None


def detect_date_col(cols: list[str]) -> int | None:
    candidates = [i for i, c in enumerate(cols) if "date" in c or "дата" in c or "datum" in c]
    if not candidates:
        return None
    for i in candidates:
        c = cols[i]
        if "operation" in c or "transaction" in c or "транзакция" in c or "операц" in c:
            return i
    return candidates[0]


@dataclass(frozen=True)
class CsvSchema:
    """Indices of semantic columns within a CSV's header row."""

    debit_idxs: list[int]
    credit_idxs: list[int]
    date_col: int | None


def detect_schema(header: list[str]) -> CsvSchema:
    cols = [clean_header(c) for c in header]
    return CsvSchema(
        debit_idxs=[i for i, c in enumerate(cols) if "debit" in c or "дебит" in c],
        credit_idxs=[i for i, c in enumerate(cols) if "credit" in c or "кредит" in c],
        date_col=detect_date_col(cols),
    )


def read_csv_rows(path: Path) -> Iterator[tuple[CsvSchema, int, list[str]]]:
    """Yield (schema, row_index, row) for every data row in a CSV.

    The schema is detected once from the header and emitted with each row so
    callers don't have to thread it separately. Empty files yield nothing.
    """
    with path.open("r", encoding="utf-8", newline="", errors="replace") as f:
        reader = csv.reader(f)
        try:
            header = next(reader)
        except StopIteration:
            return
        schema = detect_schema(header)
        for i, row in enumerate(reader):
            yield schema, i, row
