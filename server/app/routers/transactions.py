"""Analytical endpoints. All read from the in-memory transaction index."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, HTTPException, Query

from .. import index
from ..domain.transaction import Transaction
from ..parsing import parse_date
from ..services.categorization import RuleMatch, match_transaction
from ..services.rules import load_rule_models

router = APIRouter(tags=["transactions"])


def _parse_date_param(value: str | None, name: str) -> date | None:
    if value is None:
        return None
    parsed = parse_date(value)
    if parsed is None:
        raise HTTPException(status_code=400, detail=f"Invalid '{name}' date")
    return parsed


def _in_range(d: date, from_: date | None, to: date | None) -> bool:
    if from_ and d < from_:
        return False
    if to and d > to:
        return False
    return True


def _serialize(txn: Transaction, matches: list[RuleMatch]) -> dict:
    # `description` historically combined the first two free-text columns of
    # the source CSV ("Основание · Наредител"). The client still shows that
    # composite, so we synthesize it from the named fields here so the wire
    # contract doesn't change for the UI.
    parts = [p for p in (txn.description, txn.counterparty) if p]
    return {
        "date": txn.date.isoformat(),
        "description": " · ".join(parts[:2]),
        "debit": txn.debit,
        "credit": txn.credit,
        "source": txn.source,
        "row_index": txn.row_index,
        "category": matches[0].category if matches else None,
        "matched_rule_ids": [m.rule_id for m in matches],
    }


@router.get("/summary")
def summary(
    from_: str | None = Query(default=None, alias="from"),
    to: str | None = Query(default=None),
):
    from_date = _parse_date_param(from_, "from")
    to_date = _parse_date_param(to, "to")
    filtering = from_date is not None or to_date is not None

    date_min: date | None = None
    date_max: date | None = None
    total_rows = 0
    matching_rows = 0

    for txn in index.all_transactions():
        total_rows += 1
        if date_min is None or txn.date < date_min:
            date_min = txn.date
        if date_max is None or txn.date > date_max:
            date_max = txn.date
        if not filtering or _in_range(txn.date, from_date, to_date):
            matching_rows += 1

    return {
        "date_min": date_min.isoformat() if date_min else None,
        "date_max": date_max.isoformat() if date_max else None,
        "total_rows": total_rows,
        "matching_rows": matching_rows,
        "files": len(index.sources()),
    }


@router.get("/timeline")
def timeline(
    from_: str | None = Query(default=None, alias="from"),
    to: str | None = Query(default=None),
    bucket: str = Query(default="day"),
):
    from_date = _parse_date_param(from_, "from")
    to_date = _parse_date_param(to, "to")
    if bucket not in ("day", "month"):
        raise HTTPException(status_code=400, detail="bucket must be 'day' or 'month'")

    buckets: dict[str, dict[str, float]] = {}
    for txn in index.all_transactions():
        if not _in_range(txn.date, from_date, to_date):
            continue
        key = txn.date.isoformat() if bucket == "day" else txn.date.strftime("%Y-%m")
        b = buckets.setdefault(key, {"debit": 0.0, "credit": 0.0})
        if txn.debit is not None:
            b["debit"] += txn.debit
        if txn.credit is not None:
            b["credit"] += txn.credit
    items = [
        {"period": k, "debit": round(v["debit"], 2), "credit": round(v["credit"], 2)}
        for k, v in sorted(buckets.items())
    ]
    return {"bucket": bucket, "items": items}


@router.get("/transactions")
def transactions(
    from_: str | None = Query(default=None, alias="from"),
    to: str | None = Query(default=None),
):
    from_date = _parse_date_param(from_, "from")
    to_date = _parse_date_param(to, "to")
    rules = load_rule_models()

    result: list[dict] = []
    for txn in index.all_transactions():
        if not _in_range(txn.date, from_date, to_date):
            continue
        matches = match_transaction(rules, txn)
        result.append(_serialize(txn, matches))
    result.sort(key=lambda r: r["date"])
    return result


@router.get("/transactions/conflicts")
def transaction_conflicts(
    from_: str | None = Query(default=None, alias="from"),
    to: str | None = Query(default=None),
):
    """Transactions matched by more than one rule — the user resolves these."""
    from_date = _parse_date_param(from_, "from")
    to_date = _parse_date_param(to, "to")
    rules = load_rule_models()
    rule_by_id = {r.id: r for r in rules}

    conflicts: list[dict] = []
    for txn in index.all_transactions():
        if not _in_range(txn.date, from_date, to_date):
            continue
        matches = match_transaction(rules, txn)
        if len(matches) <= 1:
            continue
        entry = _serialize(txn, matches)
        entry["matched_rules"] = [
            {"id": m.rule_id, "category": m.category, "patterns": rule_by_id[m.rule_id].patterns}
            for m in matches
            if m.rule_id in rule_by_id
        ]
        conflicts.append(entry)
    conflicts.sort(key=lambda r: r["date"])
    return conflicts
