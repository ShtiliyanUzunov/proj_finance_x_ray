import csv
import io
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile

from .. import index
from ..models import RenameRequest
from ..services.categorization import color_by_category, match_transaction
from ..services.csv_files import file_info, list_files, safe_csv_path, unique_path
from ..services.rules import load_rule_models

router = APIRouter(tags=["csv"])


@router.post("/csv")
async def upload_csv(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing filename")
    target = unique_path(file.filename)
    content = await file.read()
    target.write_bytes(content)
    index.on_added(target)
    return file_info(target)


@router.get("/csv")
def list_csvs():
    return list_files()


@router.patch("/csv/{name}")
def rename_csv(name: str, body: RenameRequest):
    src = safe_csv_path(name)
    if not src.exists():
        raise HTTPException(status_code=404, detail="File not found")
    new_name = Path(body.name).name
    if not new_name.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="New name must end with .csv")
    dst = safe_csv_path(new_name)
    if dst == src:
        pass
    elif dst.exists():
        raise HTTPException(status_code=409, detail="A file with that name already exists")
    else:
        src.rename(dst)
        index.on_renamed(src.name, dst.name)
    return file_info(dst)


@router.delete("/csv/{name}")
def delete_csv(name: str):
    path = safe_csv_path(name)
    if not path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    path.unlink()
    index.on_removed(name)
    return {"deleted": name}


@router.get("/csv/{name}")
def get_csv(name: str):
    path = safe_csv_path(name)
    if not path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    text = path.read_text(encoding="utf-8", errors="replace")
    reader = csv.reader(io.StringIO(text))
    rows = list(reader)
    if not rows:
        return {"name": path.name, "columns": [], "rows": []}
    columns, *data = rows
    return {"name": path.name, "columns": columns, "rows": data}


@router.get("/csv/{name}/categories")
def get_csv_categories(name: str):
    """Per-row categorization for a single CSV file.

    Row indices align with positions in `GET /csv/{name}`'s `rows[]`, so the
    client merges by row index without extra bookkeeping. Sourced from the
    index; rows the mapper skipped (e.g. no parseable date) won't appear.
    """
    path = safe_csv_path(name)
    if not path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    rules = load_rule_models()
    color_lookup = color_by_category(rules)
    categories = []
    for txn in index.transactions_for(name):
        matches = match_transaction(rules, txn)
        category = matches[0].category if matches else None
        categories.append(
            {
                "row_index": txn.row_index,
                "category": category,
                "color": color_lookup.get(category) if category else None,
                "matched_rule_ids": [m.rule_id for m in matches],
            }
        )
    return {"categories": categories}
