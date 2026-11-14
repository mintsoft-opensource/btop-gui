'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { MAX_EVENTS, detectAlerts, diffAlerts, type Alert, type AlertEvent, type TrackedAlert } from '@/lib/alerts';
import { hostLabel } from '@/lib/format';
import { sampleSpanSeconds } from '@/lib/history';
import { shortcutKey } from '@/lib/keys';
import { LocalLink, isTauri, type LinkState } from '@/lib/links';
import { arrange, type SortKey, type ViewMode } from '@/lib/processes';
import { getServerSettings, getSettings, subscribeSettings, updateSettings } from '@/lib/settings';
import type { ProcessInfo } from '@/lib/types';
import { BatteryPanel } from './BatteryPanel';
import { EventLog, StatusStrip, Tile, alertsFor } from './ControlRoom';
import { CpuPanel } from './CpuPanel';
import { DiskPanel } from './DiskPanel';
import { GpuPanel } from './GpuPanel';
import { KillDialog } from './KillDialog';
import { MemoryPanel } from './MemoryPanel';
import { metricCards, type Metric } from './metrics';
import { NetworkPanel } from './NetworkPanel';
import type { PanelProps } from './PanelProps';
import { ProcessPanel } from './ProcessPanel';
import { SettingsDialog } from './SettingsDialog';
import { button, cx } from './ui';

const STATUS_LABEL: Record<LinkState['status'], string> = {
  connecting: 'STARTING',
  online: 'LIVE',
  offline: 'OFFLINE',
};

const LAMP: Record<LinkState['status'], string> = {
  connecting: 'bg-amber shadow-[0_0_10px_var(--color-amber)] animate-blink',
  online: 'bg-phosphor shadow-[0_0_10px_var(--color-phosphor)] animate-blink',
  offline: 'bg-red shadow-[0_0_12px_var(--color-red)] animate-blink-fast',
};

const DETAIL: Record<Metric, (props: PanelProps) => React.ReactNode> = {
  cpu: CpuPanel,
  memory: MemoryPanel,
  gpu: GpuPanel,
  disk: DiskPanel,
  network: NetworkPanel,
  battery: BatteryPanel,
};

const MODE_KEYS: Record<string, ViewMode> = { a: 'apps', l: 'list', t: 'tree' };
const SORT_KEYS: Record<string, SortKey> = { c: 'cpu', m: 'memory', p: 'pid' };
const DARK_QUERY = '(prefers-color-scheme: dark)';
const EMPTY = 'relative z-2 grid flex-1 place-content-center gap-2 text-center text-sm';
const ICON_BUTTON = cx(button('quiet'), 'px-2 py-[3px] text-sm leading-tight tracking-normal');

function subscribeScheme(listener: () => void) {
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}

function useLink(link: LocalLink | null): LinkState | null {
  const subscribe = useCallback((listener: () => void) => link?.subscribe(listener) ?? (() => {}), [link]);
  return useSyncExternalStore(subscribe, () => link?.getState() ?? null, () => null);
}

