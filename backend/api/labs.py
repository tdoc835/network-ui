"""Saved-lab CRUD. Just JSON files on disk under SAVED_LABS_DIR."""
from __future__ import annotations
import json
import re
from fastapi import APIRouter, HTTPException, Body
from ..config import SAVED_LABS_DIR
from ..services import configs

router = APIRouter()

_SAFE_NAME = re.compile(r"^[A-Za-z0-9_\-]+$")


def _validate_name(name: str) -> None:
    if not _SAFE_NAME.match(name):
        # Don't allow path traversal — names are also used in container names.
        raise HTTPException(400, "lab name must match [A-Za-z0-9_-]+")


def _path_for(name: str):
    _validate_name(name)
    return SAVED_LABS_DIR / f"{name}.json"


@router.get("/api/labs")
def list_labs() -> list[str]:
    return sorted(p.stem for p in SAVED_LABS_DIR.glob("*.json"))


@router.get("/api/labs/{name}")
def get_lab(name: str) -> dict:
    p = _path_for(name)
    if not p.exists():
        raise HTTPException(404, f"lab '{name}' not found")
    data = json.loads(p.read_text())
    # Surface whether saved configs exist so the UI can highlight that.
    data["hasSavedConfigs"] = configs.configs_dir(SAVED_LABS_DIR, name).exists()
    return data


@router.post("/api/labs/{name}")
def save_lab(name: str, body: dict = Body(...)) -> dict:
    """Save topology JSON and (best-effort) capture per-device configs.

    Body shape: either a raw topology dict, or
        {"topology": {...}, "captureFromLabName": "<name>"}
    The wrapped form is used for "Save As" so we still capture from the
    currently-running containers (which use the OLD lab name).
    """
    p = _path_for(name)

    if "topology" in body and isinstance(body["topology"], dict):
        topology = body["topology"]
        capture_from = body.get("captureFromLabName")
    else:
        topology = body
        capture_from = None

    topology["name"] = name
    p.write_text(json.dumps(topology, indent=2))

    running_lab = capture_from or name
    captured = configs.capture_all(SAVED_LABS_DIR, name, running_lab, topology)

    return {"ok": True, "path": str(p), "configsCaptured": captured}


@router.delete("/api/labs/{name}")
def delete_lab(name: str) -> dict:
    p = _path_for(name)
    if p.exists():
        p.unlink()
    configs.remove_all(SAVED_LABS_DIR, name)
    return {"ok": True}
