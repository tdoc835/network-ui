// Top-level layout: header bar + horizontal split (canvas | terminals).
// Also wires the container-status poller so the dots reflect reality
// without anyone clicking deploy.
import { useEffect } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { ReactFlowProvider } from 'reactflow';

import { api } from './api';
import { containerNameFor, useStore } from './store';
import type { NodeStatus } from './types';
import Toolbar from './components/Toolbar';
import TopologyCanvas from './components/TopologyCanvas';
import TerminalGrid from './components/TerminalGrid';

function StatusSync() {
  // Background poll: keep node status dots in sync with docker reality.
  // This means a lab destroyed externally still updates the UI.
  const labName = useStore((s) => s.labName);
  const nodeCount = useStore((s) => s.nodes.length);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const containers = await api.containers();
        if (!alive) return;
        const byName = new Map(containers.map((c) => [c.name, c]));
        // Patch node.data.status so React Flow re-renders the status dots.
        useStore.setState((s) => ({
          nodes: s.nodes.map((n) => {
            const cname = containerNameFor(labName, n.data.name);
            const c = byName.get(cname);
            const status: NodeStatus = !c
              ? 'idle'
              : c.state === 'running'
                ? 'running'
                : 'error';
            if (n.data.status === status) return n;
            return { ...n, data: { ...n.data, status } };
          }),
        }));
      } catch {
        /* backend down — silent */
      }
    };
    tick();
    const h = setInterval(tick, 3000);
    return () => {
      alive = false;
      clearInterval(h);
    };
  }, [labName, nodeCount]);

  return null;
}

export default function App() {
  const labName = useStore((s) => s.labName);
  const setLabName = useStore((s) => s.setLabName);

  return (
    <ReactFlowProvider>
      <div className="app-shell">
        <header className="app-header">
          <div className="brand">
            net<span className="accent">Lab</span>
          </div>
          <div className="lab-name">
            <label>Lab name:</label>
            <input
              value={labName}
              onChange={(e) =>
                setLabName(e.target.value.replace(/[^A-Za-z0-9_-]/g, ''))
              }
            />
          </div>
        </header>

        <div className="app-body">
          <PanelGroup direction="horizontal">
            <Panel defaultSize={55} minSize={20}>
              <div className="left-pane">
                <Toolbar />
                <TopologyCanvas />
              </div>
            </Panel>
            <PanelResizeHandle />
            <Panel defaultSize={45} minSize={20}>
              <TerminalGrid />
            </Panel>
          </PanelGroup>
        </div>

        <StatusSync />
      </div>
    </ReactFlowProvider>
  );
}
