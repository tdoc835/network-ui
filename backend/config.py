"""Filesystem layout for NetLab.

Everything is local-only. Saved labs are JSON; the active deployed lab also
gets a generated `lab.yml` (for containerlab) plus a `metadata.json` with
subnet/IP info that lab.yml can't carry.
"""
from pathlib import Path
import os

# Root of the user's network labs. Override with NETLABS_DIR for testing.
NETLABS_DIR = Path(os.environ.get("NETLABS_DIR", str(Path.home() / "netlabs"))).resolve()

# Saved topologies as JSON files: <name>.json
SAVED_LABS_DIR = NETLABS_DIR / "saved-labs"

# Workspace for the currently deployed lab (lab.yml lives here).
ACTIVE_LAB_DIR = NETLABS_DIR / "netlabui" / "active-lab"

SAVED_LABS_DIR.mkdir(parents=True, exist_ok=True)
ACTIVE_LAB_DIR.mkdir(parents=True, exist_ok=True)
