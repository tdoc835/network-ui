// Shared types between the canvas, the store, and the API client.

export type DeviceType = 'router' | 'host' | 'switch';

// Switches use containerlab kind: bridge — pure L2, no exec, no terminal.
export const HAS_TERMINAL: Record<DeviceType, boolean> = {
  router: true,
  host: true,
  switch: false,
};

export type NodeStatus = 'idle' | 'running' | 'error';

export interface DeviceNodeData {
  name: string;
  deviceType: DeviceType;
  status: NodeStatus;
}

export interface LinkMeta {
  subnet: string;
  sourceIp?: string;
  targetIp?: string;
  // Per-end interface name. sourceIf/targetIf are the expected ethN —
  // computed from edge order, matching what's in lab.yml. After deploy,
  // actualSourceIf/actualTargetIf are populated from `ip link show`
  // inside each container; some images rename links (e.g. eth1 → et).
  sourceIf?: string;
  targetIf?: string;
  actualSourceIf?: string;
  actualTargetIf?: string;
}

// Persisted topology — what we POST to /api/labs/{name} and /api/deploy.
export interface Topology {
  name: string;
  nodes: Array<{
    id: string;
    name: string;
    type: DeviceType;
    position: { x: number; y: number };
  }>;
  links: Array<{
    id: string;
    source: string;
    target: string;
    subnet: string;
    sourceIp?: string;
    targetIp?: string;
    sourceIf?: string;
    targetIf?: string;
    actualSourceIf?: string;
    actualTargetIf?: string;
  }>;
}

export interface ContainerInfo {
  name: string;
  status: string;
  state: string;
}
