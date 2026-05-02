"""Saved-lab CRUD. Just JSON files on disk under SAVED_LABS_DIR."""
from __future__ import annotations
import json
import re
from fastapi import APIRouter, HTTPException, Body

from ..config import SAVED_LABS_DIR

router = APIRouter()

_SAFE_NAME = re.compile(r"^[A-Za-z0-9_\-]+$")


def _path_for(name: str):
    if not _SAFE_NAME.match(name):
        # Don't allow path traversal — names are also used in container names.
        raise HTTPException(400, "lab name must match [A-Za-z0-9_-]+")
    return SAVED_LABS_DIR / f"{name}.json"


@router.get("/api/labs")
def list_labs() -> list[str]:
    return sorted(p.stem for p in SAVED_LABS_DIR.glob("*.json"))


@router.get("/api/labs/{name}")
def get_lab(name: str) -> dict:
    p = _path_for(name)
    if not p.exists():
        raise HTTPException(404, f"lab '{name}' not found")
    return json.loads(p.read_text())


@router.post("/api/labs/{name}")
def save_lab(name: str, topology: dict = Body(...)) -> dict:
    """Persist the canvas state verbatim — it's the source of truth.

    Topology JSON only — no per-device runtime state is captured.
    """
    p = _path_for(name)
    topology["name"] = name
    p.write_text(json.dumps(topology, indent=2))
    return {"ok": True, "path": str(p)}


@router.delete("/api/labs/{name}")
def delete_lab(name: str) -> dict:
    p = _path_for(name)
    if p.exists():
        p.unlink()
    return {"ok": True}
