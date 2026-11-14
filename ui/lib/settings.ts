import type { TempUnit } from './format';

export type Theme = 'phosphor' | 'amber' | 'matrix';
export type Appearance = 'system' | 'light' | 'dark';

export interface Settings {
  intervalMs: number;
  historyLength: number;
  tempUnit: TempUnit;
  theme: Theme;
  appearance: Appearance;
  scanlines: boolean;
}

export const THEMES: Theme[] = ['phosphor', 'amber', 'matrix'];
export const APPEARANCES: Appearance[] = ['system', 'light', 'dark'];
export const INTERVALS = [250, 500, 1000, 2000, 5000];
export const HISTORY_LENGTHS = [60, 120, 300, 600];

const STORAGE_KEY = 'btop-gui.settings';

export const DEFAULT_SETTINGS: Settings = {
  intervalMs: 1000,
  historyLength: 120,
  tempUnit: 'C',
  theme: 'phosphor',
  appearance: 'system',
  scanlines: true,
};

export function sanitize(input: unknown): Settings {
  const raw = (input && typeof input === 'object' ? input : {}) as Partial<Record<keyof Settings, unknown>>;
  const pick = <T>(value: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(value as T) ? (value as T) : fallback);
  return {
    intervalMs: pick(raw.intervalMs, INTERVALS, DEFAULT_SETTINGS.intervalMs),
    historyLength: pick(raw.historyLength, HISTORY_LENGTHS, DEFAULT_SETTINGS.historyLength),
    tempUnit: pick(raw.tempUnit, ['C', 'F'] as const, DEFAULT_SETTINGS.tempUnit),
    theme: pick(raw.theme, THEMES, DEFAULT_SETTINGS.theme),
    appearance: pick(raw.appearance, APPEARANCES, DEFAULT_SETTINGS.appearance),
    scanlines: typeof raw.scanlines === 'boolean' ? raw.scanlines : DEFAULT_SETTINGS.scanlines,
  };
}

let current: Settings = DEFAULT_SETTINGS;
let loaded = false;
const listeners = new Set<() => void>();

export function getSettings(): Settings {
  if (!loaded && typeof window !== 'undefined') {
    loaded = true;
    try {
      current = sanitize(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}'));
    } catch {
      current = DEFAULT_SETTINGS;
    }
  }
  return current;
}

export function getServerSettings(): Settings {
  return DEFAULT_SETTINGS;
}

export function updateSettings(patch: Partial<Settings>): void {
  current = sanitize({ ...getSettings(), ...patch });
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {}
  listeners.forEach((listener) => listener());
}

export function subscribeSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
