from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import index
from .routers import csv as csv_router
from .routers import groups, health, rules, schema, transactions


@asynccontextmanager
async def lifespan(_: FastAPI):
    index.build()
    yield


def create_app() -> FastAPI:
    app = FastAPI(title="Finance X-Ray API", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(health.router)
    app.include_router(csv_router.router)
    app.include_router(rules.router)
    app.include_router(groups.router)
    app.include_router(schema.router)
    app.include_router(transactions.router)
    return app


app = create_app()
