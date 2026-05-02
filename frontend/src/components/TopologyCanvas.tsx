// React Flow canvas. The store owns the nodes/edges; this component is
// just glue + the connection prompt.
import { useState, useCallback, useMemo } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  type Connection,
} from 'reactflow';
import { useStore } from '../store';
import DeviceNode from './DeviceNode';
import { PromptModal } from './Modals';

const nodeTypes = { device: DeviceNode };

export default function TopologyCanvas() {
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const onNodesChange = useStore((s) => s.onNodesChange);
  const onEdgesChange = useStore((s) => s.onEdgesChange);
  const onConnect = useStore((s) => s.onConnect);
  const focusTerminal = useStore((s) => s.focusTerminal);
  const openTerminal = useStore((s) => s.openTerminal);

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
        onNodeClick={(_, n) => {
          // Single click = focus terminal; double-click opens it if closed.
          focusTerminal(n.id);
        }}
        onNodeDoubleClick={(_, n) => openTerminal(n.id)}
        fitView
      >
        <Background gap={18} size={1} color="#e2e8f0" />
        <Controls position="bottom-right" />
        <MiniMap
          pannable
          zoomable
          nodeColor={(n) => (n.data?.deviceType === 'router' ? '#c7d2fe' : '#bae6fd')}
          maskColor="rgba(241,245,249,0.6)"
        />
      </ReactFlow>

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
