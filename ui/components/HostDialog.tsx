'use client';

import { useState } from 'react';
import { normalizeUrl } from '@/lib/hosts';
import type { HostConfig } from '@/lib/types';

interface Props {
  hosts: HostConfig[];
  onSave: (hosts: HostConfig[]) => void;
  onClose: () => void;
}

export function HostDialog({ hosts, onSave, onClose }: Props) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);

  const add = (event: React.FormEvent) => {
    event.preventDefault();
    const url = normalizeUrl(address);
    if (!url) return setError('Use host[:port] or ws(s)://host:port/ws');
    if (!token.trim()) return setError('Token is required (BTOP_GUI_TOKEN on the agent)');
    const id = crypto.randomUUID();
    onSave([...hosts, { id, name: name.trim() || new URL(url).hostname, url, token: token.trim() }]);
    setName('');
    setAddress('');
    setToken('');
    setError(null);
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog wide" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <h3>REMOTE HOSTS</h3>
        {hosts.length > 0 && (
          <ul className="host-list">
            {hosts.map((host) => (
              <li key={host.id}>
                <b>{host.name}</b>
                <span className="muted">{host.url}</span>
                <button onClick={() => onSave(hosts.filter((h) => h.id !== host.id))}>REMOVE</button>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={add} className="host-form">
          <label>NAME<input value={name} onChange={(e) => setName(e.target.value)} placeholder="build-server" /></label>
          <label>ADDRESS<input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="192.168.0.10:9100" required /></label>
          <label>TOKEN<input value={token} onChange={(e) => setToken(e.target.value)} type="password" autoComplete="off" required /></label>
          {error && <p className="error">{error}</p>}
          <div className="actions">
            <button type="button" onClick={onClose}>CLOSE</button>
            <button type="submit" className="primary">ADD HOST</button>
          </div>
        </form>
        <p className="muted small">Run the agent on the remote machine: <code>BTOP_GUI_TOKEN=… btop-gui-agent --bind 0.0.0.0:9100</code></p>
      </div>
    </div>
  );
}
