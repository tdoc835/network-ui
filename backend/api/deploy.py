"""Deploy / destroy / status endpoints."""
from __future__ import annotations
import json
import os
import time
import yaml
from fastapi import APIRouter, Body

from ..config import ACTIVE_LAB_DIR
from ..services import containerlab, interfaces
from ..services.topology import (
    assign_ips,
    container_name_for,
    generate_lab_yml,
)

router = APIRouter()


def _annotate_interfaces(topology: dict) -> dict[str, dict[str, str]]:
    """After deploy, query each container's `ip link show` and write the
    actual interface names back onto the topology.

    Mutates topology in place: each link gets `sourceIf` / `targetIf`
    (always the expected ethN, matching lab.yml) and, when detection
    succeeds, `actualSourceIf` / `actualTargetIf` (whatever the kernel
    actually called the interface).

    Returns a flat {nodeName: {ethN: actualName}} for the metadata file.
    """
    name_by_id = {n["id"]: n["name"] for n in topology["nodes"]}
    eth_count: dict[str, int] = {n["name"]: 0 for n in topology["nodes"]}

    # First pass: assign expected ethN per link in topology order, mirroring
    # what generate_lab_yml does.
    for link in topology.get("links", []):
        src = name_by_id[link["source"]]
        tgt = name_by_id[link["target"]]
        eth_count[src] += 1
        eth_count[tgt] += 1
        link["sourceIf"] = f"eth{eth_count[src]}"
        link["targetIf"] = f"eth{eth_count[tgt]}"

    # Second pass: ask each container what its links are actually called.
    # Switches (kind: bridge) are host-side bridges with no exec, so skip.
    iface_map: dict[str, dict[str, str]] = {}
    for node in topology["nodes"]:
        if node["type"] == "switch":
            continue
        container = container_name_for(topology["name"], node["name"])
        try:
            iface_map[node["name"]] = interfaces.map_actual_interfaces(
                container, eth_count.get(node["name"], 0)
            )
        except Exception:
            # docker not running, container missing, exec failed — leave the
            # frontend to fall back to expected names.
            iface_map[node["name"]] = {}

    # Third pass: stamp actual names onto each link.
    for link in topology.get("links", []):
        src = name_by_id[link["source"]]
        tgt = name_by_id[link["target"]]
        sm = iface_map.get(src, {}).get(link["sourceIf"])
        tm = iface_map.get(tgt, {}).get(link["targetIf"])
        if sm:
            link["actualSourceIf"] = sm
        if tm:
            link["actualTargetIf"] = tm

    return iface_map


@router.post("/api/deploy")
def deploy(topology: dict = Body(...)) -> dict:
    """Generate lab.yml from the canvas topology, run containerlab deploy,
    and (on success) detect each node's actual interface names.
    """
    topology = assign_ips(topology)
    # Only bind-mount /lib/modules into host containers when the directory
    # actually exists on the docker host. On OrbStack and other minimal
    # environments it doesn't, and an unconditional bind makes containerlab
    # fail topology verification before any container starts.
    bind_modules = os.path.isdir("/lib/modules")
    lab_yml = generate_lab_yml(topology, bind_modules=bind_modules)

    (ACTIVE_LAB_DIR / "lab.yml").write_text(
        yaml.safe_dump(lab_yml, sort_keys=False, default_flow_style=False)
    )

    rc, output = containerlab.deploy(ACTIVE_LAB_DIR)

    iface_map: dict[str, dict[str, str]] = {}
    if rc == 0:
        # Containers reach running state before deploy returns, but the link
        # attachment can lag a beat — a short pause makes detection reliable.
        time.sleep(1)
        iface_map = _annotate_interfaces(topology)

    # metadata.json carries everything the frontend may want post-deploy:
    # the topology with subnet/IP/interface info plus the bare iface map.
    metadata = {**topology, "interfaceMap": iface_map}
    (ACTIVE_LAB_DIR / "metadata.json").write_text(json.dumps(metadata, indent=2))

    return {
        "ok": rc == 0,
        "returncode": rc,
        "output": output,
        "topology": topology,
        "interfaceMap": iface_map,
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
