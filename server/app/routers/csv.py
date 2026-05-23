import csv
import io
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile

from ..models import RenameRequest
from ..services.categorization import categorize_csv_file
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
    return file_info(dst)


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

    Returned in source-row order. Row indices are zero-based and align with
    the indices used by `GET /csv/{name}` (i.e. the position in `rows[]`),
    so the client can merge by row index without any extra bookkeeping.
    """
    path = safe_csv_path(name)
    if not path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return {"categories": categorize_csv_file(path, load_rule_models())}
