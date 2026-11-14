'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { loadHosts, saveHosts } from '@/lib/hosts';
import { LOCAL_ID, LocalLink, RemoteLink, isTauri, type Link, type LinkState } from '@/lib/links';
import type { SortKey } from '@/lib/processes';
import type { HostConfig, ProcessInfo } from '@/lib/types';
import { CpuPanel } from './CpuPanel';
import { DiskPanel } from './DiskPanel';
import { HostDialog } from './HostDialog';
import { KillDialog } from './KillDialog';
import { MemoryPanel } from './MemoryPanel';
import { NetworkPanel } from './NetworkPanel';
import { ProcessPanel } from './ProcessPanel';

const STATUS_LABEL: Record<LinkState['status'], string> = {
  connecting: 'CONNECTING',
  online: 'LIVE',
  offline: 'OFFLINE',
  unauthorized: 'BAD TOKEN',
};

function useLink(link: Link | undefined): LinkState | null {
  const subscribe = useCallback((listener: () => void) => link?.subscribe(listener) ?? (() => {}), [link]);
  return useSyncExternalStore(subscribe, () => link?.getState() ?? null, () => null);
}

function HostTab({ link, index, active, onSelect }: { link: Link; index: number; active: boolean; onSelect: () => void }) {
  const state = useLink(link);
  const usage = state?.snapshot?.cpu.usage;
  return (
    <button className={`tab ${active ? 'active' : ''} ${state?.status ?? ''}`} onClick={onSelect} title={`${link.name} (${index + 1})`}>
      <i />
      <span>{state?.snapshot?.host.name || link.name}</span>
      {usage !== undefined && state?.status === 'online' && <small>{usage.toFixed(0)}%</small>}
    </button>
  );
}

