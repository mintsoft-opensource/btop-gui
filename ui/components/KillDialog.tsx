'use client';

import { useEffect } from 'react';
import { bytes } from '@/lib/format';
import type { ProcessInfo } from '@/lib/types';

interface Props {
  process: ProcessInfo;
  host: string;
  onSignal: (force: boolean) => void;
  onCancel: () => void;
}

export function KillDialog({ process, host, onSignal, onCancel }: Props) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="dialog" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <h3>SIGNAL PROCESS</h3>
        <p>
          <b>{process.name}</b> (PID {process.pid}) on <b>{host}</b>
        </p>
        <p className="muted">{process.user || 'unknown user'} · {bytes(process.memory)} · {process.cpu.toFixed(1)}% CPU</p>
        <p className="cmdline">{process.command}</p>
        <div className="actions">
          <button onClick={onCancel}>CANCEL</button>
          <button className="warn" autoFocus onClick={() => onSignal(false)}>TERMINATE</button>
          <button className="crit" onClick={() => onSignal(true)}>FORCE KILL</button>
        </div>
      </div>
    </div>
  );
}