function Clock() {
  const [now, setNow] = useState<string>('');
  useEffect(() => {
    const tick = () => setNow(new Date().toTimeString().slice(0, 8));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);
  return <span className="font-display text-lg tracking-[0.08em] text-ice tabular-nums">{now}</span>;
}

function MetricDetail({ panel, metric, onClose }: { panel: PanelProps; metric: Metric; onClose: () => void }) {
  const Detail = DETAIL[metric];
  return (
    <div className="fixed inset-0 z-60 grid place-items-center bg-black/55 p-6 backdrop-blur-[2px]" onClick={onClose}>
      <div className="relative flex h-[min(620px,85vh)] w-full max-w-[960px] flex-col *:flex-1" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <Detail {...panel} />
        <button className={cx(ICON_BUTTON, 'absolute -top-3 -right-3 rounded-full bg-surface')} onClick={onClose} title="Close (Esc)" aria-label="Close">
          ✕
        </button>
      </div>
    </div>
  );
}

export function Monitor() {
  const [link, setLink] = useState<LocalLink | null>(null);
  const [desktop, setDesktop] = useState<boolean | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [macChrome, setMacChrome] = useState(false);
  const [detail, setDetail] = useState<Metric | null>(null);
  const [mode, setMode] = useState<ViewMode>('apps');
  const [sort, setSort] = useState<SortKey>('cpu');
  const [reverse, setReverse] = useState(false);
  const [filter, setFilter] = useState('');
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [killTarget, setKillTarget] = useState<ProcessInfo | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; message: string } | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const activeAlerts = useRef<ReadonlyMap<string, TrackedAlert>>(new Map());
  const filterRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const inApp = isTauri();
    setDesktop(inApp);
    setMacChrome(inApp && /Mac/i.test(navigator.userAgent));
    if (!inApp) return;
    const local = new LocalLink();
    setLink(local);
    return () => local.close();
  }, []);

  const settings = useSyncExternalStore(subscribeSettings, getSettings, getServerSettings);
  const systemDark = useSyncExternalStore(subscribeScheme, () => window.matchMedia(DARK_QUERY).matches, () => true);
  const colorMode = settings.appearance === 'system' ? (systemDark ? 'dark' : 'light') : settings.appearance;

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = settings.theme;
    root.dataset.mode = colorMode;
    root.classList.toggle('no-scan', !settings.scanlines);
  }, [settings.theme, settings.scanlines, colorMode]);

  useEffect(() => {
    void link?.setInterval(settings.intervalMs).catch(() => {});
  }, [link, settings.intervalMs]);

  const state = useLink(link);
  const snapshot = state?.snapshot ?? null;

  useEffect(() => {
    if (!snapshot || !state) return;
    const current = detectAlerts(snapshot, state.history);
    const { active, events: fresh } = diffAlerts(activeAlerts.current, current, snapshot.at);
    activeAlerts.current = active;
    setAlerts(current);
    if (fresh.length) setEvents((log) => [...fresh.reverse(), ...log].slice(0, MAX_EVENTS));
  }, [snapshot, state]);

  const signal = async (force: boolean) => {
    if (!killTarget || !link) return;
    const target = killTarget;
    setKillTarget(null);
    const result = await link.kill(target.pid, force);
    setToast({ ok: result.ok, message: `${target.name} (${target.pid}): ${result.message}` });
  };

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const rows = useMemo(
    () => (snapshot ? arrange(snapshot.processes, { sort, filter, mode, reverse, expanded }) : []),
    [snapshot, sort, filter, mode, reverse, expanded],
  );
  const cards = useMemo(() => (snapshot && state ? metricCards(snapshot, state.history, settings.tempUnit) : []), [snapshot, state, settings.tempUnit]);

  const changeSort = useCallback(
    (key: SortKey) => {
      if (key === sort) setReverse((value) => !value);
      else {
        setSort(key);
        setReverse(false);
      }
    },
    [sort],
  );

  const changeMode = useCallback((next: ViewMode) => {
    setMode(next);
    setSelected(null);
  }, []);

  const toggleGroup = useCallback((key: string, open?: boolean) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (open ?? !next.has(key)) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  const moveSelection = useCallback(
    (delta: number) => {
      if (rows.length === 0) return;
      const index = rows.findIndex((row) => row.key === selected);
      const next = index < 0 ? (delta > 0 ? 0 : rows.length - 1) : Math.max(0, Math.min(rows.length - 1, index + delta));
      setSelected(rows[next].key);
    },
    [rows, selected],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (killTarget || showSettings) return;
      if (detail) {
        if (event.key === 'Escape') setDetail(null);
        return;
      }
      const typing = event.target instanceof HTMLInputElement;
      if (event.key === 'Escape') {
        if (typing) (event.target as HTMLInputElement).blur();
        setSelected(null);
        return;
      }
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
      const key = shortcutKey(event);
      const row = rows.find((item) => item.key === selected);
      if (key === 'ArrowDown' || key === 'ArrowUp') {
        event.preventDefault();
        moveSelection(key === 'ArrowDown' ? 1 : -1);
      } else if (key === 'PageDown' || key === 'PageUp') {
        event.preventDefault();
        moveSelection(key === 'PageDown' ? 20 : -20);
      } else if ((key === 'ArrowRight' || key === 'ArrowLeft' || key === 'Enter') && row?.kind === 'group') {
        event.preventDefault();
        toggleGroup(row.key, key === 'Enter' ? undefined : key === 'ArrowRight');
      } else if (key === ',') {
        setShowSettings(true);
      } else if (key === '/') {
        event.preventDefault();
        filterRef.current?.focus();
      } else if (key === 'k' && row?.kind === 'process') {
        setKillTarget(row.process);
      } else if (/^[1-9]$/.test(key)) {
        const card = cards[Number(key) - 1];
        if (card) setDetail(card.id);
      } else if (MODE_KEYS[key]) {
        changeMode(MODE_KEYS[key]);
      } else if (SORT_KEYS[key]) {
        changeSort(SORT_KEYS[key]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [killTarget, showSettings, detail, selected, rows, cards, changeSort, changeMode, moveSelection, toggleGroup]);

  useEffect(() => {
    if (selected !== null && snapshot && !rows.some((row) => row.key === selected)) setSelected(null);
  }, [selected, rows, snapshot]);

  const status = state?.status ?? 'connecting';
  const panel: PanelProps | null =
    snapshot && state
      ? {
          snapshot,
          history: state.history,
          capacity: settings.historyLength,
          spanSeconds: sampleSpanSeconds(state.history.slice(-settings.historyLength), settings.historyLength),
          tempUnit: settings.tempUnit,
        }
      : null;
  const openDetail = detail && cards.some((card) => card.id === detail) ? detail : null;

  return (
    <div className="relative flex h-screen flex-col max-[900px]:h-auto max-[900px]:min-h-screen">
      <div className="backdrop" />
      <header
        data-tauri-drag-region
        className={cx(
          'relative z-2 grid grid-cols-[auto_1fr_auto] items-center gap-5 border-b border-line-strong bg-linear-to-b from-phosphor/6 to-transparent px-[18px] py-2.5 max-[900px]:grid-cols-[1fr_auto]',
          macChrome && 'pl-[92px] max-[900px]:pt-[34px] max-[900px]:pl-4',
        )}
      >
        <div className="flex items-center gap-3" data-tauri-drag-region>
          <div className="radar relative size-[34px] overflow-hidden rounded-full border border-line-strong" />
          <div>
            <h1 className="font-display text-lg tracking-[0.3em] text-phosphor [text-shadow:0_0_12px_var(--glow)]">BTOP-GUI</h1>
            <small className="block text-[9px] tracking-[0.4em] text-muted">SYSTEM MONITOR</small>
          </div>
        </div>
        <div className="truncate font-display tracking-[0.12em] text-muted max-[900px]:hidden" data-tauri-drag-region>
          {snapshot ? `${hostLabel(snapshot.host.name)} · ${snapshot.cpu.brand || snapshot.host.arch}` : ''}
        </div>
        <div className="flex items-center gap-[18px]" data-tauri-drag-region>
          <span className="inline-flex items-center gap-2 font-display text-[11px] font-semibold tracking-[0.2em]">
            <i className={cx('size-[9px] rounded-full', LAMP[status])} />
            {STATUS_LABEL[status]}
          </span>
          <Clock />
          <div className="flex gap-1.5">
            <button
              className={ICON_BUTTON}
              onClick={() => updateSettings({ appearance: colorMode === 'dark' ? 'light' : 'dark' })}
              title={colorMode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label="Toggle light and dark mode"
            >
              {colorMode === 'dark' ? '☀' : '☾'}
            </button>
            <button className={ICON_BUTTON} onClick={() => setShowSettings(true)} title="Settings (,)" aria-label="Settings">⚙</button>
          </div>
        </div>
      </header>

      {desktop === false && (
        <main className={EMPTY}>
          <p>btop-gui reads system metrics through the desktop app.</p>
          <p className="text-muted">Run <code>npm run dev</code> from the repository root.</p>
        </main>
      )}

      {desktop && !snapshot && (
        <main className={EMPTY}>
          <p>{status === 'offline' ? 'Could not start the collector.' : 'Collecting…'}</p>
          {state?.error && <p className="text-muted">{state.error}</p>}
        </main>
      )}

      {snapshot && state && panel && (
        <main className="relative z-2 grid min-h-0 flex-1 grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] gap-3 px-[18px] py-3 max-[900px]:grid-cols-1 max-[900px]:grid-rows-none max-[900px]:px-4">
          <StatusStrip snapshot={snapshot} alerts={alerts} tempUnit={settings.tempUnit} />
          <div className="grid min-h-0 auto-rows-fr grid-cols-2 gap-3 max-[900px]:auto-rows-[200px]">
            {cards.map((card, index) => (
              <Tile
                key={card.id}
                card={card}
                alerts={alertsFor(alerts, card.id)}
                index={index}
                capacity={panel.capacity}
                spanSeconds={panel.spanSeconds}
                onOpen={() => setDetail(card.id)}
              />
            ))}
          </div>
          <div className="grid min-h-0 grid-rows-[minmax(110px,170px)_minmax(0,1fr)] gap-3 max-[900px]:grid-rows-[170px_70vh]">
            <EventLog events={events} />
            <ProcessPanel
              ref={filterRef}
              snapshot={snapshot}
              rows={rows}
              trends={state.processHistory}
              sort={sort}
              reverse={reverse}
              mode={mode}
              filter={filter}
              selected={selected}
              onSort={changeSort}
              onMode={changeMode}
              onFilter={setFilter}
              onSelect={setSelected}
              onToggle={toggleGroup}
              onKill={setKillTarget}
            />
          </div>
        </main>
      )}

      <footer className="relative z-2 flex justify-between gap-3 overflow-hidden border-t border-line px-[18px] pt-1.5 pb-2 text-[10px] tracking-[0.08em] whitespace-nowrap text-muted">
        <span className="truncate">{snapshot ? `${snapshot.host.os} · ${snapshot.host.kernel} · ${snapshot.host.arch}` : ''}</span>
        <span className="truncate max-[900px]:hidden">
          1-{Math.max(1, cards.length)} details · a l t view · / filter · ↑↓ select · ←→ expand · c m p sort · k end · , settings
        </span>
      </footer>

      {openDetail && panel && <MetricDetail panel={panel} metric={openDetail} onClose={() => setDetail(null)} />}
      {killTarget && <KillDialog process={killTarget} host={hostLabel(snapshot?.host.name ?? '')} onSignal={signal} onCancel={() => setKillTarget(null)} />}
      {showSettings && <SettingsDialog settings={settings} onChange={updateSettings} onClose={() => setShowSettings(false)} />}
      {toast && (
        <div
          className={cx(
            'fixed right-[18px] bottom-[34px] z-70 max-w-[min(480px,calc(100vw-36px))] rounded-md border bg-surface px-3.5 py-2.5 shadow-lg',
            toast.ok ? 'border-phosphor text-phosphor' : 'border-red text-red',
          )}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
