"""Detect the actual interface names inside a deployed container.

Containerlab specifies eth1, eth2, … in lab.yml, but some images rename
links on attach (we've seen eth1 surface as `et` inside Alpine variants).
The reliable signal is MTU: containerlab assigns 9500 to topology links,
while the management interface (eth0) keeps the default Docker MTU.

We `docker exec ip link show`, pick the lines with `mtu 9500` in the
order they appear, and map them sequentially onto eth1, eth2, … —
the same order containerlab attaches them in lab.yml.
"""
from __future__ import annotations
import re
import subprocess

# Header line of `ip link show`:
#   3: eth1@if124: <BROADCAST,…> mtu 9500 qdisc …
_IFACE_HEADER = re.compile(
    r"^\s*\d+:\s+([^:@\s]+)(?:@\S+)?:.*\bmtu\s+(\d+)"
)

# Containerlab default link MTU. Management interface (eth0) uses the
# Docker bridge default (1500), so this filter cleanly picks topology links.
LINK_MTU = 9500


def _ip_link_show(container: str) -> str:
    proc = subprocess.run(
        ["docker", "exec", container, "ip", "link", "show"],
        capture_output=True, text=True, timeout=10,
    )
    return proc.stdout if proc.returncode == 0 else ""


def topology_links(container: str) -> list[str]:
    """Names of MTU-9500 interfaces in the order ip link show reports them."""
    out = _ip_link_show(container)
    names: list[str] = []
    for line in out.splitlines():
        m = _IFACE_HEADER.match(line)
        if not m:
            continue
        name, mtu = m.group(1), int(m.group(2))
        if mtu == LINK_MTU:
            names.append(name)
    return names


def map_actual_interfaces(container: str, expected_count: int) -> dict[str, str]:
    """Return {expected_eth_name: actual_name} for one container.

    If the kernel reports fewer interfaces than the topology declares
    (e.g. a link failed to attach), the missing ones are simply absent
    from the returned map — callers fall back to the expected name.
    """
    actual = topology_links(container)
    return {f"eth{i + 1}": actual[i] for i in range(min(expected_count, len(actual)))}
