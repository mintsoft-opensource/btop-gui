import type { ProcessInfo } from './types';

export type SortKey = 'cpu' | 'memory' | 'pid' | 'name' | 'user' | 'io';

export interface ProcessRow {
  process: ProcessInfo;
  depth: number;
}

const compare: Record<SortKey, (a: ProcessInfo, b: ProcessInfo) => number> = {
  cpu: (a, b) => b.cpu - a.cpu || b.memory - a.memory,
  memory: (a, b) => b.memory - a.memory,
  pid: (a, b) => a.pid - b.pid,
  name: (a, b) => a.name.localeCompare(b.name),
  user: (a, b) => a.user.localeCompare(b.user) || b.cpu - a.cpu,
  io: (a, b) => b.readRate + b.writeRate - (a.readRate + a.writeRate),
};

export function matches(process: ProcessInfo, filter: string): boolean {
  const needle = filter.trim().toLowerCase();
  if (!needle) return true;
  return (
    String(process.pid) === needle ||
    process.name.toLowerCase().includes(needle) ||
    process.command.toLowerCase().includes(needle) ||
    process.user.toLowerCase().includes(needle)
  );
}

export function arrange(processes: ProcessInfo[], sort: SortKey, filter: string, tree: boolean): ProcessRow[] {
  const visible = processes.filter((process) => matches(process, filter));
  if (!tree || filter.trim()) return visible.sort(compare[sort]).map((process) => ({ process, depth: 0 }));

  const byPid = new Set(visible.map((process) => process.pid));
  const children = new Map<number, ProcessInfo[]>();
  const roots: ProcessInfo[] = [];
  for (const process of visible) {
    const parent = process.parent;
    if (parent !== null && parent !== process.pid && byPid.has(parent)) {
      const list = children.get(parent) ?? [];
      list.push(process);
      children.set(parent, list);
    } else {
      roots.push(process);
    }
  }

  const rows: ProcessRow[] = [];
  const seen = new Set<number>();
  const walk = (list: ProcessInfo[], depth: number) => {
    for (const process of list.sort(compare[sort])) {
      if (seen.has(process.pid)) continue;
      seen.add(process.pid);
      rows.push({ process, depth });
      walk(children.get(process.pid) ?? [], depth + 1);
    }
  };
  walk(roots, 0);
  walk(visible.filter((process) => !seen.has(process.pid)), 0);
  return rows;
}
