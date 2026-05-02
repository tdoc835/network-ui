// Shared types between the canvas, the store, and the API client.

export type DeviceType = 'router' | 'host';

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
  }>;
}

export interface ContainerInfo {
  name: string;
  status: string;
  state: string;
}
