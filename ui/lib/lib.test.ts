import { describe, expect, it } from 'vitest';
import { bits, bytes, duration, ratio } from './format';
import { isPhysicalInterface, pushSample, type Sample } from './history';
import { normalizeUrl } from './hosts';
import { arrange } from './processes';
import type { ProcessInfo } from './types';

const proc = (pid: number, parent: number | null, name: string, cpu = 0, memory = 0): ProcessInfo => ({
  pid, parent, name, command: `/usr/bin/${name}`, user: 'mint', cpu, memory, status: 'Run', startedAt: 0, readRate: 0, writeRate: 0,
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
});

describe('history', () => {
  it('keeps the newest samples only', () => {
    const sample = (at: number): Sample => ({ at, cpu: 0, memory: 0, rx: 0, tx: 0, read: 0, write: 0 });
    let history: Sample[] = [];
    for (let i = 0; i < 5; i++) history = pushSample(history, sample(i), 3);
    expect(history.map((s) => s.at)).toEqual([2, 3, 4]);
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

describe('hosts', () => {
  it('normalizes agent addresses', () => {
    expect(normalizeUrl('10.0.0.5')).toBe('ws://10.0.0.5:9100/ws');
    expect(normalizeUrl('wss://mon.example.com')).toBe('wss://mon.example.com/ws');
    expect(normalizeUrl('ws://host:9200/agent')).toBe('ws://host:9200/agent');
    expect(normalizeUrl('http://host')).toBeNull();
    expect(normalizeUrl('')).toBeNull();
  });
});

describe('arrange', () => {
  const list = [proc(1, null, 'launchd', 1), proc(20, 1, 'zsh', 2), proc(30, 20, 'node', 50), proc(40, 1, 'nginx', 10)];

  it('sorts flat lists and filters by name, user or pid', () => {
    expect(arrange(list, 'cpu', '', false).map((r) => r.process.pid)).toEqual([30, 40, 20, 1]);
    expect(arrange(list, 'cpu', 'nod', false).map((r) => r.process.pid)).toEqual([30]);
    expect(arrange(list, 'cpu', '40', false).map((r) => r.process.pid)).toEqual([40]);
  });

  it('nests children under parents in tree mode', () => {
    expect(arrange(list, 'cpu', '', true).map((r) => `${r.depth}:${r.process.name}`)).toEqual(['0:launchd', '1:nginx', '1:zsh', '2:node']);
  });

  it('keeps processes caught in parent cycles', () => {
    const cyclic = [proc(5, 6, 'a'), proc(6, 5, 'b')];
    expect(arrange(cyclic, 'pid', '', true).map((r) => `${r.depth}:${r.process.pid}`)).toEqual(['0:5', '1:6']);
  });
});
