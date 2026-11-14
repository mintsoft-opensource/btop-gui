import { describe, expect, it } from 'vitest';
import { bits, bytes, duration, hostLabel, ratio, span, temperature } from './format';
import { isPhysicalInterface, pushSample, sampleSpanSeconds, sumTrends, trackProcesses, type Sample } from './history';
import { shortcutKey } from './keys';
import { appName, arrange } from './processes';
import { DEFAULT_SETTINGS, sanitize } from './settings';
import { detectAlerts, diffAlerts, metricOf, overall } from './alerts';
import type { ProcessInfo, Snapshot } from './types';

const proc = (pid: number, parent: number | null, name: string, cpu = 0, memory = 0, command = `/usr/bin/${name}`): ProcessInfo => ({
  pid, parent, name, command, user: 'mint', cpu, memory, status: 'Run', startedAt: 0, readRate: 0, writeRate: 0,
});

describe('format', () => {
  it('formats byte sizes and bit rates', () => {
    expect(bytes(0)).toBe('0 B');
    expect(bytes(1536)).toBe('1.5 KB');
    expect(bytes(5 * 1024 ** 3)).toBe('5.0 GB');
    expect(bits(125_000)).toBe('1.0 Mb/s');
    expect(bits(250_000_000)).toBe('2.00 Gb/s');
  });

  it('clamps ratios and renders durations', () => {
    expect(ratio(5, 0)).toBe(0);
    expect(ratio(150, 100)).toBe(100);
    expect(duration(90061)).toBe('1d 1h');
    expect(duration(3725)).toBe('1h 2m');
  });

  it('converts temperatures, spans and host names', () => {
    expect(temperature(66.4, 'C')).toBe('66°C');
    expect(temperature(100, 'F')).toBe('212°F');
    expect(span(45)).toBe('45s');
    expect(span(120)).toBe('2m');
    expect(span(5400)).toBe('1.5h');
    expect(hostLabel('my-MacBook-Pro.local')).toBe('my-MacBook-Pro');
    expect(hostLabel('db01.example.com')).toBe('db01.example.com');
  });
});

const sample = (at: number): Sample => ({ at, cpu: 0, memory: 0, gpu: 0, battery: null, rx: 0, tx: 0, read: 0, write: 0 });

describe('history', () => {
  it('keeps the newest samples only', () => {
    let history: Sample[] = [];
    for (let i = 0; i < 5; i++) history = pushSample(history, sample(i), 3);
    expect(history.map((s) => s.at)).toEqual([2, 3, 4]);
  });

  it('derives the visible time span from sample spacing', () => {
    expect(sampleSpanSeconds([sample(0)], 120)).toBeNull();
    expect(sampleSpanSeconds([sample(0), sample(500), sample(1000)], 121)).toBe(60);
  });

  it('ignores virtual interfaces when totaling traffic', () => {
    expect(isPhysicalInterface('en0')).toBe(true);
    expect(isPhysicalInterface('wlp4s0')).toBe(true);
    expect(isPhysicalInterface('Ethernet')).toBe(true);
    expect(isPhysicalInterface('lo0')).toBe(false);
    expect(isPhysicalInterface('veth12ab')).toBe(false);
    expect(isPhysicalInterface('utun3')).toBe(false);
  });
});

