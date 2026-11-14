import type { HostConfig } from './types';

const STORAGE_KEY = 'btop-gui.hosts';

export function normalizeUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) && !/^wss?:\/\//i.test(raw)) return null;
  const withScheme = /^wss?:\/\//i.test(raw) ? raw : `ws://${raw}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'ws:' && url.protocol !== 'wss:') return null;
    if (!url.port && url.protocol === 'ws:') url.port = '9100';
    if (url.pathname === '/' || url.pathname === '') url.pathname = '/ws';
    return url.toString();
  } catch {
    return null;
  }
}

export function loadHosts(): HostConfig[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed)
      ? parsed.filter((host): host is HostConfig => typeof host?.id === 'string' && typeof host?.url === 'string')
      : [];
  } catch {
    return [];
  }
}

export function saveHosts(hosts: HostConfig[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(hosts));
  } catch {}
}
