'use client';

import { useEffect } from 'react';
import { bytes } from '@/lib/format';
import type { ProcessInfo } from '@/lib/types';
import { Dialog, button } from './ui';

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
    <Dialog title="END PROCESS" onClose={onCancel}>
      <p>
        <b>{process.name}</b> (PID {process.pid}) on <b>{host}</b>
      </p>
      <p className="text-muted">{process.user || 'unknown user'} · {bytes(process.memory)} · {process.cpu.toFixed(1)}% CPU</p>
      <p className="max-h-[6em] overflow-auto text-[11px] break-all text-muted select-text">{process.command}</p>
      <div className="mt-1.5 flex justify-end gap-2">
        <button className={button()} onClick={onCancel}>CANCEL</button>
        <button className={button('warn')} autoFocus onClick={() => onSignal(false)}>TERMINATE</button>
        <button className={button('crit')} onClick={() => onSignal(true)}>FORCE KILL</button>
      </div>
    </Dialog>
  );
}
