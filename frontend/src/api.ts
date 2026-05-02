// Tiny REST client. Vite proxies /api → backend, so URLs stay relative.
import type { ContainerInfo, Topology } from './types';

async function jget<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return r.json();
}

async function jpost<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return r.json();
}

export interface DeployResult {
  ok: boolean;
  output: string;
  topology: Topology;
  configsApplied: Array<{ node: string; ok: boolean; log: string }>;
}

export interface SaveLabResult {
  ok: boolean;
  path: string;
  configsCaptured: string[];
}

export const api = {
  listLabs: () => jget<string[]>('/api/labs'),
  loadLab: (name: string) =>
    jget<Topology & { hasSavedConfigs?: boolean }>(`/api/labs/${name}`),
  // captureFromLabName lets "Save As" pull configs from the currently-running
  // lab even though the new name differs.
  saveLab: (name: string, topology: Topology, captureFromLabName?: string) =>
    jpost<SaveLabResult>(`/api/labs/${name}`, {
      topology,
      captureFromLabName: captureFromLabName ?? topology.name,
    }),
  deploy: (topology: Topology, restoreConfig = false) =>
    jpost<DeployResult>('/api/deploy', { topology, restoreConfig }),
  destroy: () => jpost<{ ok: boolean; output: string }>('/api/destroy', {}),
  containers: () => jget<ContainerInfo[]>('/api/containers'),
};
