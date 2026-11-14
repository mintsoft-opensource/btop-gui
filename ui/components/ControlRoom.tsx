import { metricOf, overall, type Alert, type AlertEvent } from '@/lib/alerts';
import { duration, level, percent, temperature, type TempUnit } from '@/lib/format';
import type { Snapshot } from '@/lib/types';
import { Graph } from './Graph';
import type { Card, Metric } from './metrics';
import { Panel, TONE_TEXT, caption, cx, type Tone } from './ui';

const STATUS: Record<Tone, { label: string; badge: string; border: string }> = {
  ok: { label: 'NORMAL', badge: 'border-phosphor/40 text-phosphor', border: 'border-line hover:border-line-strong' },
  warn: { label: 'WARNING', badge: 'border-amber bg-amber/10 text-amber', border: 'border-amber/60 shadow-lg shadow-amber/10' },
  crit: { label: 'CRITICAL', badge: 'border-red bg-red/15 text-red animate-blink', border: 'border-red/70 shadow-lg shadow-red/20' },
};
const EVENT_DOT: Record<AlertEvent['level'], string> = { ok: 'bg-phosphor', warn: 'bg-amber', crit: 'bg-red' };
const ALERT_SOURCED = new Set<Metric>(['cpu', 'memory', 'disk', 'battery']);

export function alertsFor(alerts: Alert[], metric: Metric): Alert[] {
  return alerts.filter((alert) => metricOf(alert) === metric);
}

function Badge({ tone }: { tone: Tone }) {
  return <span className={cx('rounded-sm border px-1.5 py-px font-display text-[9px] tracking-[0.2em]', STATUS[tone].badge)}>{STATUS[tone].label}</span>;
}

export function StatusStrip({ snapshot, alerts, tempUnit }: { snapshot: Snapshot; alerts: Alert[]; tempUnit: TempUnit }) {
  const health = overall(alerts);
  const warnings = alerts.filter((alert) => alert.level === 'warn').length;
  const critical = alerts.length - warnings;
  const headline = health === 'ok' ? 'ALL SYSTEMS NORMAL' : [critical && `${critical} CRITICAL`, warnings && `${warnings} WARNING`].filter(Boolean).join(' · ');
  const { cpu, host, battery } = snapshot;
  const stats: [string, string, string?][] = [
    ['UPTIME', duration(host.uptime)],
    ['LOAD', cpu.load ? cpu.load.map((v) => v.toFixed(1)).join(' ') : '—'],
    ['PROCESSES', String(snapshot.processes.length)],
    ['CPU TEMP', cpu.temperature ? temperature(cpu.temperature, tempUnit) : '—', cpu.temperature ? TONE_TEXT[level(cpu.temperature, 80, 90)] : ''],
  ];
  if (battery) stats.push(['BATTERY', `${percent(battery.percent)}${battery.charging ? ' ⚡' : ''}`]);
  return (
    <div className="col-span-full flex flex-wrap items-center gap-x-8 gap-y-2 rounded-lg border border-line bg-panel px-4 py-2.5">
      <div className="flex items-center gap-3">
        <span className={cx('size-3 rounded-full', health === 'ok' ? 'bg-phosphor shadow-[0_0_10px_var(--color-phosphor)]' : health === 'warn' ? 'animate-blink bg-amber' : 'animate-blink-fast bg-red')} />
        <b className={cx('font-display text-base tracking-[0.2em]', health === 'ok' ? 'text-phosphor' : TONE_TEXT[health])}>{headline}</b>
      </div>
      {stats.map(([label, value, className]) => (
        <div key={label} className="flex items-baseline gap-2">
          <span className={caption}>{label}</span>
          <span className={cx('text-[13px] tabular-nums', className)}>{value}</span>
        </div>
      ))}
    </div>
  );
}

interface TileProps {
  card: Card;
  alerts: Alert[];
  index: number;
  capacity: number;
  spanSeconds: number | null;
  onOpen: () => void;
}

export function Tile({ card, alerts, index, capacity, spanSeconds, onOpen }: TileProps) {
  const tone: Tone = ALERT_SOURCED.has(card.id) ? overall(alerts) : card.tone;
  const reason = alerts.find((alert) => alert.level === 'crit') ?? alerts[0];
  return (
    <button
      className={cx('flex min-h-0 cursor-pointer flex-col rounded-lg border bg-panel px-3.5 pt-2.5 pb-2.5 text-left font-mono text-fg transition-colors', STATUS[tone].border)}
      onClick={onOpen}
      title={`${card.label} details (${index + 1})`}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="font-display text-[11px] tracking-[0.3em] text-muted">
          {card.label} <kbd className="ml-1 rounded-[3px] border border-line px-1 font-mono text-[9px] tracking-normal">{index + 1}</kbd>
        </span>
        <Badge tone={tone} />
      </span>
      <b className={cx('mt-1 truncate font-display text-[30px] leading-none font-bold', TONE_TEXT[tone])}>{card.value}</b>
      <span className="mt-1 truncate text-[11px] text-muted">{card.detail}</span>
      {reason && <span className={cx('mt-0.5 truncate text-[11px]', TONE_TEXT[reason.level])}>▲ {reason.message}</span>}
      <Graph series={card.series} max={card.max} capacity={capacity} mirrored={card.mirrored} spanSeconds={spanSeconds} className="mt-2" />
    </button>
  );
}

export function EventLog({ events }: { events: AlertEvent[] }) {
  return (
    <Panel title="EVENTS" meta={`${events.length} logged`} className="flex min-h-0 flex-col">
      {events.length === 0 ? (
        <p className="text-muted">No events since start. Threshold crossings appear here.</p>
      ) : (
        <ol className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
          {events.map((event, index) => (
            <li key={`${event.at}-${event.id}-${index}`} className="grid grid-cols-[8ch_8px_minmax(0,1fr)] items-center gap-2 border-b border-line/50 py-1 text-[11px]">
              <span className="text-muted tabular-nums">{new Date(event.at).toTimeString().slice(0, 8)}</span>
              <span className={cx('size-2 rounded-full', EVENT_DOT[event.level])} />
              <span className={cx('truncate', event.level === 'ok' ? 'text-muted' : TONE_TEXT[event.level])} title={event.message}>{event.message}</span>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
