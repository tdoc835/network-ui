// Custom React Flow edge: three labels per link.
//
//   ●─[eth1]─────── 10.0.1.0/24 ───────[eth2]─●
//
// The two end labels sit ~18% in from each endpoint so they always
// hug the device they belong to, regardless of edge length or angle.
// The subnet label uses React Flow's natural mid-path coordinates
// (so it follows the bezier curve, not just the straight line).
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from 'reactflow';

import type { LinkMeta } from '../types';

export default function InterfaceEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  style,
  markerEnd,
  selected,
}: EdgeProps<LinkMeta>) {
  const [edgePath, midX, midY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  // Linear interpolation between the endpoints — works well visually
  // even when the underlying path is a bezier.
  const lerp = (t: number) => ({
    x: sourceX + (targetX - sourceX) * t,
    y: sourceY + (targetY - sourceY) * t,
  });
  const src = lerp(0.18);
  const tgt = lerp(0.82);

  const pill = (x: number, y: number, text: string | undefined, kind: 'iface' | 'subnet') => {
    if (!text) return null;
    return (
      <div
        className={`edge-pill ${kind} ${selected ? 'selected' : ''}`}
        style={{ transform: `translate(-50%, -50%) translate(${x}px, ${y}px)` }}
      >
        {text}
      </div>
    );
  };

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={style} markerEnd={markerEnd} />
      <EdgeLabelRenderer>
        {pill(src.x, src.y, data?.sourceIf, 'iface')}
        {pill(midX, midY, data?.subnet, 'subnet')}
        {pill(tgt.x, tgt.y, data?.targetIf, 'iface')}
      </EdgeLabelRenderer>
    </>
  );
}
