import csv
import html
import io
import re
from datetime import date, datetime, timezone
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from config import DATA_DIR


class RenameRequest(BaseModel):
    name: str


_TAG_RE = re.compile(r"<[^>]*>")
_AMOUNT_RE = re.compile(r"^-?\d+(\.\d+)?$")
_DATE_FORMATS = (
    "%Y-%m-%d",
    "%d.%m.%Y",
    "%d/%m/%Y",
    "%d-%m-%Y",
    "%Y/%m/%d",
    "%Y.%m.%d",
)


def _clean_header(s: str) -> str:
    s = html.unescape(s or "")
    s = _TAG_RE.sub(" ", s)
    return " ".join(s.split()).lower()


def _clean_text(s: str) -> str:
    s = html.unescape(s or "")
    s = _TAG_RE.sub(" ", s)
    return " ".join(s.split())


def _parse_amount(s: str):
    s = (s or "").strip().replace(" ", "").replace(",", ".")
    if not _AMOUNT_RE.fullmatch(s):
        return None
    return float(s)


def _parse_date(s: str):
    s = (s or "").strip()
    if not s:
        return None
    s_head = s.split(" ")[0].split("T")[0]
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(s_head, fmt).date()
        except ValueError:
            continue
    return None


def _detect_date_col(cols: list[str]) -> int | None:
    candidates = [i for i, c in enumerate(cols) if "date" in c or "дата" in c or "datum" in c]
    if not candidates:
        return None
    for i in candidates:
        c = cols[i]
        if "operation" in c or "transaction" in c or "транзакция" in c or "операц" in c:
            return i
    return candidates[0]


def _summarize(path: Path) -> dict:
    """Return row count, debit/credit totals, and date range for a CSV file."""
    with path.open("r", encoding="utf-8", newline="", errors="replace") as f:
        reader = csv.reader(f)
        try:
            header = next(reader)
        except StopIteration:
            return {"rows": 0, "debit": None, "credit": None, "date_min": None, "date_max": None}
        cols = [_clean_header(c) for c in header]
        debit_idxs = [i for i, c in enumerate(cols) if "debit" in c or "дебит" in c]
        credit_idxs = [i for i, c in enumerate(cols) if "credit" in c or "кредит" in c]
        date_col = _detect_date_col(cols)
        debit_total = 0.0
        credit_total = 0.0
        any_debit = False
        any_credit = False
        date_min: date | None = None
        date_max: date | None = None
        row_count = 0
        for row in reader:
            row_count += 1
            for i in debit_idxs:
                if i < len(row):
                    v = _parse_amount(row[i])
                    if v is not None:
                        debit_total += v
                        any_debit = True
            for i in credit_idxs:
                if i < len(row):
                    v = _parse_amount(row[i])
                    if v is not None:
                        credit_total += v
                        any_credit = True
            if date_col is not None and date_col < len(row):
                d = _parse_date(row[date_col])
                if d:
                    if date_min is None or d < date_min:
                        date_min = d
                    if date_max is None or d > date_max:
                        date_max = d
    return {
        "rows": row_count,
        "debit": round(debit_total, 2) if any_debit else None,
        "credit": round(credit_total, 2) if any_credit else None,
        "date_min": date_min.isoformat() if date_min else None,
        "date_max": date_max.isoformat() if date_max else None,
    }


def _file_info(path: Path) -> dict:
    stat = path.stat()
    summary = _summarize(path)
    return {
        "name": path.name,
        "size": stat.st_size,
        "uploaded_at": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
        "rows": summary["rows"],
        "debit": summary["debit"],
        "credit": summary["credit"],
        "date_min": summary["date_min"],
        "date_max": summary["date_max"],
    }

