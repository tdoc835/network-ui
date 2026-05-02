// Custom React Flow node — renders both router and host devices.
// Distinct styling per type plus a status dot driven from the store.
import { Handle, Position, type NodeProps } from 'reactflow';
import type { DeviceNodeData } from '../types';
import { useStore } from '../store';

const ICON: Record<DeviceNodeData['deviceType'], string> = {
  router: '◆',
  host: '■',
  switch: '⇆', // L2 forwarding glyph; matches the "no CLI" vibe of an unmanaged switch
};

export default function DeviceNode({ id, data }: NodeProps<DeviceNodeData>) {
  const focused = useStore((s) => s.focusedTerminal === id);
  const icon = ICON[data.deviceType];
  return (
    <div className={`device-node ${data.deviceType} ${focused ? 'focused' : ''}`}>
      {/* Connectable on all four sides. Each handle has a unique id so
          React Flow attaches the edge to the side the user actually
          dragged from / dropped on. With ConnectionMode.Loose on the
          ReactFlow root, any of these can connect to any other. */}
      <Handle id="top"    type="source" position={Position.Top} />
      <Handle id="bottom" type="source" position={Position.Bottom} />
      <Handle id="left"   type="source" position={Position.Left} />
      <Handle id="right"  type="source" position={Position.Right} />
      <div className="icon">{icon}</div>
      <div>
        <div className="label">{data.name}</div>
        <div className="sub">{data.deviceType}</div>
      </div>
      <div className={`status-dot ${data.status}`} title={`status: ${data.status}`} />
    </div>
  );
}
