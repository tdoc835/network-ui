// Toolbar above the canvas. Buttons drive the store + REST calls.
import { useState } from 'react';
import { api } from '../api';
import { useStore } from '../store';
import { LoadLabModal, PromptModal } from './Modals';

export default function Toolbar() {
  const addDevice = useStore((s) => s.addDevice);
  const toTopology = useStore((s) => s.toTopology);
  const loadTopology = useStore((s) => s.loadTopology);
  const setLabName = useStore((s) => s.setLabName);
  const nodes = useStore((s) => s.nodes);
  const openTerminal = useStore((s) => s.openTerminal);
  const resetStatuses = useStore((s) => s.resetStatuses);

  const [busy, setBusy] = useState(false);
  const [labsList, setLabsList] = useState<string[] | null>(null);
  const [prompt, setPrompt] = useState<{
    title: string;
    placeholder?: string;
    onSubmit: (v: string) => void;
  } | null>(null);

  const askName = (kind: 'router' | 'host') => {
    const existing = nodes.filter((n) => n.data.deviceType === kind).length;
    const suggested = kind === 'router' ? `r${existing + 1}` : `host${existing + 1}`;
    setPrompt({
      title: `Add ${kind}`,
      placeholder: `Name (e.g. ${suggested})`,
      onSubmit: (name) => {
        addDevice(kind, name);
        setPrompt(null);
      },
    });
  };

  const onDeploy = async () => {
    if (nodes.length === 0) {
      alert('Add at least one device first.');
      return;
    }
    setBusy(true);
    try {
      const topology = toTopology();
      const res = await api.deploy(topology);
      if (!res.ok) {
        alert('Deploy failed:\n\n' + (res.output || 'unknown error'));
      }
      // Open a terminal per node so the user lands ready-to-go.
      topology.nodes.forEach((n) => openTerminal(n.id));
      // Status dots are kept fresh by StatusSync's poll loop in App.
    } catch (e) {
      alert(`Deploy error: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const onDestroy = async () => {
    if (!confirm('Destroy the running lab?')) return;
    setBusy(true);
    try {
      const res = await api.destroy();
      if (!res.ok) alert('Destroy:\n\n' + (res.output || ''));
      resetStatuses();
    } finally {
      setBusy(false);
    }
  };

  const onSave = () => {
    setPrompt({
      title: 'Save lab as',
      placeholder: 'Lab name',
      onSubmit: async (name) => {
        setLabName(name);
        const t = toTopology();
        t.name = name;
        await api.saveLab(name, t);
        setPrompt(null);
      },
    });
  };

  const onLoad = async () => {
    const list = await api.listLabs();
    setLabsList(list);
  };

  const pickLab = async (name: string) => {
    const t = await api.loadLab(name);
    loadTopology(t);
    setLabsList(null);
  };

  return (
    <>
      <div className="toolbar">
        <button className="btn" onClick={() => askName('router')} disabled={busy}>
          + Router
        </button>
        <button className="btn" onClick={() => askName('host')} disabled={busy}>
          + Host
        </button>
        <div style={{ width: 1, height: 20, background: '#e2e8f0', margin: '0 4px' }} />
        <button className="btn primary" onClick={onDeploy} disabled={busy}>
          Deploy
        </button>
        <button className="btn danger" onClick={onDestroy} disabled={busy}>
          Destroy
        </button>
        <div className="spacer" />
        <button className="btn" onClick={onSave} disabled={busy}>Save Lab</button>
        <button className="btn" onClick={onLoad} disabled={busy}>Load Lab</button>
      </div>

      {prompt && (
        <PromptModal
          title={prompt.title}
          placeholder={prompt.placeholder}
          onSubmit={prompt.onSubmit}
          onClose={() => setPrompt(null)}
        />
      )}
      {labsList !== null && (
        <LoadLabModal labs={labsList} onPick={pickLab} onClose={() => setLabsList(null)} />
      )}
    </>
  );
}
