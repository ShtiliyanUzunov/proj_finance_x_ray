# Finance X-Ray API

FastAPI backend.

## Setup

```powershell
cd server
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

## Run

From the project root:

```powershell
python .\server\main.py
```

- API: http://localhost:8000
- Docs: http://localhost:8000/docs

## Configuration

Copy `.env.example` to `.env` and adjust if needed:

- `DATA_DIR` — folder for uploaded CSVs (default `../data`, i.e. the project-root `data/` folder). Relative paths resolve against `server/`.

## Layout

```
server/
  main.py                  # uvicorn entrypoint
  app/
    main.py                # FastAPI() instance, middleware, router includes
    config.py              # DATA_DIR + env loading
    models.py              # Pydantic request/response schemas
    parsing.py             # text/amount/date helpers, CsvSchema, read_csv_rows
    services/
      csv_files.py         # path safety, summarize, file_info, listing
      rules.py             # rules.json load/save
    routers/
      health.py            # /ping
      csv.py               # /csv*
      rules.py             # /rules
      schema.py            # /schema
      transactions.py      # /summary, /timeline, /transactions
```

Add a new endpoint by dropping a router in `app/routers/` and including it in `app/main.py`.

## Endpoints

- `GET /ping` — health check
- `POST /csv` — upload a CSV (`multipart/form-data`, field `file`). Auto-renames on collision (`name_2.csv`).
- `GET /csv` — list uploaded CSVs with name, size, upload time, row count
- `GET /csv/{name}` — return the CSV as `{name, columns, rows}` (rows are arrays of strings)
- `PATCH /csv/{name}` — rename a CSV (`{name: "new.csv"}`)
- `GET /schema` — union of column names across all uploaded CSVs
- `GET /rules` — list categorization rules
- `PUT /rules` — replace the full rules list
- `GET /summary` — row counts and date range (optional `from`/`to`)
- `GET /timeline` — debit/credit totals bucketed by `day` or `month`
- `GET /transactions` — flattened transaction list across all CSVs
