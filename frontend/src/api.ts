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

export const api = {
  listLabs: () => jget<string[]>('/api/labs'),
  loadLab: (name: string) => jget<Topology>(`/api/labs/${name}`),
  saveLab: (name: string, topology: Topology) =>
    jpost(`/api/labs/${name}`, topology),
  deploy: (topology: Topology) =>
    jpost<{ ok: boolean; output: string; topology: Topology }>('/api/deploy', topology),
  destroy: () => jpost<{ ok: boolean; output: string }>('/api/destroy', {}),
  containers: () => jget<ContainerInfo[]>('/api/containers'),
};
