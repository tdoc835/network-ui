// Single xterm.js panel wired to a backend WebSocket PTY.
// Outbound: keystrokes as binary frames; resize as JSON text frames.
// Inbound:  raw bytes appended to the terminal.
import { useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { useStore } from '../store';
import type { DeviceType } from '../types';

interface Props {
  nodeId: string;
  containerName: string;
  deviceName: string;
  // Switches are filtered out in TerminalGrid so we never see one here,
  // but keep the wider DeviceType to match upstream call sites.
  deviceType: DeviceType;
}

type ConnState = 'connecting' | 'connected' | 'closed' | 'error';

export default function TerminalPanel({
  nodeId,
  containerName,
  deviceName,
  deviceType,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [conn, setConn] = useState<ConnState>('connecting');

  const closeTerminal = useStore((s) => s.closeTerminal);
  const focusTerminal = useStore((s) => s.focusTerminal);
  const focused = useStore((s) => s.focusedTerminal === nodeId);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 13,
      cursorBlink: true,
      theme: {
        background: '#000000',
        foreground: '#e5e7eb',
        cursor: '#22c55e',
        green: '#22c55e',
        brightGreen: '#4ade80',
      },
      scrollback: 5000,
      allowProposedApi: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());

    term.open(containerRef.current);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;

    // Open the WebSocket. Vite dev server proxies /ws to FastAPI.
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws/${containerName}`);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onopen = () => {
      setConn('connected');
      // Tell the backend our initial size so the shell formats correctly.
      ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
      term.focus();
    };
    ws.onmessage = (ev) => {
      if (typeof ev.data === 'string') {
        term.write(ev.data);
      } else {
        // Binary frame from PTY.
        term.write(new Uint8Array(ev.data as ArrayBuffer));
      }
    };
    ws.onerror = () => setConn('error');
    ws.onclose = () => setConn('closed');

    // Send keystrokes as binary so they can never collide with our JSON
    // control channel.
    const onData = term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(new TextEncoder().encode(data));
      }
    });

    // Refit on container resize, then notify the PTY via TIOCSWINSZ.
    const ro = new ResizeObserver(() => {
      try {
        fit.fit();
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
        }
      } catch {
        /* fit can throw if the element is detached; ignore */
      }
    });
    ro.observe(containerRef.current);

    return () => {
      onData.dispose();
      ro.disconnect();
      try { ws.close(); } catch { /* noop */ }
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
      wsRef.current = null;
    };
    // We intentionally only set this up once per mount; container/node names
    // don't change for a given panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className={`terminal-panel ${focused ? 'focused' : ''}`}
      onMouseDown={() => focusTerminal(nodeId)}
    >
      <div className="terminal-header">
        <span className="name">
          {deviceType === 'router' ? '◆' : '■'} {deviceName}
        </span>
        <span className="kind">{deviceType === 'router' ? 'vtysh' : 'sh'}</span>
        <span className="grow" />
        <span className={`conn-dot ${conn === 'connected' ? 'connected' : conn === 'error' ? 'error' : ''}`} title={conn} />
        <button className="close" onClick={() => closeTerminal(nodeId)} title="Close">
          ×
        </button>
      </div>
      <div className="terminal-body" ref={containerRef} />
    </div>
  );
}
