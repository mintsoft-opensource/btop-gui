import { ratio } from './format';
import type { Sample } from './history';
import type { Snapshot } from './types';

export type AlertLevel = 'warn' | 'crit';

export interface Alert {
  id: string;
  label: string;
  level: AlertLevel;
  message: string;
}

export interface AlertEvent {
  at: number;
  id: string;
  level: AlertLevel | 'ok';
  message: string;
}

const SUSTAIN_SAMPLES = 5;
export const MAX_EVENTS = 100;
const RESOLVE_AFTER = 5;

function grade(value: number, warn: number, crit: number): AlertLevel | null {
  return value >= crit ? 'crit' : value >= warn ? 'warn' : null;
}

export function detectAlerts(snapshot: Snapshot, history: Sample[]): Alert[] {
  const alerts: Alert[] = [];
  const push = (id: string, label: string, level: AlertLevel | null, message: string) => {
    if (level) alerts.push({ id, label, level, message });
  };

  const recent = history.slice(-SUSTAIN_SAMPLES);
  if (recent.length >= SUSTAIN_SAMPLES) {
    const cpu = recent.reduce((sum, sample) => sum + sample.cpu, 0) / recent.length;
    push('cpu', 'CPU', grade(cpu, 75, 90), `CPU sustained at ${cpu.toFixed(0)}%`);
  }

  const { memory } = snapshot;
  const used = ratio(memory.used, memory.total);
  push('memory', 'Memory', grade(used, 85, 92), `Memory at ${used.toFixed(0)}%`);
  if (memory.swapTotal > 0) {
    const swap = ratio(memory.swapUsed, memory.swapTotal);
    push('swap', 'Swap', grade(swap, 80, 95), `Swap at ${swap.toFixed(0)}%`);
  }

  if (snapshot.cpu.temperature) {
    push('temp', 'CPU temperature', grade(snapshot.cpu.temperature, 80, 90), `CPU temperature ${snapshot.cpu.temperature.toFixed(0)}°C`);
  }

  for (const disk of snapshot.disks) {
    const full = ratio(disk.total - disk.available, disk.total);
    push(`disk:${disk.mount}`, `Volume ${disk.mount}`, grade(full, 85, 95), `Volume ${disk.mount} ${full.toFixed(0)}% full`);
  }

  const battery = snapshot.battery;
  if (battery && !battery.plugged) {
    push('battery', 'Battery', grade(100 - battery.percent, 80, 90), `Battery at ${battery.percent.toFixed(0)}%`);
  }

  return alerts;
}

export interface TrackedAlert {
  alert: Alert;
  missing: number;
}

export function diffAlerts(
  previous: ReadonlyMap<string, TrackedAlert>,
  current: Alert[],
  at: number,
  settle = RESOLVE_AFTER,
): { active: Map<string, TrackedAlert>; events: AlertEvent[] } {
  const active = new Map<string, TrackedAlert>();
  const events: AlertEvent[] = [];
  for (const alert of current) {
    const seen = previous.get(alert.id)?.alert;
    if (!seen || (seen.level === 'warn' && alert.level === 'crit')) events.push({ at, id: alert.id, level: alert.level, message: alert.message });
    active.set(alert.id, { alert: { ...alert, level: seen?.level === 'crit' ? 'crit' : alert.level }, missing: 0 });
  }
  for (const [id, tracked] of previous) {
    if (active.has(id)) continue;
    if (tracked.missing + 1 >= settle) events.push({ at, id, level: 'ok', message: `${tracked.alert.label} back to normal` });
    else active.set(id, { ...tracked, missing: tracked.missing + 1 });
  }
  return { active, events };
}

export function overall(alerts: Iterable<Alert>): 'ok' | AlertLevel {
  let level: 'ok' | AlertLevel = 'ok';
  for (const alert of alerts) {
    if (alert.level === 'crit') return 'crit';
    level = 'warn';
  }
  return level;
}

const ALERT_METRIC: [RegExp, string][] = [
  [/^(cpu|temp)$/, 'cpu'],
  [/^(memory|swap)$/, 'memory'],
  [/^disk:/, 'disk'],
  [/^battery$/, 'battery'],
];

export function metricOf(alert: Alert): string | null {
  return ALERT_METRIC.find(([pattern]) => pattern.test(alert.id))?.[1] ?? null;
}
