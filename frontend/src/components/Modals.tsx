// Tiny modal primitives. The "load lab" dialog needs a list, so we don't
// just lean on window.prompt() everywhere.
import { useEffect, useState } from 'react';

export function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export function LoadLabModal({
  labs,
  onPick,
  onClose,
}: {
  labs: string[];
  onPick: (name: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal onClose={onClose}>
      <h3>Load lab</h3>
      {labs.length === 0 ? (
        <div style={{ padding: 16, color: '#94a3b8', fontSize: 13 }}>No saved labs yet.</div>
      ) : (
        <div className="lab-list">
          {labs.map((name) => (
            <div key={name} className="item" onClick={() => onPick(name)}>
              {name}
            </div>
          ))}
        </div>
      )}
      <div className="actions">
        <button className="btn" onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  );
}

export function PromptModal({
  title,
  placeholder,
  defaultValue,
  validate,
  onSubmit,
  onClose,
}: {
  title: string;
  placeholder?: string;
  defaultValue?: string;
  // Return null if the value is acceptable, or an error string to display.
  validate?: (value: string) => string | null;
  onSubmit: (value: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(defaultValue ?? '');
  const trimmed = value.trim();
  const error = trimmed && validate ? validate(trimmed) : null;
  const canSubmit = trimmed.length > 0 && !error;

  const submit = () => {
    if (canSubmit) onSubmit(trimmed);
  };

  return (
    <Modal onClose={onClose}>
      <h3>{title}</h3>
      <input
        autoFocus
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
        style={{
          width: '100%',
          padding: '8px 10px',
          border: `1px solid ${error ? '#fecaca' : '#e2e8f0'}`,
          borderRadius: 6,
          fontSize: 13,
          fontFamily: 'inherit',
          marginBottom: error ? 4 : 12,
        }}
      />
      {error && (
        <div style={{ color: '#b91c1c', fontSize: 12, marginBottom: 12 }}>
          {error}
        </div>
      )}
      <div className="actions">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!canSubmit} onClick={submit}>
          OK
        </button>
      </div>
    </Modal>
  );
}
