"""Field names available on the internal Transaction model.

The client's rule editor uses these as the picker for `rule.columns`. Returns
every field on `Transaction` — the UI decides which ones are sensible to
present as text-match targets.
"""

from __future__ import annotations

from dataclasses import fields

from fastapi import APIRouter

from ..domain.transaction import Transaction

router = APIRouter(tags=["schema"])


@router.get("/schema")
def schema():
    return {"columns": [f.name for f in fields(Transaction)]}
