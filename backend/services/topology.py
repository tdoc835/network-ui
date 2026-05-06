"""Pure functions that turn the canvas topology into containerlab YAML
and back-fill auto-assigned IPs onto each link.

Topology JSON shape (from the React Flow canvas):

    {
      "name": "mylab",
      "nodes": [
        {"id": "n1", "name": "r1",    "type": "router", "position": {"x":0,"y":0}},
        {"id": "n2", "name": "host1", "type": "host",   "position": {"x":0,"y":0}},
        {"id": "n3", "name": "sw1",   "type": "switch", "position": {"x":0,"y":0}}
      ],
      "links": [
        {"id": "e1", "source": "n1", "target": "n2", "subnet": "10.0.1.0/24"}
      ]
    }
"""
from __future__ import annotations
import ipaddress
from typing import Any

ROUTER_IMAGE = "netlab-router"
HOST_IMAGE = "netlab-host"


def assign_ips(topology: dict[str, Any]) -> dict[str, Any]:
    """Auto-assign .1 / .2 IPs on each link based on the link's subnet.

    Mutates and returns the topology so the caller can persist the result.
    """
    for link in topology.get("links", []):
        subnet = link.get("subnet")
        if not subnet:
            continue
        net = ipaddress.ip_network(subnet, strict=False)
        hosts = list(net.hosts())
        if len(hosts) < 2:
            # /31 or /32 — skip rather than crash
            continue
        link["sourceIp"] = f"{hosts[0]}/{net.prefixlen}"
        link["targetIp"] = f"{hosts[1]}/{net.prefixlen}"
    return topology


def generate_lab_yml(
    topology: dict[str, Any],
    *,
    bind_modules: bool = False,
) -> dict[str, Any]:
    """Build the containerlab dict (caller dumps to YAML).

    `bind_modules` controls whether host nodes bind-mount /lib/modules into
    the container. The caller (api/deploy.py) decides this by checking the
    host filesystem — kept out of this module so topology generation stays
    pure and easily testable. When the host has /lib/modules, the bind lets
    modprobe inside host containers find kernel modules (netfilter, xfrm,
    esp, etc.); on systems without it (OrbStack, minimal hosts) the bind
    must be omitted or containerlab fails verification before deploying.
    """
    nodes_yaml: dict[str, Any] = {}
    for node in topology["nodes"]:
        kind = node["type"]
        if kind == "router":
            nodes_yaml[node["name"]] = {
                "kind": "linux",
                "image": ROUTER_IMAGE,
            }
        elif kind == "host":
            # Containerlab dropped the top-level `privileged` field in
            # recent releases (0.74 rejects it outright), so we get
            # equivalent behaviour via `cap-add: [ALL]`. /dev/net/tun is
            # exposed for TUN/TAP tunnels (OpenVPN, WireGuard); together
            # with cap-add this covers GRE, IPSec xfrm, iptables/NAT, and
            # MPLS for the training-plan phases.
            host_node: dict[str, Any] = {
                "kind": "linux",
                "image": HOST_IMAGE,
                "cap-add": ["ALL"],
                "devices": ["/dev/net/tun"],
            }
            if bind_modules:
                host_node["binds"] = ["/lib/modules:/lib/modules"]
            nodes_yaml[node["name"]] = host_node
        elif kind == "switch":
            # `kind: bridge` is a pure L2 Linux bridge — no image, no exec.
            nodes_yaml[node["name"]] = {"kind": "bridge"}
        else:
            raise ValueError(f"unknown node type: {kind!r}")

    # Each interface on a node gets a fresh ethN, counted up per node.
    eth_count: dict[str, int] = {n["name"]: 0 for n in topology["nodes"]}
    name_lookup = {n["id"]: n["name"] for n in topology["nodes"]}

    links_yaml: list[dict[str, Any]] = []
    for link in topology.get("links", []):
        src = name_lookup[link["source"]]
        tgt = name_lookup[link["target"]]
        eth_count[src] += 1
        eth_count[tgt] += 1
        links_yaml.append({
            "endpoints": [
                f"{src}:eth{eth_count[src]}",
                f"{tgt}:eth{eth_count[tgt]}",
            ]
        })

    return {
        "name": topology["name"],
        "topology": {
            "nodes": nodes_yaml,
            "links": links_yaml,
        },
    }


def container_name_for(lab_name: str, node_name: str) -> str:
    """Containerlab's naming convention."""
    return f"clab-{lab_name}-{node_name}"
