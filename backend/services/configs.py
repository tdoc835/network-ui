"""Capture & restore per-device runtime config.

For each node in a saved topology we keep a sibling file at
    <SAVED_LABS_DIR>/<lab>-configs/<node>.conf

Routers
-------
* Capture: `docker exec … vtysh -c "show running-config"`. The "Building
  configuration…" preamble is stripped so the file is a valid frr.conf.
* Restore: `docker cp` the file to /etc/frr/frr.conf, fix ownership, then
  restart FRR. We try `service frr restart` first and fall back to
  `/usr/lib/frr/frrinit.sh restart` for older images.

Hosts
-----
* Capture: read `ip addr show` and `ip route show`, and emit the
  equivalent `ip addr add` / `ip route add` commands as a small shell
  script. Management interface (eth0) and link-scope auto-routes are
  skipped — they come back automatically when the container redeploys.
* Restore: `docker cp` the script in and `sh` it. Each command ends with
  `|| true` so duplicate state during replay isn't fatal.

Switches use kind: bridge (no exec) — silently skipped everywhere.
"""
from __future__ import annotations
import shlex
import subprocess
from pathlib import Path
from typing import Any


# ── helpers ──────────────────────────────────────────────────────

def _run(cmd: list[str], *, input_text: str | None = None, timeout: float = 15.0) -> tuple[int, str, str]:
    proc = subprocess.run(
        cmd,
        input=input_text,
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    return proc.returncode, proc.stdout or "", proc.stderr or ""


def _container_exists(name: str) -> bool:
    rc, out, _ = _run(["docker", "inspect", "--format", "{{.State.Status}}", name])
    return rc == 0 and out.strip() == "running"


# ── router (FRR) ─────────────────────────────────────────────────

def capture_router_config(container: str) -> str | None:
    if not _container_exists(container):
        return None
    rc, out, _ = _run(["docker", "exec", container, "vtysh", "-c", "show running-config"])
    if rc != 0 or not out.strip():
        return None

    # vtysh prints a "Building configuration…" preamble; trim until the
    # first real config line so the file is a usable frr.conf.
    lines = out.splitlines()
    for i, line in enumerate(lines):
        s = line.lstrip()
        if s.startswith("!") or s.startswith("frr ") or s.startswith("hostname"):
            return "\n".join(lines[i:]).rstrip() + "\n"
    return out


def apply_router_config(container: str, conf_path: Path) -> tuple[bool, str]:
    if not _container_exists(container):
        return False, f"{container}: not running"

    log: list[str] = []

    rc, out, err = _run(["docker", "cp", str(conf_path), f"{container}:/etc/frr/frr.conf"])
    log.append(f"cp: rc={rc} {err.strip()}")
    if rc != 0:
        return False, "\n".join(log)

    # frr.conf must be readable by the frr user. `chown frr:frr` is harmless
    # if the user is already root inside the image — we ignore failures.
    _run(["docker", "exec", container, "chown", "frr:frr", "/etc/frr/frr.conf"])
    _run(["docker", "exec", container, "chmod", "640", "/etc/frr/frr.conf"])

    # Try the common service wrapper first; fall back to FRR's own init script.
    rc, out, err = _run(["docker", "exec", container, "service", "frr", "restart"])
    if rc != 0:
        rc, out, err = _run(["docker", "exec", container, "/usr/lib/frr/frrinit.sh", "restart"])
    log.append(f"restart: rc={rc} {err.strip() or out.strip()}")
    return rc == 0, "\n".join(log)


# ── host (alpine + iproute2) ─────────────────────────────────────

def _build_host_script(addr_out: str, route_out: str) -> str:
    addr_cmds: list[str] = []
    for raw in addr_out.splitlines():
        # Format from `ip -4 -o addr show`:
        #   2: eth0    inet 172.20.20.2/24 brd … scope global eth0\       valid_lft …
        parts = raw.split()
        if len(parts) < 4 or parts[2] != "inet":
            continue
        iface = parts[1]
        addr = parts[3]
        # Skip loopback and the management interface (containerlab assigns
        # eth0 automatically — replaying it would clash with the new lease).
        if iface in ("lo", "eth0"):
            continue
        addr_cmds.append(f"ip addr add {shlex.quote(addr)} dev {shlex.quote(iface)} || true")

    route_cmds: list[str] = []
    for raw in route_out.splitlines():
        line = raw.strip()
        if not line:
            continue
        # Skip routes on the management interface.
        if " dev eth0" in line or line.startswith("default via"):
            # keep `default via` only if it's NOT through eth0
            if "dev eth0" in line:
                continue
        # Kernel-installed link-scope routes come back automatically when
        # the interface gets its IP — replaying them is noise.
        if " scope link" in line and "via" not in line:
            continue
        route_cmds.append(f"ip route add {line} || true")

    body = ["#!/bin/sh", "# NetLab host restore — generated, safe to re-run", "set +e"]
    body.extend(addr_cmds)
    body.extend(route_cmds)
    return "\n".join(body) + "\n"


def capture_host_config(container: str) -> str | None:
    if not _container_exists(container):
        return None
    rc1, addr, _ = _run(["docker", "exec", container, "ip", "-4", "-o", "addr", "show"])
    rc2, route, _ = _run(["docker", "exec", container, "ip", "-4", "route", "show"])
    if rc1 != 0 and rc2 != 0:
        return None
    return _build_host_script(addr, route)


def apply_host_config(container: str, conf_path: Path) -> tuple[bool, str]:
    if not _container_exists(container):
        return False, f"{container}: not running"
    target = "/tmp/netlab-restore.sh"
    rc, _, err = _run(["docker", "cp", str(conf_path), f"{container}:{target}"])
    if rc != 0:
        return False, f"cp failed: {err.strip()}"
    rc, out, err = _run(["docker", "exec", container, "sh", target])
    return rc == 0, (err or out).strip()


# ── orchestration ────────────────────────────────────────────────

def configs_dir(saved_labs_dir: Path, lab_name: str) -> Path:
    return saved_labs_dir / f"{lab_name}-configs"


def capture_all(saved_labs_dir: Path, save_as: str, running_lab: str, topology: dict[str, Any]) -> list[str]:
    """Capture configs for every router/host in `topology` from the
    currently-running lab `running_lab`, writing them under
    <saved_labs_dir>/<save_as>-configs/.

    Returns the list of node names successfully captured.
    """
    out_dir = configs_dir(saved_labs_dir, save_as)
    out_dir.mkdir(parents=True, exist_ok=True)
    captured: list[str] = []
    for node in topology.get("nodes", []):
        kind = node["type"]
        if kind == "switch":
            continue
        container = f"clab-{running_lab}-{node['name']}"
        try:
            if kind == "router":
                cfg = capture_router_config(container)
            else:
                cfg = capture_host_config(container)
        except Exception:
            cfg = None
        if cfg:
            (out_dir / f"{node['name']}.conf").write_text(cfg)
            captured.append(node["name"])
    return captured


def apply_all(saved_labs_dir: Path, lab_name: str, topology: dict[str, Any]) -> list[dict]:
    """Apply any per-node config files saved under <lab_name>-configs/ to
    the freshly-deployed containers.
    """
    in_dir = configs_dir(saved_labs_dir, lab_name)
    if not in_dir.exists():
        return []
    results: list[dict] = []
    for node in topology.get("nodes", []):
        kind = node["type"]
        if kind == "switch":
            continue
        conf = in_dir / f"{node['name']}.conf"
        if not conf.exists():
            continue
        container = f"clab-{lab_name}-{node['name']}"
        if kind == "router":
            ok, log = apply_router_config(container, conf)
        else:
            ok, log = apply_host_config(container, conf)
        results.append({"node": node["name"], "ok": ok, "log": log})
    return results


def remove_all(saved_labs_dir: Path, lab_name: str) -> None:
    """Used by the lab DELETE endpoint to also drop saved configs."""
    d = configs_dir(saved_labs_dir, lab_name)
    if not d.exists():
        return
    for f in d.iterdir():
        try:
            f.unlink()
        except OSError:
            pass
    try:
        d.rmdir()
    except OSError:
        pass