app = FastAPI(title="Finance X-Ray API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _safe_csv_path(name: str) -> Path:
    candidate = (DATA_DIR / name).resolve()
    if DATA_DIR not in candidate.parents or candidate.suffix.lower() != ".csv":
        raise HTTPException(status_code=400, detail="Invalid filename")
    return candidate


def _unique_path(filename: str) -> Path:
    base = Path(filename).name
    if not base.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only .csv files are accepted")
    target = DATA_DIR / base
    if not target.exists():
        return target
    stem, suffix = target.stem, target.suffix
    i = 2
    while True:
        candidate = DATA_DIR / f"{stem}_{i}{suffix}"
        if not candidate.exists():
            return candidate
        i += 1


@app.get("/ping")
def ping():
    return {"status": "ok"}


@app.get("/summary")
def summary(
    from_: str | None = Query(default=None, alias="from"),
    to: str | None = Query(default=None),
):
    from_date = _parse_date(from_) if from_ else None
    to_date = _parse_date(to) if to else None
    if from_ and from_date is None:
        raise HTTPException(status_code=400, detail="Invalid 'from' date")
    if to and to_date is None:
        raise HTTPException(status_code=400, detail="Invalid 'to' date")

    date_min: date | None = None
    date_max: date | None = None
    total_rows = 0
    matching_rows = 0
    file_count = 0
    filtering = from_date is not None or to_date is not None

    for p in DATA_DIR.glob("*.csv"):
        file_count += 1
        with p.open("r", encoding="utf-8", newline="", errors="replace") as f:
            reader = csv.reader(f)
            try:
                header = next(reader)
            except StopIteration:
                continue
            cols = [_clean_header(c) for c in header]
            date_col = _detect_date_col(cols)
            for row in reader:
                total_rows += 1
                d = None
                if date_col is not None and date_col < len(row):
                    d = _parse_date(row[date_col])
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


@app.get("/timeline")
def timeline(
    from_: str | None = Query(default=None, alias="from"),
    to: str | None = Query(default=None),
    bucket: str = Query(default="day"),
):
    from_date = _parse_date(from_) if from_ else None
    to_date = _parse_date(to) if to else None
    if from_ and from_date is None:
        raise HTTPException(status_code=400, detail="Invalid 'from' date")
    if to and to_date is None:
        raise HTTPException(status_code=400, detail="Invalid 'to' date")
    if bucket not in ("day", "month"):
        raise HTTPException(status_code=400, detail="bucket must be 'day' or 'month'")

    buckets: dict[str, dict[str, float]] = {}
    for p in DATA_DIR.glob("*.csv"):
        with p.open("r", encoding="utf-8", newline="", errors="replace") as f:
            reader = csv.reader(f)
            try:
                header = next(reader)
            except StopIteration:
                continue
            cols = [_clean_header(c) for c in header]
            debit_idxs = [i for i, c in enumerate(cols) if "debit" in c or "дебит" in c]
            credit_idxs = [i for i, c in enumerate(cols) if "credit" in c or "кредит" in c]
            date_col = _detect_date_col(cols)
            if date_col is None:
                continue
            for row in reader:
                if date_col >= len(row):
                    continue
                d = _parse_date(row[date_col])
                if d is None:
                    continue
                if from_date and d < from_date:
                    continue
                if to_date and d > to_date:
                    continue
                key = d.isoformat() if bucket == "day" else d.strftime("%Y-%m")
                b = buckets.setdefault(key, {"debit": 0.0, "credit": 0.0})
                for i in debit_idxs:
                    if i < len(row):
                        v = _parse_amount(row[i])
                        if v is not None:
                            b["debit"] += v
                for i in credit_idxs:
                    if i < len(row):
                        v = _parse_amount(row[i])
                        if v is not None:
                            b["credit"] += v
    items = [
        {"period": k, "debit": round(v["debit"], 2), "credit": round(v["credit"], 2)}
        for k, v in sorted(buckets.items())
    ]
    return {"bucket": bucket, "items": items}


@app.get("/transactions")
def transactions(
    from_: str | None = Query(default=None, alias="from"),
    to: str | None = Query(default=None),
):
    from_date = _parse_date(from_) if from_ else None
    to_date = _parse_date(to) if to else None
    if from_ and from_date is None:
        raise HTTPException(status_code=400, detail="Invalid 'from' date")
    if to and to_date is None:
        raise HTTPException(status_code=400, detail="Invalid 'to' date")

    result: list[dict] = []
    for p in DATA_DIR.glob("*.csv"):
        with p.open("r", encoding="utf-8", newline="", errors="replace") as f:
            reader = csv.reader(f)
            try:
                header = next(reader)
            except StopIteration:
                continue
            cols = [_clean_header(c) for c in header]
            debit_idxs = [i for i, c in enumerate(cols) if "debit" in c or "дебит" in c]
            credit_idxs = [i for i, c in enumerate(cols) if "credit" in c or "кредит" in c]
            date_col = _detect_date_col(cols)
            if date_col is None:
                continue
            used = {date_col, *debit_idxs, *credit_idxs}
            for row in reader:
                if date_col >= len(row):
                    continue
                d = _parse_date(row[date_col])
                if d is None:
                    continue
                if from_date and d < from_date:
                    continue
                if to_date and d > to_date:
                    continue
                debit: float | None = None
                for i in debit_idxs:
                    if i < len(row):
                        v = _parse_amount(row[i])
                        if v is not None:
                            debit = (debit or 0.0) + v
                credit: float | None = None
                for i in credit_idxs:
                    if i < len(row):
                        v = _parse_amount(row[i])
                        if v is not None:
                            credit = (credit or 0.0) + v
                parts: list[str] = []
                for i, raw in enumerate(row):
                    if i in used:
                        continue
                    cleaned = _clean_text(raw)
                    if not cleaned:
                        continue
                    if _parse_amount(cleaned) is not None:
                        continue
                    parts.append(cleaned)
                description = " · ".join(parts[:2])
                result.append({
                    "date": d.isoformat(),
                    "description": description,
                    "debit": round(debit, 2) if debit is not None else None,
                    "credit": round(credit, 2) if credit is not None else None,
                    "source": p.name,
                })
    result.sort(key=lambda r: r["date"])
    return result


@app.post("/csv")
async def upload_csv(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing filename")
    target = _unique_path(file.filename)
    content = await file.read()
    target.write_bytes(content)
    return _file_info(target)


@app.get("/csv")
def list_csvs():
    return [
        _file_info(p)
        for p in sorted(DATA_DIR.glob("*.csv"), key=lambda f: f.stat().st_mtime, reverse=True)
    ]


@app.patch("/csv/{name}")
def rename_csv(name: str, body: RenameRequest):
    src = _safe_csv_path(name)
    if not src.exists():
        raise HTTPException(status_code=404, detail="File not found")
    new_name = Path(body.name).name
    if not new_name.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="New name must end with .csv")
    dst = _safe_csv_path(new_name)
    if dst == src:
        # No-op rename
        pass
    elif dst.exists():
        raise HTTPException(status_code=409, detail="A file with that name already exists")
    else:
        src.rename(dst)
    return _file_info(dst)


@app.get("/csv/{name}")
def get_csv(name: str):
    path = _safe_csv_path(name)
    if not path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    text = path.read_text(encoding="utf-8", errors="replace")
    reader = csv.reader(io.StringIO(text))
    rows = list(reader)
    if not rows:
        return {"name": path.name, "columns": [], "rows": []}
    columns, *data = rows
    return {"name": path.name, "columns": columns, "rows": data}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
