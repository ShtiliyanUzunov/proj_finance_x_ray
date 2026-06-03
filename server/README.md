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
    config.py              # DATA_DIR (CSV uploads) + CLASSIFICATION_DIR + env loading
    models.py              # Pydantic request/response schemas
    parsing.py             # text/amount/date cleaning helpers
    index.py               # in-memory Transaction index (built at startup)
    domain/
      transaction.py       # internal, bank-agnostic Transaction dataclass
      mappers.py           # CSV → Transaction; loads ../../mappers/*.json
    services/
      csv_files.py         # path safety, file_info, listing
      categorization.py    # rule matching against Transaction fields
      rules.py             # classification/rules.json load/save
      groups.py            # classification/groups.json load/save + validation
    routers/
      health.py            # /ping
      csv.py               # /csv*
      rules.py             # /rules
      schema.py            # /schema (Transaction field names)
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
- `GET /rules` — list categorization rules (each rule defines one leaf category)
- `PUT /rules` — replace the full rules list
- `GET /groups` — list category groups (each group bundles leaves and/or other groups; no rules attach to a group)
- `PUT /groups` — replace the full groups list. Rejects empty names, name collisions with rule categories, and cycles in the group→group reference graph.
- `GET /summary` — row counts and date range (optional `from`/`to`)
- `GET /timeline` — debit/credit totals bucketed by `day` or `month`
- `GET /transactions` — flattened transaction list across all CSVs, each row tagged with `category` (first matching rule) and `matched_rule_ids`
- `GET /transactions/conflicts` — only transactions matched by more than one rule, with full per-match detail in `matched_rules`
