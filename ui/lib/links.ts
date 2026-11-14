import { pushSample, sampleOf, type Sample } from './history';
import type { HostConfig, KillResult, LinkStatus, ServerMessage, Snapshot } from './types';

export const LOCAL_ID = 'local';
const KILL_TIMEOUT_MS = 6000;
const MAX_BACKOFF_MS = 15000;

export interface LinkState {
  status: LinkStatus;
  error: string | null;
  snapshot: Snapshot | null;
  history: Sample[];
  allowKill: boolean;
}

const initialState: LinkState = { status: 'connecting', error: null, snapshot: null, history: [], allowKill: false };

export abstract class Link {
  private listeners = new Set<() => void>();
  protected state: LinkState = initialState;

  constructor(readonly id: string, public name: string) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getState = () => this.state;

  protected update(patch: Partial<LinkState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  protected receive(snapshot: Snapshot) {
    this.update({ snapshot, history: pushSample(this.state.history, sampleOf(snapshot)), status: 'online', error: null });
  }

  abstract kill(pid: number, force: boolean): Promise<KillResult>;
  abstract close(): void;
}

export class LocalLink extends Link {
  private unlisten: (() => void) | null = null;
  private closed = false;

  constructor() {
    super(LOCAL_ID, 'localhost');
    this.update({ allowKill: true });
    void this.start();
  }

  private async start() {
    try {
      const { listen } = await import('@tauri-apps/api/event');
      const unlisten = await listen<Snapshot>('snapshot', (event) => this.receive(event.payload));
      if (this.closed) unlisten();
      else this.unlisten = unlisten;
    } catch (error) {
      this.update({ status: 'offline', error: String(error) });
    }
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

export class RemoteLink extends Link {
  private socket: WebSocket | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private backoff = 1000;
  private closed = false;
  private pending = new Map<number, (result: KillResult) => void>();

  constructor(private config: HostConfig) {
    super(config.id, config.name);
    this.connect();
  }

  private connect() {
    if (this.closed) return;
    this.update({ status: 'connecting' });
    let socket: WebSocket;
    try {
      socket = new WebSocket(this.config.url);
    } catch (error) {
      this.update({ status: 'offline', error: String(error) });
      return;
    }
    this.socket = socket;
    socket.onopen = () => socket.send(JSON.stringify({ type: 'hello', token: this.config.token }));
    socket.onmessage = (event) => this.handle(JSON.parse(String(event.data)) as ServerMessage);
    socket.onclose = () => {
      this.socket = null;
      this.pending.forEach((resolve) => resolve({ ok: false, message: 'connection closed' }));
      this.pending.clear();
      if (this.closed || this.state.status === 'unauthorized') return;
      this.update({ status: 'offline', error: this.state.error ?? 'connection lost' });
      this.retry = setTimeout(() => this.connect(), this.backoff);
      this.backoff = Math.min(this.backoff * 2, MAX_BACKOFF_MS);
    };
  }

  private handle(message: ServerMessage) {
    switch (message.type) {
      case 'welcome':
        this.backoff = 1000;
        this.update({ status: 'online', error: null, allowKill: message.allowKill });
        break;
      case 'snapshot':
        this.receive(message.data);
        break;
      case 'killResult':
        this.pending.get(message.pid)?.({ ok: message.ok, message: message.message });
        this.pending.delete(message.pid);
        break;
      case 'error':
        this.update({ status: message.message === 'unauthorized' ? 'unauthorized' : this.state.status, error: message.message });
        break;
    }
  }

  kill(pid: number, force: boolean): Promise<KillResult> {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) return Promise.resolve({ ok: false, message: 'not connected' });
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(pid);
        resolve({ ok: false, message: 'no response from agent' });
      }, KILL_TIMEOUT_MS);
      this.pending.set(pid, (result) => {
        clearTimeout(timer);
        resolve(result);
      });
      socket.send(JSON.stringify({ type: 'kill', pid, force }));
    });
  }

  close() {
    this.closed = true;
    if (this.retry) clearTimeout(this.retry);
    this.socket?.close();
  }
}

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}
