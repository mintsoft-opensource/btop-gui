'use client';

import { useEffect } from 'react';
import { APPEARANCES, HISTORY_LENGTHS, INTERVALS, THEMES, type Settings } from '@/lib/settings';
import { Dialog, button } from './ui';

interface Props {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onClose: () => void;
}

function Choice<T extends string | number | boolean>({ value, options, label, onPick }: { value: T; options: readonly T[]; label: (option: T) => string; onPick: (option: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => (
        <button key={String(option)} type="button" className={button(option === value ? 'on' : 'plain')} onClick={() => onPick(option)}>
          {label(option)}
        </button>
      ))}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <span className="pt-1.5 text-[10px] tracking-[0.25em] text-muted">{label}</span>
      {children}
    </>
  );
}

export function SettingsDialog({ settings, onChange, onClose }: Props) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <Dialog title="SETTINGS" wide onClose={onClose}>
      <div className="grid grid-cols-[auto_1fr] items-start gap-x-[18px] gap-y-3">
        <Row label="APPEARANCE">
          <Choice value={settings.appearance} options={APPEARANCES} label={(mode) => mode.toUpperCase()} onPick={(appearance) => onChange({ appearance })} />
        </Row>
        <Row label="THEME">
          <Choice value={settings.theme} options={THEMES} label={(theme) => theme.toUpperCase()} onPick={(theme) => onChange({ theme })} />
        </Row>
        <Row label="SCANLINES">
          <Choice value={settings.scanlines} options={[true, false]} label={(on) => (on ? 'ON' : 'OFF')} onPick={(scanlines) => onChange({ scanlines })} />
        </Row>
        <Row label="TEMPERATURE">
          <Choice value={settings.tempUnit} options={['C', 'F'] as const} label={(unit) => `°${unit}`} onPick={(tempUnit) => onChange({ tempUnit })} />
        </Row>
        <Row label="GRAPH LENGTH">
          <Choice value={settings.historyLength} options={HISTORY_LENGTHS} label={(n) => `${n} pts`} onPick={(historyLength) => onChange({ historyLength })} />
        </Row>
        <Row label="REFRESH">
          <Choice value={settings.intervalMs} options={INTERVALS} label={(ms) => (ms < 1000 ? `${ms}ms` : `${ms / 1000}s`)} onPick={(intervalMs) => onChange({ intervalMs })} />
        </Row>
      </div>
      <div className="mt-1.5 flex justify-end gap-2">
        <button className={button('on')} onClick={onClose}>DONE</button>
      </div>
    </Dialog>
  );
}
