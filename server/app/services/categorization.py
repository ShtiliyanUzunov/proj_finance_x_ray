"""Rule matching against the internal Transaction model.

Pure and stateless: callers pass in everything. Matching semantics:
- Patterns are lowercased substring matches against the named Transaction
  fields listed in `rule.columns` (e.g. "description", "counterparty").
- A rule matches if any pattern appears in any of its named fields.
- Rules are checked in caller-provided order; first match wins.
- A transaction may match zero (uncategorized) or multiple (conflict) rules.
"""

from __future__ import annotations

from dataclasses import dataclass

from ..domain.transaction import Transaction
from ..models import Rule


@dataclass(frozen=True)
class RuleMatch:
    rule_id: str
    category: str


def match_transaction(rules: list[Rule], txn: Transaction) -> list[RuleMatch]:
    matches: list[RuleMatch] = []
    for rule in rules:
        if not rule.columns or not rule.patterns:
            continue
        for field in rule.columns:
            cell = (getattr(txn, field, "") or "").lower()
            if not cell:
                continue
            if any(p in cell for p in rule.patterns):
                matches.append(RuleMatch(rule_id=rule.id, category=rule.category))
                break
    return matches


def color_by_category(rules: list[Rule]) -> dict[str, str]:
    """First rule with a color wins per category. Mirrors the client convention."""
    by_category: dict[str, str] = {}
    for r in rules:
        if r.color and r.category not in by_category:
            by_category[r.category] = r.color
    return by_category
