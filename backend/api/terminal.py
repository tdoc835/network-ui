"""WebSocket → docker exec PTY proxy.

This is the trickiest piece in the app, so the flow is worth spelling out:

    Browser xterm.js  ──ws──>  FastAPI  ──pty──>  docker exec -it container shell

We `pty.fork()` to create a real PTY, then exec docker as the child. The parent
keeps the master fd and shuttles bytes between the fd and the WebSocket. We use
two protocol channels on the same WebSocket:

  • Binary frames  → keystrokes from xterm → written to the PTY as-is
  • Text frames    → JSON control messages, currently only `{"type":"resize",
                     "cols":N,"rows":M}`, which sets the PTY winsize.

Output from the PTY is streamed back to the browser as binary frames.
"""
from __future__ import annotations
import asyncio
import fcntl
import json
import os
import pty
import signal
import struct
import termios

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()


def _pick_shell(container_name: str) -> list[str]:
    """Routers (rN) drop straight into vtysh; everything else gets sh."""
    # naming: clab-<labname>-<nodename>
    node = container_name.rsplit("-", 1)[-1]
    if len(node) >= 2 and node[0] == "r" and node[1:].isdigit():
        return ["docker", "exec", "-it", container_name, "vtysh"]
    return ["docker", "exec", "-it", container_name, "sh"]


def _set_winsize(fd: int, rows: int, cols: int) -> None:
    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))


@router.websocket("/ws/{container_name}")
async def terminal(ws: WebSocket, container_name: str) -> None:
    await ws.accept()

    cmd = _pick_shell(container_name)

    # `pty.fork()` returns (0, fd) in the child and (pid, fd) in the parent.
    # The child has stdin/stdout/stderr already attached to the slave PTY.
    pid, fd = pty.fork()
    if pid == 0:
        try:
            os.execvp(cmd[0], cmd)
        except FileNotFoundError:
            os._exit(127)

    loop = asyncio.get_running_loop()
    stop = asyncio.Event()

    async def pty_to_ws() -> None:
        # Read in a thread so the event loop stays free; os.read blocks.
        while not stop.is_set():
            try:
                data = await loop.run_in_executor(None, os.read, fd, 4096)
            except OSError:
                break
            if not data:
                break
            try:
                await ws.send_bytes(data)
            except Exception:
                break
        stop.set()

    async def ws_to_pty() -> None:
        try:
            while not stop.is_set():
                msg = await ws.receive()
                if msg.get("type") == "websocket.disconnect":
                    break
                # Binary frame → raw keystrokes.
                if msg.get("bytes") is not None:
                    os.write(fd, msg["bytes"])
                    continue
                # Text frame → control message (JSON).
                text = msg.get("text")
                if text is None:
                    continue
                try:
                    ctrl = json.loads(text)
                except json.JSONDecodeError:
                    # Fallback: treat unparseable text as raw input.
                    os.write(fd, text.encode())
                    continue
                if ctrl.get("type") == "resize":
                    _set_winsize(fd, int(ctrl["rows"]), int(ctrl["cols"]))
        except WebSocketDisconnect:
            pass
        finally:
            stop.set()
            # Wake up pty_to_ws — it's blocked in os.read inside a thread.
            # Killing the docker exec process EOFs the slave PTY, which
            # makes os.read on the master return b'' and unblocks the read.
            try:
                os.kill(pid, signal.SIGTERM)
            except ProcessLookupError:
                pass

    try:
        await asyncio.gather(pty_to_ws(), ws_to_pty())
    finally:
        try:
            os.close(fd)
        except OSError:
            pass
        try:
            # Belt-and-braces: kill again in case the WS half didn't run
            # (e.g. ws_to_pty died before its finally for some reason).
            os.kill(pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        try:
            os.waitpid(pid, os.WNOHANG)
        except ChildProcessError:
            pass
        try:
            await ws.close()
        except Exception:
            pass
