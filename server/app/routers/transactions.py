"""Endpoints that aggregate or stream parsed transactions across all CSVs."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, HTTPException, Query

from ..parsing import clean_text, parse_amount, parse_date, read_csv_rows
from ..services.categorization import RuleMatch, match_row
from ..services.csv_files import iter_csv_paths
from ..services.rules import load_rule_models

router = APIRouter(tags=["transactions"])


def _parse_date_param(value: str | None, name: str) -> date | None:
    if value is None:
        return None
    parsed = parse_date(value)
    if parsed is None:
        raise HTTPException(status_code=400, detail=f"Invalid '{name}' date")
    return parsed


def _build_transaction(
    p, schema, row_idx: int, row: list[str], d: date, matches: list[RuleMatch]
) -> dict:
    debit: float | None = None
    for i in schema.debit_idxs:
        if i < len(row):
            v = parse_amount(row[i])
            if v is not None:
                debit = (debit or 0.0) + v
    credit: float | None = None
    for i in schema.credit_idxs:
        if i < len(row):
            v = parse_amount(row[i])
            if v is not None:
                credit = (credit or 0.0) + v
    used = {schema.date_col, *schema.debit_idxs, *schema.credit_idxs}
    parts: list[str] = []
    for i, raw in enumerate(row):
        if i in used:
            continue
        cleaned = clean_text(raw)
        if not cleaned:
            continue
        if parse_amount(cleaned) is not None:
            continue
        parts.append(cleaned)
    description = " · ".join(parts[:2])
    return {
        "date": d.isoformat(),
        "description": description,
        "debit": round(debit, 2) if debit is not None else None,
        "credit": round(credit, 2) if credit is not None else None,
        "source": p.name,
        "row_index": row_idx,
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

    date_min: date | None = None
    date_max: date | None = None
    total_rows = 0
    matching_rows = 0
    file_count = 0
    filtering = from_date is not None or to_date is not None

    for p in iter_csv_paths():
        file_count += 1
        for schema, _idx, row in read_csv_rows(p):
            total_rows += 1
            d = None
            if schema.date_col is not None and schema.date_col < len(row):
                d = parse_date(row[schema.date_col])
            if d:
                if date_min is None or d < date_min:
                    date_min = d
                if date_max is None or d > date_max:
                    date_max = d
            if not filtering:
                matching_rows += 1
            elif d is not None:
                if (from_date is None or d >= from_date) and (to_date is None or d <= to_date):
                    matching_rows += 1

    return {
        "date_min": date_min.isoformat() if date_min else None,
        "date_max": date_max.isoformat() if date_max else None,
        "total_rows": total_rows,
        "matching_rows": matching_rows,
        "files": file_count,
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
    for p in iter_csv_paths():
        for schema, _idx, row in read_csv_rows(p):
            if schema.date_col is None or schema.date_col >= len(row):
                continue
            d = parse_date(row[schema.date_col])
            if d is None:
                continue
            if from_date and d < from_date:
                continue
            if to_date and d > to_date:
                continue
            key = d.isoformat() if bucket == "day" else d.strftime("%Y-%m")
            b = buckets.setdefault(key, {"debit": 0.0, "credit": 0.0})
            for i in schema.debit_idxs:
                if i < len(row):
                    v = parse_amount(row[i])
                    if v is not None:
                        b["debit"] += v
            for i in schema.credit_idxs:
                if i < len(row):
                    v = parse_amount(row[i])
                    if v is not None:
                        b["credit"] += v
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
    for p in iter_csv_paths():
        for schema, row_idx, row in read_csv_rows(p):
            if schema.date_col is None or schema.date_col >= len(row):
                continue
            d = parse_date(row[schema.date_col])
            if d is None:
                continue
            if from_date and d < from_date:
                continue
            if to_date and d > to_date:
                continue
            matches = match_row(rules, schema.headers_lower, row)
            result.append(_build_transaction(p, schema, row_idx, row, d, matches))
    result.sort(key=lambda r: r["date"])
    return result


@router.get("/transactions/conflicts")
def transaction_conflicts(
    from_: str | None = Query(default=None, alias="from"),
    to: str | None = Query(default=None),
):
    """Return transactions matched by more than one rule.

    These are the rows where the user's rules overlap — they need to be
    resolved by tightening patterns, narrowing columns, or reordering rule
    priority so the intended rule wins.
    """
    from_date = _parse_date_param(from_, "from")
    to_date = _parse_date_param(to, "to")
    rules = load_rule_models()
    rule_by_id = {r.id: r for r in rules}

    conflicts: list[dict] = []
    for p in iter_csv_paths():
        for schema, row_idx, row in read_csv_rows(p):
            if schema.date_col is None or schema.date_col >= len(row):
                continue
            d = parse_date(row[schema.date_col])
            if d is None:
                continue
            if from_date and d < from_date:
                continue
            if to_date and d > to_date:
                continue
            matches = match_row(rules, schema.headers_lower, row)
            if len(matches) <= 1:
                continue
            txn = _build_transaction(p, schema, row_idx, row, d, matches)
            txn["matched_rules"] = [
                {"id": m.rule_id, "category": m.category, "patterns": rule_by_id[m.rule_id].patterns}
                for m in matches
                if m.rule_id in rule_by_id
            ]
            conflicts.append(txn)
    conflicts.sort(key=lambda r: r["date"])
    return conflicts
