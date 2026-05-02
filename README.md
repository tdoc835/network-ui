# NetLab

A local web UI for building, deploying, and learning on containerised network
labs with [Containerlab](https://containerlab.dev/) + FRRouting on macOS
(OrbStack / Docker).

Everything runs on your Mac — no cloud, no auth, no database. Topologies are
JSON files on disk; the deployed lab is a generated `lab.yml` that
Containerlab consumes.

```
┌──────────────────────────────┬───────────────────────────────┐
│  Topology Builder            │  Terminal Grid                │
│  (React Flow canvas)         │  (xterm.js per device)        │
│                              │                               │
│   r1 ──── 10.0.1.0/24 ─ r2   │   r1 vtysh   │   r2 vtysh    │
│    │                    │    │   ─────────  │  ───────────  │
│   host1                host2 │   host1 sh   │   host2 sh    │
└──────────────────────────────┴───────────────────────────────┘
```

## Layout

```
.
├── backend/          FastAPI + uvicorn — REST + WebSocket PTY proxy
│   ├── api/          labs (CRUD), deploy, terminal (WS)
│   ├── services/     topology → lab.yml, containerlab CLI wrapper
│   └── main.py
├── frontend/         Vite + React + TypeScript
│   └── src/
│       ├── components/   Toolbar, TopologyCanvas, TerminalGrid, …
│       ├── store.ts      zustand store (single source of truth)
│       └── api.ts        REST client
├── start.sh          One-shot launcher (backend + frontend)
└── README.md
```

## Setup

### Prerequisites

1. **OrbStack** (or Docker Desktop) running, with a Linux Docker context
   active. Verify with:
   ```sh
   docker context ls           # the * shows the active context
   docker info >/dev/null      # should succeed silently
   ```
   If you use OrbStack: just open it. It registers itself as the default
   Docker context.

2. **Containerlab** — the binary is preferred. Install with:
   ```sh
   brew install containerlab   # or: bash -c "$(curl -sL https://get.containerlab.dev)"
   ```
   If you don't install it, NetLab automatically falls back to running
   `ghcr.io/srl-labs/clab` via Docker.

3. **Python 3.10+** and **Node 18+**.

### Install dependencies

```sh
# from the repo root
cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cd ../frontend && npm install
```

…or just let `./start.sh` do all of that on first run.

### Run

```sh
./start.sh
```

Then open <http://localhost:5173>.

The backend listens on `:8000`; Vite proxies `/api` and `/ws` to it, so
the frontend uses same-origin URLs.

## Using it

* **+ Router / + Host** — add a device. Routers use `frrouting/frr:latest`
  and drop you into `vtysh`; hosts use `alpine:latest` and drop you into `sh`.
* **Drag from one node to another** — creates a link. You're prompted for
  the subnet (e.g. `10.0.1.0/24`); the first endpoint gets `.1`, the second
  `.2`. Interfaces are auto-named `eth1`, `eth2`, … per node.
* **Deploy** — generates `lab.yml` + `metadata.json` in
  `~/netlabs/netlabui/active-lab/` and runs `containerlab deploy`. Status
  dots flip green as containers come up. A terminal opens for each node.
* **Destroy** — runs `containerlab destroy --cleanup` against the active
  lab.
* **Save Lab** — writes `<name>.json` into `~/netlabs/saved-labs/`.
* **Load Lab** — pick from a list; the canvas is rebuilt from JSON.

Click a node to focus its terminal panel. Double-click a node to (re)open
its terminal if you closed it.

## Storage

| Path                                              | What it is                          |
|---------------------------------------------------|-------------------------------------|
| `~/netlabs/saved-labs/<name>.json`                | Persisted topology (canvas truth)   |
| `~/netlabs/netlabui/active-lab/lab.yml`           | Generated containerlab topology     |
| `~/netlabs/netlabui/active-lab/metadata.json`     | Subnets/IPs (not in lab.yml schema) |

Override the root with `NETLABS_DIR=/path uvicorn …` if needed.

## Architecture notes

The canvas is the source of truth. `lab.yml` is generated from it on every
deploy — never edited and re-imported. This keeps the round-trip simple and
means deleting a node on the canvas always wins.

The WebSocket terminal proxy is the trickiest piece. The flow:

```
Browser xterm.js  ──ws──>  FastAPI  ──pty.fork()──>  docker exec -it <c> {sh|vtysh}
```

Two channels share the WebSocket:
* **Binary frames** = keystrokes, written to the PTY master verbatim.
* **Text frames**  = JSON control messages (currently only
  `{"type":"resize", "cols":N, "rows":M}`), which `ioctl(TIOCSWINSZ)` the
  PTY so the shell wraps correctly.

Output from the PTY is streamed back as binary frames.

If you ever need to extend the PTY layer, the relevant patterns are
`asyncssh + websockets` for the network side and `pty.openpty()` /
`ptyprocess` for the local side.
