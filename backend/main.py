"""NetLab FastAPI entry point.

Run from the repo root with:
    uvicorn backend.main:app --reload --port 8000
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import deploy, labs, terminal

app = FastAPI(title="NetLab", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    # Vite dev server.
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(labs.router)
app.include_router(deploy.router)
app.include_router(terminal.router)


@app.get("/")
def root() -> dict:
    return {"name": "NetLab", "version": "0.1.0"}
