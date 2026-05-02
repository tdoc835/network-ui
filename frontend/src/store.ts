// Single zustand store for the whole app. Holds the React Flow nodes/edges
// (which double as the source of truth for the topology) and the runtime
// state we layer on top: container statuses, open terminals, focused tab.
import { create } from 'zustand';
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from 'reactflow';

import type { InterfaceMap } from './api';
import type { DeviceNodeData, DeviceType, LinkMeta, NodeStatus, Topology } from './types';

export type FlowNode = Node<DeviceNodeData>;
export type FlowEdge = Edge<LinkMeta>;

interface State {
  labName: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  containerStatus: Record<string, NodeStatus>; // keyed by container name
  openTerminals: string[]; // node ids
  focusedTerminal: string | null;
  infoMessage: string | null;
  // The node whose interface info panel is currently open, or null.
  inspectedNodeId: string | null;

  setLabName: (n: string) => void;
  onNodesChange: (c: NodeChange[]) => void;
  onEdgesChange: (c: EdgeChange[]) => void;
  onConnect: (c: Connection, subnet: string) => void;
  addDevice: (type: DeviceType, name: string) => void;
  setStatus: (containerName: string, s: NodeStatus) => void;
  resetStatuses: () => void;
  // Reset the per-node `data.status` to 'idle' (grey dots).
  clearNodeStatuses: () => void;
  openTerminal: (nodeId: string) => void;
  closeTerminal: (nodeId: string) => void;
  closeAllTerminals: () => void;
  focusTerminal: (nodeId: string) => void;
  loadTopology: (t: Topology) => void;
  toTopology: () => Topology;
  showInfo: (msg: string, ms?: number) => void;
  inspectNode: (nodeId: string | null) => void;
  // After deploy, write actual interface names onto each edge so the
  // canvas can show the real ethN (or 'et', etc.) the kernel uses.
  applyInterfaceMap: (map: InterfaceMap) => void;
  // After destroy, drop the actual interface names so the canvas stops
  // showing stale info.
  clearActualInterfaces: () => void;
}

let _idCounter = 1;
const nextId = () => `n${_idCounter++}`;

// Walk edges in array order and assign ethN per node — same numbering the
// backend's lab.yml generator uses, so the labels on the canvas match the
// real interface names inside each container. The labels themselves are
// rendered by the InterfaceEdge component from data.sourceIf / data.targetIf.
function assignInterfaces(edges: FlowEdge[]): FlowEdge[] {
  const ethCount: Record<string, number> = {};
  const nextEth = (nodeId: string) => {
    ethCount[nodeId] = (ethCount[nodeId] ?? 0) + 1;
    return `eth${ethCount[nodeId]}`;
  };
  return edges.map((e) => {
    const sourceIf = nextEth(e.source);
    const targetIf = nextEth(e.target);
    return {
      ...e,
      data: { ...(e.data ?? { subnet: '' }), sourceIf, targetIf },
    };
  });
}

