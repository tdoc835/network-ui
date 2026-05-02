"""Deploy / destroy / status endpoints."""
from __future__ import annotations
import json
import time
import yaml
from fastapi import APIRouter, Body

from ..config import ACTIVE_LAB_DIR, SAVED_LABS_DIR
from ..services import configs, containerlab
from ..services.topology import generate_lab_yml, assign_ips

router = APIRouter()


@router.post("/api/deploy")
def deploy(body: dict = Body(...)) -> dict:
    """Generate lab.yml from the canvas topology, then run containerlab deploy.

    Body shape: either a raw topology dict, or
        {"topology": {...}, "restoreConfig": bool}
    """
    if "topology" in body and isinstance(body["topology"], dict):
        topology = body["topology"]
        restore = bool(body.get("restoreConfig", False))
    else:
        topology = body
        restore = False

    topology = assign_ips(topology)
    lab_yml = generate_lab_yml(topology)

    (ACTIVE_LAB_DIR / "lab.yml").write_text(
        yaml.safe_dump(lab_yml, sort_keys=False, default_flow_style=False)
    )
    (ACTIVE_LAB_DIR / "metadata.json").write_text(json.dumps(topology, indent=2))

    rc, output = containerlab.deploy(ACTIVE_LAB_DIR)

    applied: list[dict] = []
    if rc == 0 and restore:
        # Containerlab waits for containers to reach running state, but FRR
        # daemons may still be initialising. A short pause makes the first
        # `vtysh -c "show running-config"` reliable.
        time.sleep(2)
        applied = configs.apply_all(SAVED_LABS_DIR, topology["name"], topology)

    return {
        "ok": rc == 0,
        "returncode": rc,
        "output": output,
        "topology": topology,
        "labYml": yaml.safe_dump(lab_yml, sort_keys=False),
        "configsApplied": applied,
    }


@router.post("/api/destroy")
def destroy() -> dict:
    if not (ACTIVE_LAB_DIR / "lab.yml").exists():
        return {"ok": False, "output": "no active lab to destroy"}
    rc, output = containerlab.destroy(ACTIVE_LAB_DIR)
    return {"ok": rc == 0, "returncode": rc, "output": output}


@router.get("/api/containers")
def containers() -> list[dict]:
    return containerlab.list_clab_containers()