describe('arrange', () => {
  const list = [proc(1, null, 'launchd', 1), proc(20, 1, 'zsh', 2), proc(30, 20, 'node', 50), proc(40, 1, 'nginx', 10)];
  const pids = (rows: ReturnType<typeof arrange>) => rows.map((r) => (r.kind === 'process' ? r.process.pid : r.key));

  it('sorts flat lists and filters by name, user or pid', () => {
    expect(pids(arrange(list, { sort: 'cpu' }))).toEqual([30, 40, 20, 1]);
    expect(pids(arrange(list, { sort: 'cpu', filter: 'nod' }))).toEqual([30]);
    expect(pids(arrange(list, { sort: 'cpu', filter: '40' }))).toEqual([40]);
  });

  it('reverses the sort order on request', () => {
    expect(pids(arrange(list, { sort: 'cpu', reverse: true }))).toEqual([1, 20, 40, 30]);
    expect(pids(arrange(list, { sort: 'pid', mode: 'tree', reverse: true }))).toEqual([1, 40, 20, 30]);
  });

  it('nests children under parents in tree mode', () => {
    const rows = arrange(list, { sort: 'cpu', mode: 'tree' });
    expect(rows.map((r) => (r.kind === 'process' ? `${r.depth}:${r.process.name}` : r.key))).toEqual(['0:launchd', '1:zsh', '2:node', '1:nginx']);
  });

  it('ranks tree branches by their subtree totals', () => {
    const shells = [proc(1, null, 'login', 0), proc(2, 1, 'zsh', 0), proc(3, 2, 'node', 80), proc(9, null, 'idle', 5)];
    const rows = arrange(shells, { sort: 'cpu', mode: 'tree' });
    expect(pids(rows)).toEqual([1, 2, 3, 9]);
  });

  it('keeps processes caught in parent cycles', () => {
    const cyclic = [proc(5, 6, 'a'), proc(6, 5, 'b')];
    expect(pids(arrange(cyclic, { sort: 'pid', mode: 'tree' }))).toEqual([5, 6]);
  });
});

describe('app grouping', () => {
  const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const helper = '/Applications/Google Chrome.app/Contents/Frameworks/Google Chrome Framework.framework/Helpers/Google Chrome Helper.app/Contents/MacOS/Google Chrome Helper --type=gpu';
  const list = [
    proc(10, 1, 'Google Chrome', 5, 100, chrome),
    proc(11, 10, 'Google Chrome Helper', 30, 300, helper),
    proc(12, 10, 'Google Chrome Helper (Renderer)', 10, 200, helper),
    proc(20, 1, 'node', 20, 50),
  ];

  it('names apps by their outermost bundle', () => {
    expect(appName(list[1])).toBe('Google Chrome');
    expect(appName(list[3])).toBe('node');
  });

  it('collapses multi-process apps into one totaled row', () => {
    const rows = arrange(list, { sort: 'cpu', mode: 'apps' });
    expect(rows.map((r) => r.key)).toEqual(['gGoogle Chrome', 'p20']);
    const group = rows[0].kind === 'group' ? rows[0].group : null;
    expect(group?.total.cpu).toBe(45);
    expect(group?.total.memory).toBe(600);
    expect(group?.members).toHaveLength(3);
  });

  it('lists members under expanded groups', () => {
    const rows = arrange(list, { sort: 'cpu', mode: 'apps', expanded: new Set(['gGoogle Chrome']) });
    expect(rows.map((r) => r.key)).toEqual(['gGoogle Chrome', 'p11', 'p12', 'p10', 'p20']);
  });
});

describe('process trends', () => {
  it('keeps a bounded history per live pid', () => {
    let history = trackProcesses(new Map(), [proc(1, null, 'a', 10, 1), proc(2, null, 'b', 5, 2)], 2);
    history = trackProcesses(history, [proc(1, null, 'a', 20, 1)], 2);
    history = trackProcesses(history, [proc(1, null, 'a', 30, 1)], 2);
    expect(history.get(1)?.cpu).toEqual([20, 30]);
    expect(history.has(2)).toBe(false);
  });

  it('sums trends aligned to the newest sample', () => {
    expect(sumTrends([{ cpu: [1, 2, 3], memory: [] }, { cpu: [10], memory: [] }], 'cpu')).toEqual([1, 2, 13]);
  });
});

