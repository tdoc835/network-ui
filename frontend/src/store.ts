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
}

let _idCounter = 1;
const nextId = () => `n${_idCounter++}`;

export const useStore = create<State>((set, get) => ({
  labName: 'mylab',
  nodes: [],
  edges: [],
  containerStatus: {},
  openTerminals: [],
  focusedTerminal: null,
  infoMessage: null,

  setLabName: (n) => set({ labName: n }),

  onNodesChange: (changes) =>
    set((s) => ({ nodes: applyNodeChanges(changes, s.nodes) })),

  onEdgesChange: (changes) =>
    set((s) => ({ edges: applyEdgeChanges(changes, s.edges) })),

  // Called by React Flow when the user finishes dragging an edge.
  onConnect: (conn, subnet) =>
    set((s) => ({
      edges: addEdge(
        {
          ...conn,
          id: `e${Date.now()}`,
          data: { subnet },
          // Show the subnet on the edge so the canvas reads as a real diagram.
          label: subnet,
          labelStyle: { fill: '#475569', fontSize: 11, fontWeight: 500 },
          labelBgStyle: { fill: '#fff', fillOpacity: 0.9 },
        } as FlowEdge,
        s.edges,
      ),
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
    const edges: FlowEdge[] = t.links.map((l) => ({
      id: l.id,
      source: l.source,
      target: l.target,
      data: { subnet: l.subnet, sourceIp: l.sourceIp, targetIp: l.targetIp },
      label: l.subnet,
      labelStyle: { fill: '#475569', fontSize: 11, fontWeight: 500 },
      labelBgStyle: { fill: '#fff', fillOpacity: 0.9 },
    }));
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
