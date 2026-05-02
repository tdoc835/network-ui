// Reflowing 2-column grid of TerminalPanels, built from
// react-resizable-panels so each row + column is draggable.
import { Fragment } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { containerNameFor, useStore } from '../store';
import { HAS_TERMINAL } from '../types';
import TerminalPanel from './TerminalPanel';

export default function TerminalGrid() {
  const labName = useStore((s) => s.labName);
  const nodes = useStore((s) => s.nodes);
  const openTerminals = useStore((s) => s.openTerminals);

  const open = openTerminals
    .map((id) => nodes.find((n) => n.id === id))
    // Drop missing ids (deleted nodes) and any device type without an exec.
    .filter(
      (n): n is NonNullable<typeof n> => !!n && HAS_TERMINAL[n.data.deviceType],
    );

  if (open.length === 0) {
    return (
      <div className="terminal-grid-empty">
        <div>
          <div style={{ fontSize: 28, marginBottom: 8 }}>▢</div>
          <div>Deploy a lab or double-click a node to open its terminal.</div>
        </div>
      </div>
    );
  }

  // Pair into rows of 2 columns.
  const rows: typeof open[] = [];
  for (let i = 0; i < open.length; i += 2) rows.push(open.slice(i, i + 2));

  return (
    <PanelGroup direction="vertical">
      {rows.map((row, rowIdx) => (
        <Fragment key={rowIdx}>
          {rowIdx > 0 && <PanelResizeHandle />}
          <Panel minSize={10}>
            <PanelGroup direction="horizontal">
              {row.map((n, colIdx) => (
                <Fragment key={n.id}>
                  {colIdx > 0 && <PanelResizeHandle />}
                  <Panel minSize={10}>
                    <TerminalPanel
                      nodeId={n.id}
                      containerName={containerNameFor(labName, n.data.name)}
                      deviceName={n.data.name}
                      deviceType={n.data.deviceType}
                    />
                  </Panel>
                </Fragment>
              ))}
            </PanelGroup>
          </Panel>
        </Fragment>
      ))}
    </PanelGroup>
  );
}