describe('settings', () => {
  it('falls back to defaults for unknown or malformed values', () => {
    expect(sanitize(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitize({ theme: 'neon', intervalMs: 3, scanlines: 'yes' })).toEqual(DEFAULT_SETTINGS);
    expect(sanitize({ theme: 'amber', appearance: 'light', intervalMs: 500, tempUnit: 'F', historyLength: 300, scanlines: false })).toEqual({
      theme: 'amber', appearance: 'light', intervalMs: 500, tempUnit: 'F', historyLength: 300, scanlines: false,
    });
    expect(sanitize({ appearance: 'sepia' }).appearance).toBe('system');
  });
});

describe('shortcutKey', () => {
  it('uses the physical key so shortcuts work under non-latin input sources', () => {
    expect(shortcutKey({ key: 'ㅊ', code: 'KeyC' })).toBe('c');
    expect(shortcutKey({ key: '/', code: 'Slash' })).toBe('/');
    expect(shortcutKey({ key: '3', code: 'Digit3' })).toBe('3');
    expect(shortcutKey({ key: 'ArrowDown', code: 'ArrowDown' })).toBe('ArrowDown');
  });
});

describe('alerts', () => {
  const snapshot = (overrides: Partial<Snapshot> = {}): Snapshot => ({
    at: 0,
    host: { name: 'mac', os: 'macOS', kernel: '', arch: 'arm64', uptime: 0, processCount: 0 },
    cpu: { brand: '', usage: 0, cores: [], frequencyMhz: 0, physicalCores: null, load: null, temperature: null },
    memory: { total: 100, used: 50, available: 50, free: 10, swapTotal: 0, swapUsed: 0 },
    disks: [{ name: 'd', mount: '/', fileSystem: 'apfs', total: 100, available: 50, readRate: 0, writeRate: 0, removable: false }],
    networks: [],
    temperatures: [],
    processes: [],
    ...overrides,
  });
  const busy = (cpu: number, count = 5) => Array.from({ length: count }, (_, at) => ({ ...sample(at), cpu }));

  it('flags sustained CPU load, full memory, full volumes and low battery', () => {
    const alerts = detectAlerts(
      snapshot({
        memory: { total: 100, used: 95, available: 5, free: 1, swapTotal: 0, swapUsed: 0 },
        disks: [{ name: 'd', mount: '/', fileSystem: 'apfs', total: 100, available: 10, readRate: 0, writeRate: 0, removable: false }],
        battery: { percent: 15, charging: false, plugged: false, remainingSecs: null },
      }),
      busy(95),
    );
    expect(alerts.map((a) => `${a.id}:${a.level}`)).toEqual(['cpu:crit', 'memory:crit', 'disk:/:warn', 'battery:warn']);
    expect(overall(alerts)).toBe('crit');
    expect(alerts.map(metricOf)).toEqual(['cpu', 'memory', 'disk', 'battery']);
  });

  it('ignores short CPU spikes and plugged-in batteries', () => {
    const alerts = detectAlerts(snapshot({ battery: { percent: 5, charging: true, plugged: true, remainingSecs: null } }), busy(99, 3));
    expect(alerts).toEqual([]);
    expect(overall(alerts)).toBe('ok');
  });

  it('logs new, escalated and resolved alerts', () => {
    const warn = { id: 'cpu', label: 'CPU', level: 'warn' as const, message: 'CPU sustained at 80%' };
    const first = diffAlerts(new Map(), [warn], 1, 1);
    expect(first.events.map((e) => e.level)).toEqual(['warn']);
    expect(diffAlerts(first.active, [warn], 2, 1).events).toEqual([]);
    const escalated = diffAlerts(first.active, [{ ...warn, level: 'crit', message: 'CPU sustained at 95%' }], 3, 1);
    expect(escalated.events.map((e) => e.level)).toEqual(['crit']);
    expect(diffAlerts(escalated.active, [], 4, 1).events).toEqual([{ at: 4, id: 'cpu', level: 'ok', message: 'CPU back to normal' }]);
  });

  it('does not log flapping between levels or brief recoveries', () => {
    const warn = { id: 'cpu', label: 'CPU', level: 'warn' as const, message: 'CPU sustained at 88%' };
    const crit = { ...warn, level: 'crit' as const, message: 'CPU sustained at 92%' };
    let tracked = diffAlerts(new Map(), [crit], 0, 3).active;
    const logged: string[] = [];
    for (const [at, current] of [[1, [warn]], [2, [crit]], [3, []], [4, [warn]], [5, []], [6, []], [7, []]] as const) {
      const step = diffAlerts(tracked, [...current], at, 3);
      tracked = step.active;
      logged.push(...step.events.map((e) => `${e.at}:${e.level}`));
    }
    expect(logged).toEqual(['7:ok']);
  });
});
