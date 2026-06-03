"""Pure helpers for cleaning and parsing CSV cell content.

Used by per-bank mappers in `domain.mappers` and by query-param parsing in
the API routers. No I/O, no app state — trivially unit-testable.
"""

from __future__ import annotations

import html
import re
from datetime import date, datetime

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
