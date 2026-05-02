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

  // If the kernel renamed an interface inside the container (eth1 → et,
  // for instance), show the actual name in brackets so it stands out;
  // otherwise stick with the expected ethN.
  const labelFor = (expected?: string, actual?: string) => {
    if (!expected) return undefined;
    if (actual && actual !== expected) return `[${actual}]`;
    return expected;
  };
  const renamedClass = (expected?: string, actual?: string) =>
    actual && expected && actual !== expected ? 'renamed' : '';

  const pill = (
    x: number,
    y: number,
    text: string | undefined,
    kind: 'iface' | 'subnet',
    extraClass = '',
  ) => {
    if (!text) return null;
    return (
      <div
        className={`edge-pill ${kind} ${extraClass} ${selected ? 'selected' : ''}`}
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
        {pill(
          src.x,
          src.y,
          labelFor(data?.sourceIf, data?.actualSourceIf),
          'iface',
          renamedClass(data?.sourceIf, data?.actualSourceIf),
        )}
        {pill(midX, midY, data?.subnet, 'subnet')}
        {pill(
          tgt.x,
          tgt.y,
          labelFor(data?.targetIf, data?.actualTargetIf),
          'iface',
          renamedClass(data?.targetIf, data?.actualTargetIf),
        )}
      </EdgeLabelRenderer>
    </>
  );
}