function Clock() {
  const [now, setNow] = useState<string>('');
  useEffect(() => {
    const tick = () => setNow(new Date().toTimeString().slice(0, 8));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);
  return <span className="clock">{now}</span>;
}

export function Monitor() {
  const [hosts, setHosts] = useState<HostConfig[]>([]);
  const [local, setLocal] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showHosts, setShowHosts] = useState(false);
  const [sort, setSort] = useState<SortKey>('cpu');
  const [filter, setFilter] = useState('');
  const [tree, setTree] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [killTarget, setKillTarget] = useState<ProcessInfo | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; message: string } | null>(null);
  const filterRef = useRef<HTMLInputElement>(null);
  const links = useRef(new Map<string, Link>());
  const [linkList, setLinkList] = useState<Link[]>([]);

  useEffect(() => {
    setHosts(loadHosts());
    setLocal(isTauri());
  }, []);

  useEffect(() => {
    const map = links.current;
    const wanted = new Map<string, HostConfig | null>(hosts.map((host) => [host.id, host]));
    if (local) wanted.set(LOCAL_ID, null);
    for (const [id, link] of map) {
      if (!wanted.has(id)) {
        link.close();
        map.delete(id);
      }
    }
    for (const [id, config] of wanted) {
      if (!map.has(id)) map.set(id, config ? new RemoteLink(config) : new LocalLink());
    }
    const ordered = [...(local ? [map.get(LOCAL_ID)!] : []), ...hosts.map((host) => map.get(host.id)!)];
    setLinkList(ordered);
    setActiveId((current) => (current && map.has(current) ? current : (ordered[0]?.id ?? null)));
  }, [hosts, local]);

  useEffect(() => () => links.current.forEach((link) => link.close()), []);

  const active = linkList.find((link) => link.id === activeId);
  const state = useLink(active);
  const snapshot = state?.snapshot ?? null;

  const updateHosts = (next: HostConfig[]) => {
    setHosts(next);
    saveHosts(next);
  };

  const selectLink = useCallback((id: string) => {
    setActiveId(id);
    setSelected(null);
  }, []);

  const signal = async (force: boolean) => {
    if (!killTarget || !active) return;
    const target = killTarget;
    setKillTarget(null);
    const result = await active.kill(target.pid, force);
    setToast({ ok: result.ok, message: `${target.name} (${target.pid}): ${result.message}` });
  };

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const visiblePids = useMemo(() => snapshot?.processes.map((p) => p.pid) ?? [], [snapshot]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (killTarget || showHosts) return;
      const typing = event.target instanceof HTMLInputElement;
      if (event.key === 'Escape') {
        if (typing) (event.target as HTMLInputElement).blur();
        setSelected(null);
        return;
      }
      if (typing) return;
      if (event.key === '/') {
        event.preventDefault();
        filterRef.current?.focus();
      } else if (event.key === 't') {
        setTree((value) => !value);
      } else if (event.key === 'k' && selected !== null && state?.allowKill) {
        const target = snapshot?.processes.find((p) => p.pid === selected);
        if (target) setKillTarget(target);
      } else if (/^[1-9]$/.test(event.key)) {
        const link = linkList[Number(event.key) - 1];
        if (link) selectLink(link.id);
      } else if (event.key === 'c') setSort('cpu');
      else if (event.key === 'm') setSort('memory');
      else if (event.key === 'p') setSort('pid');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [killTarget, showHosts, selected, state?.allowKill, snapshot, linkList, selectLink]);

  useEffect(() => {
    if (selected !== null && snapshot && !visiblePids.includes(selected)) setSelected(null);
  }, [selected, visiblePids, snapshot]);

  const status = state?.status ?? 'offline';

  return (
    <div className="shell">
      <div className="backdrop" />
      <header>
        <div className="brand">
          <div className="radar" />
          <div>
            <h1>BTOP-GUI</h1>
            <small>SYSTEM MONITOR</small>
          </div>
        </div>
        <nav className="tabs">
          {linkList.map((link, index) => (
            <HostTab key={link.id} link={link} index={index} active={link.id === activeId} onSelect={() => selectLink(link.id)} />
          ))}
          <button className="tab add" onClick={() => setShowHosts(true)} title="Manage remote hosts">+ HOST</button>
        </nav>
        <div className="status">
          <span className={`lamp ${status}`}><i />{STATUS_LABEL[status]}</span>
          <Clock />
        </div>
      </header>

      {!active && (
        <main className="empty">
          <p>No hosts yet.</p>
          <p className="muted">Start <code>btop-gui-agent</code> on a machine and add it with <b>+ HOST</b>.</p>
        </main>
      )}

      {active && !snapshot && (
        <main className="empty">
          <p>{status === 'unauthorized' ? 'The agent rejected the token.' : status === 'connecting' ? 'Connecting…' : 'Waiting for data…'}</p>
          {state?.error && <p className="muted">{state.error}</p>}
        </main>
      )}

      {active && snapshot && state && (
        <main className="grid">
          <CpuPanel snapshot={snapshot} history={state.history} />
          <div className="side">
            <MemoryPanel snapshot={snapshot} history={state.history} />
            <DiskPanel snapshot={snapshot} history={state.history} />
            <NetworkPanel snapshot={snapshot} history={state.history} />
          </div>
          <ProcessPanel
            ref={filterRef}
            snapshot={snapshot}
            sort={sort}
            filter={filter}
            tree={tree}
            selected={selected}
            allowKill={state.allowKill}
            onSort={setSort}
            onFilter={setFilter}
            onTree={() => setTree((value) => !value)}
            onSelect={setSelected}
            onKill={setKillTarget}
          />
        </main>
      )}

      <footer>
        <span>{snapshot ? `${snapshot.host.os} · ${snapshot.host.kernel} · ${snapshot.host.arch}` : ''}</span>
        <span className="keys">/ filter · t tree · c m p sort · k kill · 1-9 host</span>
      </footer>

      {killTarget && active && <KillDialog process={killTarget} host={snapshot?.host.name ?? active.name} onSignal={signal} onCancel={() => setKillTarget(null)} />}
      {showHosts && <HostDialog hosts={hosts} onSave={updateHosts} onClose={() => setShowHosts(false)} />}
      {toast && <div className={`toast ${toast.ok ? 'ok' : 'crit'}`}>{toast.message}</div>}
    </div>
  );
}
