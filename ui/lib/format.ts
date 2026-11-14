const UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];

export function bytes(value: number, digits = 1): string {
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), UNITS.length - 1);
  const scaled = value / 1024 ** exponent;
  return `${exponent === 0 ? Math.round(scaled) : scaled.toFixed(scaled >= 100 ? 0 : digits)} ${UNITS[exponent]}`;
}

export function rate(value: number): string {
  return `${bytes(value)}/s`;
}

export function bits(value: number): string {
  const megabits = (value * 8) / 1e6;
  if (megabits >= 1000) return `${(megabits / 1000).toFixed(2)} Gb/s`;
  if (megabits >= 1) return `${megabits.toFixed(megabits >= 100 ? 0 : 1)} Mb/s`;
  return `${Math.round(value * 8 / 1e3)} Kb/s`;
}

export function percent(value: number, digits = 0): string {
  return `${(Number.isFinite(value) ? value : 0).toFixed(digits)}%`;
}

export function ratio(part: number, whole: number): number {
  return whole > 0 ? Math.min(100, Math.max(0, (part / whole) * 100)) : 0;
}

export function duration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${s % 60}s`;
}

export function level(value: number, warn = 70, crit = 90): 'ok' | 'warn' | 'crit' {
  return value >= crit ? 'crit' : value >= warn ? 'warn' : 'ok';
}

export type TempUnit = 'C' | 'F';

export function temperature(celsius: number, unit: TempUnit): string {
  return unit === 'F' ? `${Math.round(celsius * 1.8 + 32)}°F` : `${Math.round(celsius)}°C`;
}

export function span(seconds: number): string {
  if (seconds >= 3600) return `${+(seconds / 3600).toFixed(1)}h`;
  if (seconds >= 60) return `${+(seconds / 60).toFixed(1)}m`;
  return `${Math.round(seconds)}s`;
}

export function hostLabel(name: string): string {
  return name.replace(/\.(local|lan|home|localdomain)$/i, '');
}

export function clockTime(unixSeconds: number): string {
  if (!unixSeconds) return '—';
  const date = new Date(unixSeconds * 1000);
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay ? date.toTimeString().slice(0, 8) : `${date.toISOString().slice(0, 10)} ${date.toTimeString().slice(0, 5)}`;
}
