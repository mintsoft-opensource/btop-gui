'use client';

import { forwardRef, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { bytes, level, rate } from '@/lib/format';
import { sumTrends, type ProcessHistory } from '@/lib/history';
import type { ProcessRow, SortKey, ViewMode } from '@/lib/processes';
import type { ProcessInfo, Snapshot } from '@/lib/types';
import { GroupDetail } from './GroupDetail';
import { ProcessDetail } from './ProcessDetail';
import { Sparkline } from './Sparkline';
import { Bar, TONE_TEXT, cx, fieldInput } from './ui';

const ROW_HEIGHT = 22;
const OVERSCAN = 12;
const MODES: { mode: ViewMode; label: string; key: string }[] = [
  { mode: 'apps', label: 'APPS', key: 'a' },
  { mode: 'list', label: 'LIST', key: 'l' },
  { mode: 'tree', label: 'TREE', key: 't' },
];
const COLUMNS: { key: SortKey | null; label: string; cell: string }[] = [
  { key: 'name', label: 'NAME', cell: '' },
  { key: 'pid', label: 'PID', cell: 'w-[8ch] text-right' },
  { key: 'user', label: 'USER', cell: 'w-[11ch] @max-[640px]:hidden' },
  { key: 'cpu', label: 'CPU%', cell: 'w-[13ch]' },
  { key: null, label: 'TREND', cell: 'w-[76px]' },
  { key: 'memory', label: 'MEM', cell: 'w-[10ch] text-right' },
  { key: 'io', label: 'IO', cell: 'w-[12ch] text-right @max-[640px]:hidden' },
  { key: null, label: 'COMMAND', cell: 'w-[34%] @max-[860px]:hidden' },
];
const [NAME, PID, USER, CPU, TREND, MEM, IO, CMD] = COLUMNS.map((column) => cx('truncate border-b border-phosphor/5 px-1.5 leading-[21px]', column.cell));

interface Props {
  snapshot: Snapshot;
  rows: ProcessRow[];
  trends: ProcessHistory;
  sort: SortKey;
  reverse: boolean;
  mode: ViewMode;
  filter: string;
  selected: string | null;
  onSort: (key: SortKey) => void;
  onMode: (mode: ViewMode) => void;
  onFilter: (value: string) => void;
  onSelect: (key: string | null) => void;
  onToggle: (key: string) => void;
  onKill: (process: ProcessInfo) => void;
}

export const ProcessPanel = forwardRef<HTMLInputElement, Props>(function ProcessPanel(
  { snapshot, rows, trends, sort, reverse, mode, filter, selected, onSort, onMode, onFilter, onSelect, onToggle, onKill },
  filterRef,
) {
  const scroller = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(600);
  const cores = Math.max(1, snapshot.cpu.cores.length);
  const current = rows.find((row) => row.key === selected) ?? null;

  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setViewport(element.clientHeight));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = scroller.current;
    if (!element || selected === null) return;
    const index = rows.findIndex((row) => row.key === selected);
    if (index < 0) return;
    const top = index * ROW_HEIGHT;
    if (top < element.scrollTop) element.scrollTop = top;
    else if (top + ROW_HEIGHT * 2 > element.scrollTop + element.clientHeight) element.scrollTop = top + ROW_HEIGHT * 3 - element.clientHeight;
  }, [selected]);

  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const end = Math.min(rows.length, Math.ceil((scrollTop + viewport) / ROW_HEIGHT) + OVERSCAN);
  const groups = rows.filter((row) => row.kind === 'group').length;

  return (
    <section className="@container relative flex min-h-0 min-w-0 flex-col rounded-lg border border-line bg-panel px-4 pt-3 pb-3.5">
      <div className="mb-2.5 flex items-center gap-2.5">
        <h2 className="font-display text-[11px] font-semibold tracking-[0.3em] text-muted">PROCESSES</h2>
        <div className="inline-flex overflow-hidden rounded-md border border-line-strong" role="tablist">
          {MODES.map((item) => (
            <button
              key={item.mode}
              role="tab"
              aria-selected={mode === item.mode}
              className={cx(
                'cursor-pointer px-3 py-[5px] font-display text-[11px] tracking-[0.15em] not-first:border-l not-first:border-line hover:text-phosphor',
                mode === item.mode ? 'bg-phosphor/10 text-phosphor' : 'text-fg',
              )}
              onClick={() => onMode(item.mode)}
              title={`${item.label} (${item.key})`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <input
          ref={filterRef}
          className={cx(fieldInput, 'min-w-0 flex-1')}
          placeholder="Filter by name, user or PID   ( / )"
          value={filter}
          onChange={(event) => onFilter(event.target.value)}
          spellCheck={false}
        />
        <span className="text-[10px] whitespace-nowrap text-muted @max-[640px]:hidden">{mode === 'apps' ? `${groups} apps · ` : ''}{snapshot.processes.length} processes</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto [scrollbar-color:var(--color-phosphor-dim)_transparent] [scrollbar-width:thin]" ref={scroller} onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}>
        <table className="w-full table-fixed border-collapse tabular-nums">
          <thead>
            <tr>
              {COLUMNS.map((column) => (
                <th
                  key={column.label}
                  className={cx(
                    'sticky top-0 z-1 border-b border-line-strong bg-surface px-1.5 py-[5px] text-left font-display text-[10px] font-semibold tracking-[0.2em]',
                    column.cell,
                    column.key && 'cursor-pointer',
                    column.key === sort ? cx('text-phosphor', reverse ? "after:content-['_▴']" : "after:content-['_▾']") : 'text-muted',
                  )}
                  onClick={() => column.key && onSort(column.key)}
                  title={column.key ? 'Sort (click again to reverse)' : undefined}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {start > 0 && <tr style={{ height: start * ROW_HEIGHT }} />}
            {rows.slice(start, end).map((row) => {
              const isGroup = row.kind === 'group';
              const process = isGroup ? row.group.total : row.process;
              const depth = isGroup ? 0 : row.depth;
              const trend = isGroup ? sumTrends(row.group.members.flatMap((member) => trends.get(member.pid) ?? []), 'cpu') : (trends.get(process.pid)?.cpu ?? []);
              const share = Math.min(100, process.cpu / cores);
              return (
                <tr
                  key={row.key}
                  className={cx(
                    'h-[22px] cursor-default',
                    row.key === selected ? 'bg-phosphor/15 shadow-[inset_2px_0_0_var(--color-phosphor)]' : 'hover:bg-phosphor/5',
                    isGroup && 'font-medium',
                  )}
                  onClick={() => onSelect(row.key === selected ? null : row.key)}
                  onDoubleClick={() => (isGroup ? onToggle(row.key) : onKill(process))}
                >
                  <td className={cx(NAME, 'text-fg')} style={{ paddingLeft: 8 + depth * 14 + (mode === 'apps' && !isGroup ? 16 : 0) }}>
                    {isGroup ? (
                      <button className="inline-block w-4 cursor-pointer text-left text-[10px] text-muted" onClick={(event) => { event.stopPropagation(); onToggle(row.key); }} aria-label={row.expanded ? 'Collapse' : 'Expand'}>
                        {row.expanded ? '▾' : '▸'}
                      </button>
                    ) : depth > 0 && mode === 'tree' ? <span className="text-phosphor-dim">└ </span> : null}
                    {process.name}
                    {isGroup && <span className="ml-2 rounded-full bg-phosphor/12 px-1.5 text-[9px] font-normal text-phosphor">{row.group.members.length}</span>}
                  </td>
                  <td className={PID}>{isGroup ? '' : process.pid}</td>
                  <td className={cx(USER, 'text-muted')}>{process.user || (isGroup ? 'various' : '—')}</td>
                  <td className={cx(CPU, TONE_TEXT[level(share, 30, 70)])}>
                    <Bar value={share} tone={level(share, 30, 70)} className="mr-1.5 inline-block h-[5px] w-[5ch] align-middle" />
                    {process.cpu.toFixed(process.cpu >= 100 ? 0 : 1)}
                  </td>
                  <td className={cx(TREND, 'text-phosphor')}><Sparkline values={trend} /></td>
                  <td className={MEM}>{bytes(process.memory)}</td>
                  <td className={IO}>{process.readRate + process.writeRate > 0 ? rate(process.readRate + process.writeRate) : ''}</td>
                  <td className={cx(CMD, 'text-muted')} title={process.command}>{process.command}</td>
                </tr>
              );
            })}
            {end < rows.length && <tr style={{ height: (rows.length - end) * ROW_HEIGHT }} />}
          </tbody>
        </table>
      </div>
      {current?.kind === 'process' && (
        <ProcessDetail process={current.process} trend={trends.get(current.process.pid)} snapshot={snapshot} onSelect={onSelect} onKill={onKill} />
      )}
      {current?.kind === 'group' && (
        <GroupDetail group={current.group} expanded={current.expanded} trends={trends} snapshot={snapshot} onToggle={() => onToggle(current.key)} onSelect={onSelect} />
      )}
    </section>
  );
});
