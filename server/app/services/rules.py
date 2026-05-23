"""Persistence for categorization rules.

Rules live as a JSON list at `DATA_DIR/rules.json`. The file is written with
`ensure_ascii=False` so non-ASCII column names (e.g. Cyrillic headers) remain
human-readable on disk.
"""

from __future__ import annotations

import json

from ..config import DATA_DIR
from ..models import Rule

_RULES_PATH = DATA_DIR / "rules.json"


def load_rule_models() -> list[Rule]:
    """Load rules as validated `Rule` instances, silently dropping malformed entries.

    Used by callers that need to apply rules (matchers, categorization endpoints).
    Corruption of a single entry should never take down endpoints that show data —
    the user can still see transactions, just without that broken rule applied.
    """
    parsed: list[Rule] = []
    for raw in load_rules():
        try:
            parsed.append(Rule(**raw))
        except Exception:
            continue
    return parsed


def load_rules() -> list[dict]:
    if not _RULES_PATH.exists():
        return []
    try:
        data = json.loads(_RULES_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    if not isinstance(data, list):
        return []
    return data


def save_rules(rules: list[dict]) -> None:
    _RULES_PATH.write_text(json.dumps(rules, ensure_ascii=False, indent=2), encoding="utf-8")
