import { bits, bytes, level, percent, rate, ratio, temperature, type TempUnit } from '@/lib/format';
import type { Sample } from '@/lib/history';
import type { Snapshot } from '@/lib/types';
import type { Series } from './Graph';
import type { Tone } from './ui';

export type Metric = 'cpu' | 'memory' | 'gpu' | 'disk' | 'network' | 'battery';

export interface Card {
  id: Metric;
  label: string;
  value: string;
  detail: string;
  tone: Tone;
  series: Series[];
  max?: number;
  mirrored?: boolean;
}

export function metricCards(snapshot: Snapshot, history: Sample[], tempUnit: TempUnit): Card[] {
  const latest = history[history.length - 1];
  const { cpu, memory } = snapshot;
  const gpu = snapshot.gpus?.[0];
  const battery = snapshot.battery;
  const cards: Card[] = [
    {
      id: 'cpu',
      label: 'CPU',
      value: percent(cpu.usage),
      detail: [cpu.temperature ? temperature(cpu.temperature, tempUnit) : null, cpu.frequencyMhz ? `${(cpu.frequencyMhz / 1000).toFixed(1)} GHz` : null, `${cpu.cores.length} threads`].filter(Boolean).join(' · '),
      tone: level(cpu.usage),
      series: [{ values: history.map((s) => s.cpu), color: '--phosphor' }],
      max: 100,
    },
    {
      id: 'memory',
      label: 'MEMORY',
      value: percent(ratio(memory.used, memory.total)),
      detail: `${bytes(memory.used)} / ${bytes(memory.total)}`,
      tone: level(ratio(memory.used, memory.total), 80, 92),
      series: [{ values: history.map((s) => s.memory), color: '--ice' }],
      max: 100,
    },
  ];
  if (gpu) {
    cards.push({
      id: 'gpu',
      label: 'GPU',
      value: percent(gpu.usage),
      detail: gpu.memoryUsed !== null ? `${bytes(gpu.memoryUsed)} in use` : gpu.name,
      tone: level(gpu.usage),
      series: [{ values: history.map((s) => s.gpu), color: '--amber' }],
      max: 100,
    });
  }
  cards.push(
    {
      id: 'disk',
      label: 'DISK',
      value: rate((latest?.read ?? 0) + (latest?.write ?? 0)),
      detail: `R ${rate(latest?.read ?? 0)} · W ${rate(latest?.write ?? 0)}`,
      tone: 'ok',
      series: [
        { values: history.map((s) => s.read), color: '--phosphor' },
        { values: history.map((s) => s.write), color: '--amber', invert: true },
      ],
      mirrored: true,
    },
    {
      id: 'network',
      label: 'NETWORK',
      value: bits((latest?.rx ?? 0) + (latest?.tx ?? 0)),
      detail: `▼ ${bits(latest?.rx ?? 0)} · ▲ ${bits(latest?.tx ?? 0)}`,
      tone: 'ok',
      series: [
        { values: history.map((s) => s.rx), color: '--phosphor' },
        { values: history.map((s) => s.tx), color: '--pink', invert: true },
      ],
      mirrored: true,
    },
  );
  if (battery) {
    cards.push({
      id: 'battery',
      label: 'BATTERY',
      value: percent(battery.percent),
      detail: battery.charging ? 'Charging' : battery.plugged ? 'On AC power' : 'On battery',
      tone: battery.plugged ? 'ok' : level(100 - battery.percent, 80, 90),
      series: [{ values: history.map((s) => s.battery ?? 0), color: '--ice' }],
      max: 100,
    });
  }
  return cards;
}
