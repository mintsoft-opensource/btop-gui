'use client';

import { forwardRef, useMemo } from 'react';
import { bytes, level, rate } from '@/lib/format';
import { arrange, type SortKey } from '@/lib/processes';
import type { ProcessInfo, Snapshot } from '@/lib/types';

const ROW_LIMIT = 400;
const COLUMNS: { key: SortKey | null; label: string; className: string }[] = [
  { key: 'pid', label: 'PID', className: 'num' },
  { key: 'name', label: 'NAME', className: 'name' },
  { key: 'user', label: 'USER', className: 'user' },
  { key: 'cpu', label: 'CPU%', className: 'cpu' },
  { key: 'memory', label: 'MEM', className: 'num mem' },
  { key: 'io', label: 'IO', className: 'num io' },
  { key: null, label: 'COMMAND', className: 'cmd' },
];

interface Props {
  snapshot: Snapshot;
  sort: SortKey;
  filter: string;
  tree: boolean;
  selected: number | null;
  allowKill: boolean;
  onSort: (key: SortKey) => void;
  onFilter: (value: string) => void;
  onTree: () => void;
  onSelect: (pid: number | null) => void;
  onKill: (process: ProcessInfo) => void;
}

export const ProcessPanel = forwardRef<HTMLInputElement, Props>(function ProcessPanel(
  { snapshot, sort, filter, tree, selected, allowKill, onSort, onFilter, onTree, onSelect, onKill },
  filterRef,
) {
  const rows = useMemo(() => arrange(snapshot.processes, sort, filter, tree), [snapshot.processes, sort, filter, tree]);
  const cores = Math.max(1, snapshot.cpu.cores.length);
  const target = snapshot.processes.find((process) => process.pid === selected) ?? null;

  return (
    <section className="panel procs">
      <h2>
        PROCESSES <em>{rows.length} / {snapshot.processes.length}</em>
      </h2>
      <div className="proc-toolbar">
        <input
          ref={filterRef}
          className="filter"
          placeholder="filter: name, user, pid   ( / )"
          value={filter}
          onChange={(event) => onFilter(event.target.value)}
          spellCheck={false}
        />
        <button className={tree ? 'on' : ''} onClick={onTree} title="Tree view (t)">TREE</button>
        <button disabled={!target || !allowKill} onClick={() => target && onKill(target)} title={allowKill ? 'Signal process (k)' : 'Process control is disabled on this agent'}>
          KILL
        </button>
      </div>
      <div className="proc-scroll">
        <table className="proc-table">
          <thead>
            <tr>
              {COLUMNS.map((column) => (
                <th
                  key={column.label}
                  className={`${column.className} ${column.key === sort ? 'sorted' : ''} ${column.key ? 'sortable' : ''}`}
                  onClick={() => column.key && onSort(column.key)}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, ROW_LIMIT).map(({ process, depth }) => {
              const share = Math.min(100, process.cpu / cores);
              return (
                <tr
                  key={process.pid}
                  className={process.pid === selected ? 'selected' : ''}
                  onClick={() => onSelect(process.pid === selected ? null : process.pid)}
                  onDoubleClick={() => allowKill && onKill(process)}
                >
                  <td className="num">{process.pid}</td>
                  <td className="name" style={{ paddingLeft: 6 + depth * 12 }}>
                    {depth > 0 && <span className="branch">└ </span>}
                    {process.name}
                  </td>
                  <td className="user">{process.user || '—'}</td>
                  <td className={`cpu ${level(share, 30, 70)}`}>
                    <span className="cpu-bar"><i style={{ width: `${share}%` }} /></span>
                    {process.cpu.toFixed(1)}
                  </td>
                  <td className="num mem">{bytes(process.memory)}</td>
                  <td className="num io">{process.readRate + process.writeRate > 0 ? rate(process.readRate + process.writeRate) : ''}</td>
                  <td className="cmd" title={process.command}>{process.command}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length > ROW_LIMIT && <p className="more">+{rows.length - ROW_LIMIT} more · narrow with the filter</p>}
      </div>
    </section>
  );
});
