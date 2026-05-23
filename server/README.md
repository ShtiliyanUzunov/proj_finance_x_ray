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

## Endpoints

- `GET /ping` — health check
- `POST /csv` — upload a CSV (`multipart/form-data`, field `file`). Auto-renames on collision (`name_2.csv`).
- `GET /csv` — list uploaded CSVs with name, size, upload time, row count
- `GET /csv/{name}` — return the CSV as `{name, columns, rows}` (rows are arrays of strings)
