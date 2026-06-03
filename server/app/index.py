"""In-memory transaction index.

Built once at app start from every CSV in DATA_DIR. All analytical endpoints
read from here; nothing re-parses CSVs per request. The index is mutated only
by file-lifecycle hooks (`on_added`, `on_removed`, `on_renamed`) invoked by
the csv router. FastAPI runs each request in its own thread but Python's GIL
plus dict atomicity makes the read-mostly access pattern here safe without
explicit locking. If we ever go multi-process, this moves to SQLite.
"""

from __future__ import annotations

import logging
from pathlib import Path

from .config import DATA_DIR
from .domain.mappers import parse_file
from .domain.transaction import Transaction

log = logging.getLogger(__name__)

_by_source: dict[str, list[Transaction]] = {}
_mapper_by_source: dict[str, str] = {}


def build() -> None:
    """Parse every CSV in DATA_DIR. Idempotent; safe to call again."""
    _by_source.clear()
    _mapper_by_source.clear()
    for path in sorted(DATA_DIR.glob("*.csv")):
        _try_load(path)


def on_added(path: Path) -> None:
    _try_load(path)


def on_removed(name: str) -> None:
    _by_source.pop(name, None)
    _mapper_by_source.pop(name, None)


def on_renamed(old: str, new: str) -> None:
    if old in _by_source:
        _by_source[new] = _by_source.pop(old)
    if old in _mapper_by_source:
        _mapper_by_source[new] = _mapper_by_source.pop(old)


def all_transactions() -> list[Transaction]:
    return [t for txns in _by_source.values() for t in txns]


def transactions_for(source: str) -> list[Transaction]:
    return _by_source.get(source, [])


def mapper_for(source: str) -> str | None:
    return _mapper_by_source.get(source)


def sources() -> list[str]:
    return list(_by_source.keys())


def _try_load(path: Path) -> None:
    """Load one file, logging and skipping on unrecognized format.

    A single malformed/unsupported CSV shouldn't crash startup or upload —
    the user still wants to use whatever else is in the data directory.
    """
    try:
        mapper_name, txns = parse_file(path)
    except ValueError as e:
        log.warning("Skipping %s: %s", path.name, e)
        return
    _by_source[path.name] = txns
    _mapper_by_source[path.name] = mapper_name
