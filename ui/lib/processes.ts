import type { ProcessInfo } from './types';

export type SortKey = 'cpu' | 'memory' | 'pid' | 'name' | 'user' | 'io';
export type ViewMode = 'apps' | 'list' | 'tree';

export interface AppGroup {
  name: string;
  members: ProcessInfo[];
  total: ProcessInfo;
}

export type ProcessRow =
  | { kind: 'process'; key: string; process: ProcessInfo; depth: number }
  | { kind: 'group'; key: string; group: AppGroup; expanded: boolean };

export interface ArrangeOptions {
  sort: SortKey;
  filter?: string;
  mode?: ViewMode;
  reverse?: boolean;
  expanded?: ReadonlySet<string>;
}

const compare: Record<SortKey, (a: ProcessInfo, b: ProcessInfo) => number> = {
  cpu: (a, b) => b.cpu - a.cpu || b.memory - a.memory,
  memory: (a, b) => b.memory - a.memory,
  pid: (a, b) => a.pid - b.pid,
  name: (a, b) => a.name.localeCompare(b.name),
  user: (a, b) => a.user.localeCompare(b.user) || b.cpu - a.cpu,
  io: (a, b) => b.readRate + b.writeRate - (a.readRate + a.writeRate),
};

const APP_BUNDLE = /\/([^/]+)\.app\//;

export function appName(process: ProcessInfo): string {
  return APP_BUNDLE.exec(process.command)?.[1] ?? process.name;
}

export const processKey = (pid: number) => `p${pid}`;
export const groupKey = (name: string) => `g${name}`;

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

export function groupApps(processes: ProcessInfo[]): AppGroup[] {
  const byName = new Map<string, ProcessInfo[]>();
  for (const process of processes) {
    const name = appName(process);
    const list = byName.get(name);
    if (list) list.push(process);
    else byName.set(name, [process]);
  }
  return [...byName].map(([name, members]) => {
    const users = new Set(members.map((member) => member.user));
    const starts = members.map((member) => member.startedAt).filter((start) => start > 0);
    const total: ProcessInfo = {
      pid: Math.min(...members.map((member) => member.pid)),
      parent: null,
      name,
      command: `${members.length} processes`,
      user: users.size === 1 ? members[0].user : '',
      cpu: members.reduce((sum, member) => sum + member.cpu, 0),
      memory: members.reduce((sum, member) => sum + member.memory, 0),
      status: '',
      startedAt: starts.length ? Math.min(...starts) : 0,
      readRate: members.reduce((sum, member) => sum + member.readRate, 0),
      writeRate: members.reduce((sum, member) => sum + member.writeRate, 0),
    };
    return { name, members, total };
  });
}

export function arrange(processes: ProcessInfo[], options: ArrangeOptions): ProcessRow[] {
  const { sort, filter = '', mode = 'list', reverse = false, expanded = new Set<string>() } = options;
  const order = reverse ? (a: ProcessInfo, b: ProcessInfo) => compare[sort](b, a) : compare[sort];
  const visible = processes.filter((process) => matches(process, filter));
  const flat = (list: ProcessInfo[], depth = 0): ProcessRow[] =>
    list.sort(order).map((process) => ({ kind: 'process', key: processKey(process.pid), process, depth }));

  if (mode === 'apps') {
    const rows: ProcessRow[] = [];
    const groups = groupApps(visible).sort((a, b) => order(a.total, b.total));
    for (const group of groups) {
      if (group.members.length === 1) {
        rows.push(...flat(group.members));
        continue;
      }
      const key = groupKey(group.name);
      const open = expanded.has(key);
      rows.push({ kind: 'group', key, group, expanded: open });
      if (open) rows.push(...flat(group.members, 1));
    }
    return rows;
  }

  if (mode === 'list' || filter.trim()) return flat(visible);

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

  const totals = new Map<number, ProcessInfo>();
  const subtree = (process: ProcessInfo, path: Set<number>): ProcessInfo => {
    const known = totals.get(process.pid);
    if (known) return known;
    path.add(process.pid);
    const total = { ...process };
    for (const child of children.get(process.pid) ?? []) {
      if (path.has(child.pid)) continue;
      const sub = subtree(child, path);
      total.cpu += sub.cpu;
      total.memory += sub.memory;
      total.readRate += sub.readRate;
      total.writeRate += sub.writeRate;
    }
    path.delete(process.pid);
    totals.set(process.pid, total);
    return total;
  };
  const branchOrder = (a: ProcessInfo, b: ProcessInfo) => order(subtree(a, new Set()), subtree(b, new Set()));

  const rows: ProcessRow[] = [];
  const seen = new Set<number>();
  const walk = (list: ProcessInfo[], depth: number) => {
    for (const process of list.sort(branchOrder)) {
      if (seen.has(process.pid)) continue;
      seen.add(process.pid);
      rows.push({ kind: 'process', key: processKey(process.pid), process, depth });
      walk(children.get(process.pid) ?? [], depth + 1);
    }
  };
  walk(roots, 0);
  walk(visible.filter((process) => !seen.has(process.pid)), 0);
  return rows;
}
