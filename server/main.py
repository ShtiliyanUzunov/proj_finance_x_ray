"""Entrypoint: `python server/main.py` runs the FastAPI app via uvicorn.

The application itself lives in the `app` package. This file exists only so the
`python server/main.py` invocation documented in README.md keeps working.
"""

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)
