"""Rule matching: given a row and the configured rules, return all matches.

The matcher is deliberately stateless and pure — callers pass in everything it
needs. This keeps it trivially unit-testable and avoids any reload races with
the rules-file persistence layer.

Matching semantics:
- Patterns are substring matches against the **cleaned, lowercased** cell text
  of the rule's chosen columns. A pattern can be a single word or a multi-word
  phrase — it's matched literally as a substring.
- A rule matches a row if *any* pattern appears in *any* of the rule's columns
  that exist in this row. One column hit is enough.
- Rules are checked in caller-provided order (the on-disk order) so the first
  entry in the returned list is the priority-winning rule.
- A row may match zero rules (uncategorized) or multiple (conflict).
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

from ..models import Rule
from ..parsing import clean_text, read_csv_rows


@dataclass(frozen=True)
class RuleMatch:
    rule_id: str
    category: str


def match_row(
    rules: list[Rule],
    cleaned_header_lower: Sequence[str],
    row: list[str],
) -> list[RuleMatch]:
    """Return matches in rule priority order.

    `cleaned_header_lower` must be the file's header already passed through the
    same normalization used for rule columns (HTML/whitespace cleanup + lower).
    Computing it once per file and passing it in keeps this function O(rules *
    columns_per_rule) per row rather than re-cleaning per call.
    """
    matches: list[RuleMatch] = []
    for rule in rules:
        rule_cols = {c.lower() for c in rule.columns}
        if not rule_cols or not rule.patterns:
            continue
        col_indices = [i for i, h in enumerate(cleaned_header_lower) if h in rule_cols]
        if not col_indices:
            continue
        for i in col_indices:
            if i >= len(row):
                continue
            cell = clean_text(row[i]).lower()
            if not cell:
                continue
            if any(p in cell for p in rule.patterns):
                matches.append(RuleMatch(rule_id=rule.id, category=rule.category))
                break
    return matches


def _color_by_category(rules: list[Rule]) -> dict[str, str]:
    """Pick a representative color per leaf category: the first rule wins.

    Mirrors the client-side convention so colors stay consistent everywhere a
    category is rendered (rule list chips, group child chips, Inspect cells).
    """
    by_category: dict[str, str] = {}
    for r in rules:
        if r.color and r.category not in by_category:
            by_category[r.category] = r.color
    return by_category


def categorize_csv_file(path: Path, rules: list[Rule]) -> list[dict]:
    """Run the matcher against every data row in a CSV.

    Returns one entry per row (same order as `read_csv_rows`), each with the
    source row index, resolved category (or None), the category's color, and
    the full list of matched rule IDs so conflict info is preserved.
    """
    color_lookup = _color_by_category(rules)
    results: list[dict] = []
    for schema, row_idx, row in read_csv_rows(path):
        matches = match_row(rules, schema.headers_lower, row)
        category = matches[0].category if matches else None
        results.append(
            {
                "row_index": row_idx,
                "category": category,
                "color": color_lookup.get(category) if category else None,
                "matched_rule_ids": [m.rule_id for m in matches],
            }
        )
    return results
