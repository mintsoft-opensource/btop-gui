import type { ProcessInfo, Snapshot } from './types';

export const HISTORY_LENGTH = 120;
export const MAX_HISTORY = 600;
export const PROCESS_HISTORY = 60;

export interface Sample {
  at: number;
  cpu: number;
  memory: number;
  gpu: number;
  battery: number | null;
  rx: number;
  tx: number;
  read: number;
  write: number;
}

const EXCLUDED_INTERFACE = /^(lo\d*|utun\d*|awdl\d*|llw\d*|bridge\d*|gif\d*|stf\d*|anpi\d*|ap\d*|docker\d*|br-.*|veth.*|virbr\d*|vEthernet.*|Loopback.*)$/i;

export function isPhysicalInterface(name: string): boolean {
  return !EXCLUDED_INTERFACE.test(name);
}

export function sampleOf(snapshot: Snapshot): Sample {
  const physical = snapshot.networks.filter((net) => isPhysicalInterface(net.name));
  return {
    at: snapshot.at,
    cpu: snapshot.cpu.usage,
    memory: snapshot.memory.total ? (snapshot.memory.used / snapshot.memory.total) * 100 : 0,
    gpu: snapshot.gpus?.[0]?.usage ?? 0,
    battery: snapshot.battery?.percent ?? null,
    rx: physical.reduce((sum, net) => sum + net.rxRate, 0),
    tx: physical.reduce((sum, net) => sum + net.txRate, 0),
    read: snapshot.disks.reduce((sum, disk) => sum + disk.readRate, 0),
    write: snapshot.disks.reduce((sum, disk) => sum + disk.writeRate, 0),
  };
}

export function pushSample(history: Sample[], sample: Sample, limit = HISTORY_LENGTH): Sample[] {
  const next = history.length >= limit ? history.slice(history.length - limit + 1) : history.slice();
  next.push(sample);
  return next;
}

export function sampleSpanSeconds(history: Sample[], capacity: number): number | null {
  if (history.length < 2) return null;
  const step = (history[history.length - 1].at - history[0].at) / (history.length - 1);
  return step > 0 ? (step * (capacity - 1)) / 1000 : null;
}

export interface ProcessTrend {
  cpu: number[];
  memory: number[];
}

export type ProcessHistory = Map<number, ProcessTrend>;

export function trackProcesses(history: ProcessHistory, processes: ProcessInfo[], limit = PROCESS_HISTORY): ProcessHistory {
  const next: ProcessHistory = new Map();
  for (const process of processes) {
    const trend = history.get(process.pid) ?? { cpu: [], memory: [] };
    trend.cpu.push(process.cpu);
    trend.memory.push(process.memory);
    if (trend.cpu.length > limit) {
      trend.cpu.splice(0, trend.cpu.length - limit);
      trend.memory.splice(0, trend.memory.length - limit);
    }
    next.set(process.pid, trend);
  }
  return next;
}

export function sumTrends(trends: ProcessTrend[], field: keyof ProcessTrend): number[] {
  const length = Math.max(0, ...trends.map((trend) => trend[field].length));
  const total = new Array<number>(length).fill(0);
  for (const trend of trends) {
    const values = trend[field];
    const offset = length - values.length;
    values.forEach((value, index) => (total[offset + index] += value));
  }
  return total;
}
