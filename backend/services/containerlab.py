"""Thin wrapper around the `containerlab` CLI.

Prefers the native binary; falls back to the official Docker image when
the binary isn't on PATH (handy on a fresh Mac with only OrbStack installed).
"""
from __future__ import annotations
import shutil
import subprocess
from pathlib import Path

CLAB_IMAGE = "ghcr.io/srl-labs/clab"


def _has_binary() -> bool:
    return shutil.which("containerlab") is not None


def _docker_clab_cmd(lab_dir: Path, *clab_args: str) -> list[str]:
    """Build the `docker run … ghcr.io/srl-labs/clab …` invocation.

    We pin --entrypoint=containerlab so it works regardless of whether the
    image declares one (older tags don't, which surfaces as `exec: "deploy":
    executable file not found in $PATH`).
    """
    return [
        "docker", "run", "--rm", "--privileged",
        "--network", "host",
        "--entrypoint", "containerlab",
        "-v", "/var/run/docker.sock:/var/run/docker.sock",
        "-v", "/var/run/netns:/var/run/netns",
        "-v", "/etc/hosts:/etc/hosts",
        "-v", "/var/lib/docker/containers:/var/lib/docker/containers",
        "--pid=host",
        "-v", f"{lab_dir}:{lab_dir}",
        "-w", str(lab_dir),
        CLAB_IMAGE,
        *clab_args,
    ]


def _run(cmd: list[str]) -> tuple[int, str]:
    proc = subprocess.run(cmd, capture_output=True, text=True)
    return proc.returncode, (proc.stdout or "") + (proc.stderr or "")


def deploy(lab_dir: Path) -> tuple[int, str]:
    """`containerlab deploy -t lab.yml` from inside lab_dir."""
    if _has_binary():
        return _run(["containerlab", "deploy", "-t", str(lab_dir / "lab.yml")])
    return _run(_docker_clab_cmd(lab_dir, "deploy", "-t", "lab.yml"))


def destroy(lab_dir: Path) -> tuple[int, str]:
    if _has_binary():
        return _run(["containerlab", "destroy", "-t", str(lab_dir / "lab.yml"), "--cleanup"])
    return _run(_docker_clab_cmd(lab_dir, "destroy", "-t", "lab.yml", "--cleanup"))


def list_clab_containers() -> list[dict]:
    """Snapshot of every clab-* container known to docker."""
    proc = subprocess.run(
        ["docker", "ps", "-a", "--filter", "name=clab-",
         "--format", "{{.Names}}\t{{.Status}}\t{{.State}}"],
        capture_output=True, text=True,
    )
    out = []
    for line in (proc.stdout or "").strip().splitlines():
        parts = line.split("\t")
        if len(parts) >= 3:
            out.append({"name": parts[0], "status": parts[1], "state": parts[2]})
    return out
