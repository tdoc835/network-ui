// Floating card on the canvas that shows interface info for a clicked node.
//
// Closed by default; opens when the user clicks any router/host node.
// For each link attached to that node we show:
//   - the expected ethN
//   - the actual interface name reported by `ip link show` (if it
//     differs, post-deploy)
//   - the IP we auto-assigned
//   - a copy-paste-able `ip addr add` command using the *actual* name
//
// Switches are skipped — they're kind: bridge with no exec / no IP.
import { useStore } from '../store';

export default function NodeInfoPanel() {
  const inspectedId = useStore((s) => s.inspectedNodeId);
  const node = useStore((s) =>
    inspectedId ? s.nodes.find((n) => n.id === inspectedId) : undefined,
  );
  const edges = useStore((s) => s.edges);
  const nodes = useStore((s) => s.nodes);
  const inspectNode = useStore((s) => s.inspectNode);

  if (!node || node.data.deviceType === 'switch') return null;

  type Row = {
    expected: string;
    actual?: string;
    ip?: string;
    peer: string;
  };

  const rows: Row[] = edges
    .filter((e) => e.source === node.id || e.target === node.id)
    .map((e) => {
      const isSource = e.source === node.id;
      const peerId = isSource ? e.target : e.source;
      const peer = nodes.find((n) => n.id === peerId)?.data.name ?? '?';
      return {
        expected: (isSource ? e.data?.sourceIf : e.data?.targetIf) ?? '?',
        actual: isSource ? e.data?.actualSourceIf : e.data?.actualTargetIf,
        ip: isSource ? e.data?.sourceIp : e.data?.targetIp,
        peer,
      };
    });

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      useStore.getState().showInfo('Copied');
    } catch {
      // clipboard might be blocked; ignore.
    }
  };

  return (
    <div className="node-info-panel">
      <header>
        <span className="dot" data-kind={node.data.deviceType} />
        <strong>{node.data.name}</strong>
        <span className="kind">{node.data.deviceType}</span>
        <button className="close" onClick={() => inspectNode(null)} title="Close">
          ×
        </button>
      </header>
      {rows.length === 0 ? (
        <div className="empty">No links yet — drag from this node to connect.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>iface</th>
              <th>peer</th>
              <th>ip</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const renamed = r.actual && r.actual !== r.expected;
              const cmd = r.ip
                ? `ip addr add ${r.ip} dev ${r.actual ?? r.expected}`
                : null;
              return (
                <tr key={i}>
                  <td>
                    <code>{r.expected}</code>
                    {renamed && <code className="rename"> → {r.actual}</code>}
                  </td>
                  <td>{r.peer}</td>
                  <td>
                    {cmd ? (
                      <button
                        className="cmd"
                        onClick={() => copy(cmd)}
                        title={`Copy: ${cmd}`}
                      >
                        <code>{r.ip}</code>
                      </button>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <footer>Click an IP to copy its full <code>ip addr add</code> command.</footer>
    </div>
  );
}
