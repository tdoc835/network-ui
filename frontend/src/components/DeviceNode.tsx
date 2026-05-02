// Custom React Flow node — renders both router and host devices.
// Distinct styling per type plus a status dot driven from the store.
import { Handle, Position, type NodeProps } from 'reactflow';
import type { DeviceNodeData } from '../types';
import { useStore } from '../store';

export default function DeviceNode({ id, data }: NodeProps<DeviceNodeData>) {
  const focused = useStore((s) => s.focusedTerminal === id);
  const icon = data.deviceType === 'router' ? '◆' : '■';
  return (
    <div className={`device-node ${data.deviceType} ${focused ? 'focused' : ''}`}>
      {/* Connectable on all four sides for cleaner topologies. */}
      <Handle type="source" position={Position.Top} />
      <Handle type="target" position={Position.Bottom} />
      <Handle type="source" position={Position.Left} />
      <Handle type="target" position={Position.Right} />
      <div className="icon">{icon}</div>
      <div>
        <div className="label">{data.name}</div>
        <div className="sub">{data.deviceType}</div>
      </div>
      <div className={`status-dot ${data.status}`} title={`status: ${data.status}`} />
    </div>
  );
}