export const useStore = create<State>((set, get) => ({
  labName: 'mylab',
  nodes: [],
  edges: [],
  containerStatus: {},
  openTerminals: [],
  focusedTerminal: null,
  infoMessage: null,
  inspectedNodeId: null,

  setLabName: (n) => set({ labName: n }),

  onNodesChange: (changes) => {
    set((s) => {
      const nodes = applyNodeChanges(changes, s.nodes);
      // If a node was removed, drop edges that reference it. React Flow
      // doesn't auto-cascade, and orphaned edges would skew our ethN
      // numbering for the remaining links.
      const ids = new Set(nodes.map((n) => n.id));
      const edges = s.edges.filter((e) => ids.has(e.source) && ids.has(e.target));
      return { nodes, edges: assignInterfaces(edges) };
    });
  },

  onEdgesChange: (changes) =>
    set((s) => ({ edges: assignInterfaces(applyEdgeChanges(changes, s.edges)) })),

  // Called by React Flow when the user finishes dragging an edge.
  onConnect: (conn, subnet) =>
    set((s) => ({
      edges: assignInterfaces(addEdge(
        {
          ...conn,
          id: `e${Date.now()}`,
          data: { subnet },
        } as FlowEdge,
        s.edges,
      )),
    })),

  addDevice: (type, name) => {
    // Spread new nodes diagonally so they don't stack on top of each other.
    const count = get().nodes.length;
    const x = 80 + (count % 5) * 180;
    const y = 80 + Math.floor(count / 5) * 140;
    const node: FlowNode = {
      id: nextId(),
      type: 'device',
      position: { x, y },
      data: { name, deviceType: type, status: 'idle' },
    };
    set((s) => ({ nodes: [...s.nodes, node] }));
  },

  setStatus: (name, s) =>
    set((st) => ({ containerStatus: { ...st.containerStatus, [name]: s } })),

  resetStatuses: () => set({ containerStatus: {} }),

  // After a destroy, every node should flip back to a grey dot.
  clearNodeStatuses: () =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.data.status === 'idle' ? n : { ...n, data: { ...n.data, status: 'idle' } },
      ),
    })),

  openTerminal: (id) =>
    set((s) =>
      s.openTerminals.includes(id)
        ? { focusedTerminal: id }
        : { openTerminals: [...s.openTerminals, id], focusedTerminal: id },
    ),

  closeTerminal: (id) =>
    set((s) => ({
      openTerminals: s.openTerminals.filter((t) => t !== id),
      focusedTerminal: s.focusedTerminal === id ? null : s.focusedTerminal,
    })),

  // Unmounting every TerminalPanel triggers its useEffect cleanup, which
  // closes the WebSocket. The backend's WS handler then exits its gather()
  // loop and the finally block kills the PTY child.
  closeAllTerminals: () => set({ openTerminals: [], focusedTerminal: null }),

  focusTerminal: (id) => set({ focusedTerminal: id }),

  loadTopology: (t) => {
    // Rehydrate the React Flow graph from a saved Topology.
    const nodes: FlowNode[] = t.nodes.map((n) => ({
      id: n.id,
      type: 'device',
      position: n.position,
      data: { name: n.name, deviceType: n.type, status: 'idle' },
    }));
    // Build edges then run assignInterfaces so the labels include the
    // ethN names — the JSON file doesn't store them since they're
    // derived from order.
    const edges: FlowEdge[] = assignInterfaces(
      t.links.map((l) => ({
        id: l.id,
        source: l.source,
        target: l.target,
        data: { subnet: l.subnet, sourceIp: l.sourceIp, targetIp: l.targetIp },
      })),
    );
    // Make sure new nodes don't collide with loaded ones.
    const maxN = nodes.reduce((m, n) => {
      const num = parseInt(n.id.replace(/^n/, ''), 10);
      return Number.isFinite(num) && num > m ? num : m;
    }, 0);
    _idCounter = maxN + 1;
    set({
      labName: t.name,
      nodes,
      edges,
      containerStatus: {},
      openTerminals: [],
      focusedTerminal: null,
      inspectedNodeId: null,
    });
  },

  toTopology: (): Topology => {
    const s = get();
    return {
      name: s.labName,
      nodes: s.nodes.map((n) => ({
        id: n.id,
        name: n.data.name,
        type: n.data.deviceType,
        position: n.position,
      })),
      links: s.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        subnet: e.data?.subnet ?? '',
        sourceIp: e.data?.sourceIp,
        targetIp: e.data?.targetIp,
      })),
    };
  },

  inspectNode: (nodeId) => set({ inspectedNodeId: nodeId }),

  applyInterfaceMap: (map) =>
    set((s) => ({
      edges: s.edges.map((e) => {
        const sourceName = s.nodes.find((n) => n.id === e.source)?.data.name;
        const targetName = s.nodes.find((n) => n.id === e.target)?.data.name;
        const expectedSrc = e.data?.sourceIf;
        const expectedTgt = e.data?.targetIf;
        const actualSourceIf =
          sourceName && expectedSrc ? map[sourceName]?.[expectedSrc] : undefined;
        const actualTargetIf =
          targetName && expectedTgt ? map[targetName]?.[expectedTgt] : undefined;
        return {
          ...e,
          data: { ...(e.data ?? { subnet: '' }), actualSourceIf, actualTargetIf },
        };
      }),
    })),

  clearActualInterfaces: () =>
    set((s) => ({
      edges: s.edges.map((e) => ({
        ...e,
        data: { ...(e.data ?? { subnet: '' }), actualSourceIf: undefined, actualTargetIf: undefined },
      })),
    })),

  // Tiny toast: surfaces a message in the UI for `ms` ms then clears it.
  showInfo: (msg, ms = 3000) => {
    set({ infoMessage: msg });
    window.setTimeout(() => {
      // Only clear if it's still the same message (avoid clobbering a newer one).
      if (useStore.getState().infoMessage === msg) set({ infoMessage: null });
    }, ms);
  },
}));

export const containerNameFor = (labName: string, nodeName: string) =>
  `clab-${labName}-${nodeName}`;
