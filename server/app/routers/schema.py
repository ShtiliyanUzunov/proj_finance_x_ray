"""Field names available on the internal Transaction model.

The client's rule editor uses `columns` as the picker for `rule.columns` and
`labels` to display each field with its bank-specific column name (e.g.
`description` → "Основание" under the DSK mapper). Rules still store the
internal field name as the value; labels are display-only.
"""

from __future__ import annotations

from dataclasses import fields

from fastapi import APIRouter

from ..domain.mappers import MAPPERS
from ..domain.transaction import Transaction

router = APIRouter(tags=["schema"])


@router.get("/schema")
def schema():
    field_names = [f.name for f in fields(Transaction)]
    # Labels come from the first registered mapper (DSK today). Fields not in
    # the mapper — e.g. `source`, `row_index` — fall back to the internal name
    # so the picker still has something legible to render.
    default_mapper = next(iter(MAPPERS.values()), {})
    labels = {name: default_mapper.get(name, name) for name in field_names}
    return {"columns": field_names, "labels": labels}
