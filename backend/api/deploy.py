"""Deploy / destroy / status endpoints."""
from __future__ import annotations
import json
import yaml
from fastapi import APIRouter, Body

from ..config import ACTIVE_LAB_DIR
from ..services import containerlab
from ..services.topology import generate_lab_yml, assign_ips

router = APIRouter()


@router.post("/api/deploy")
def deploy(topology: dict = Body(...)) -> dict:
    """Generate lab.yml from the canvas topology, then run containerlab deploy."""
    topology = assign_ips(topology)
    lab_yml = generate_lab_yml(topology)

    (ACTIVE_LAB_DIR / "lab.yml").write_text(
        yaml.safe_dump(lab_yml, sort_keys=False, default_flow_style=False)
    )
    # Subnets/IPs aren't part of clab's schema — keep them next to lab.yml so
    # we can recreate the canvas state later.
    (ACTIVE_LAB_DIR / "metadata.json").write_text(json.dumps(topology, indent=2))

    rc, output = containerlab.deploy(ACTIVE_LAB_DIR)
    return {
        "ok": rc == 0,
        "returncode": rc,
        "output": output,
        "topology": topology,
        "labYml": yaml.safe_dump(lab_yml, sort_keys=False),
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
