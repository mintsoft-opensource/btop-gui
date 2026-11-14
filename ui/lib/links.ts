import { MAX_HISTORY, pushSample, sampleOf, trackProcesses, type ProcessHistory, type Sample } from './history';
import type { KillResult, LinkStatus, Snapshot } from './types';

export interface LinkState {
  status: LinkStatus;
  error: string | null;
  snapshot: Snapshot | null;
  history: Sample[];
  processHistory: ProcessHistory;
}

const initialState: LinkState = { status: 'connecting', error: null, snapshot: null, history: [], processHistory: new Map() };

export class LocalLink {
  private listeners = new Set<() => void>();
  private state: LinkState = initialState;
  private unlisten: (() => void) | null = null;
  private closed = false;

  constructor() {
    void this.start();
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getState = () => this.state;

  private update(patch: Partial<LinkState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  private async start() {
    try {
      const { listen } = await import('@tauri-apps/api/event');
      const unlisten = await listen<Snapshot>('snapshot', ({ payload }) =>
        this.update({
          snapshot: payload,
          history: pushSample(this.state.history, sampleOf(payload), MAX_HISTORY),
          processHistory: trackProcesses(this.state.processHistory, payload.processes),
          status: 'online',
          error: null,
        }),
      );
      if (this.closed) unlisten();
      else this.unlisten = unlisten;
    } catch (error) {
      this.update({ status: 'offline', error: String(error) });
    }
  }

  async setInterval(ms: number): Promise<void> {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('set_interval', { ms });
  }

  async kill(pid: number, force: boolean): Promise<KillResult> {
    const { invoke } = await import('@tauri-apps/api/core');
    try {
      await invoke('kill_process', { pid, force });
      return { ok: true, message: force ? 'SIGKILL sent' : 'SIGTERM sent' };
    } catch (error) {
      return { ok: false, message: String(error) };
    }
  }

  close() {
    this.closed = true;
    this.unlisten?.();
  }
}

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}
