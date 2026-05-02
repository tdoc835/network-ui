// React Flow canvas. The store owns the nodes/edges; this component is
// just glue + the connection prompt.
import { useState, useCallback, useMemo } from 'react';
import ReactFlow, {
  Background,
  ConnectionMode,
  Controls,
  MiniMap,
  type Connection,
} from 'reactflow';
import { useStore } from '../store';
import { HAS_TERMINAL, type DeviceType } from '../types';
import DeviceNode from './DeviceNode';
import { PromptModal } from './Modals';

const nodeTypes = { device: DeviceNode };

function InfoToast() {
  const msg = useStore((s) => s.infoMessage);
  if (!msg) return null;
  return <div className="info-toast">{msg}</div>;
}

export default function TopologyCanvas() {
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const onNodesChange = useStore((s) => s.onNodesChange);
  const onEdgesChange = useStore((s) => s.onEdgesChange);
  const onConnect = useStore((s) => s.onConnect);
  const focusTerminal = useStore((s) => s.focusTerminal);
  const openTerminal = useStore((s) => s.openTerminal);
  const showInfo = useStore((s) => s.showInfo);

  const [pending, setPending] = useState<Connection | null>(null);

  const handleConnect = useCallback((c: Connection) => {
    // Stash the connection until the user supplies a subnet.
    setPending(c);
  }, []);

  const handleSubnetSubmit = (subnet: string) => {
    if (pending) onConnect(pending, subnet);
    setPending(null);
  };

  const defaultEdgeOptions = useMemo(
    () => ({
      style: { stroke: '#64748b', strokeWidth: 1.5 },
    }),
    [],
  );

  return (
    <div className="canvas-wrap">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={handleConnect}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        // Loose: any handle can connect to any handle, so the edge follows
        // wherever the user actually drops it instead of snapping to the
        // nearest target-typed handle.
        connectionMode={ConnectionMode.Loose}
        // Both keys remove the current selection (nodes + edges). React Flow
        // also auto-removes edges connected to a deleted node.
        deleteKeyCode={['Delete', 'Backspace']}
        onNodeClick={(_, n) => {
          const t = n.data?.deviceType as DeviceType | undefined;
          // Switches have no exec/CLI — explain instead of silently doing nothing.
          if (t && !HAS_TERMINAL[t]) {
            showInfo('Unmanaged switch — no CLI available');
            return;
          }
          // Single click = focus terminal; double-click opens it if closed.
          focusTerminal(n.id);
        }}
        onNodeDoubleClick={(_, n) => {
          const t = n.data?.deviceType as DeviceType | undefined;
          if (t && !HAS_TERMINAL[t]) {
            showInfo('Unmanaged switch — no CLI available');
            return;
          }
          openTerminal(n.id);
        }}
        fitView
      >
        <Background gap={18} size={1} color="#e2e8f0" />
        <Controls position="bottom-right" />
        <MiniMap
          pannable
          zoomable
          nodeColor={(n) => {
            const t = n.data?.deviceType;
            return t === 'router' ? '#c7d2fe' : t === 'switch' ? '#bbf7d0' : '#bae6fd';
          }}
          maskColor="rgba(241,245,249,0.6)"
        />
      </ReactFlow>

      <InfoToast />

      {pending && (
        <PromptModal
          title="Subnet for this link"
          placeholder="e.g. 10.0.1.0/24"
          defaultValue="10.0.1.0/24"
          onSubmit={handleSubnetSubmit}
          onClose={() => setPending(null)}
        />
      )}
    </div>
  );
}
