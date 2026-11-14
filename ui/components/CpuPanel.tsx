import { useMemo } from 'react';
import { duration, level, temperature } from '@/lib/format';
import { Graph } from './Graph';
import type { PanelProps } from './PanelProps';
import { Bar, FocusPanel, Stats, TONE_TEXT, cx } from './ui';

export function CpuPanel({ snapshot, history, capacity, spanSeconds, tempUnit }: PanelProps) {
  const { cpu, host } = snapshot;
  const series = useMemo(() => [{ values: history.map((s) => s.cpu), color: '--phosphor' }], [history]);
  const chart = (
    <>
      <Stats
        items={[
          ['LOAD', cpu.load ? cpu.load.map((v) => v.toFixed(2)).join(' ') : '—'],
          ['FREQ', cpu.frequencyMhz ? `${(cpu.frequencyMhz / 1000).toFixed(2)} GHz` : '—'],
          ['TEMP', cpu.temperature ? temperature(cpu.temperature, tempUnit) : '—', cpu.temperature ? TONE_TEXT[level(cpu.temperature, 75, 90)] : ''],
          ['CORES', cpu.physicalCores ? `${cpu.physicalCores}C / ${cpu.cores.length}T` : `${cpu.cores.length}T`],
          ['UPTIME', duration(host.uptime)],
        ]}
      />
      <Graph series={series} max={100} capacity={capacity} spanSeconds={spanSeconds} />
    </>
  );
  return (
    <FocusPanel title="CPU" meta={cpu.brand || host.arch} chart={chart}>
      <div className="grid content-start gap-x-3.5 gap-y-[5px]" style={{ gridTemplateColumns: `repeat(${cpu.cores.length > 16 ? 3 : 2}, minmax(0, 1fr))` }}>
        {cpu.cores.map((usage, index) => (
          <div key={index} className="grid grid-cols-[3.4ch_1fr_4.5ch] items-center gap-1.5 text-[11px] whitespace-pre text-muted tabular-nums">
            <span>C{index}</span>
            <Bar value={usage} tone={level(usage)} />
            <span className={cx('text-right text-fg', TONE_TEXT[level(usage)])}>{usage.toFixed(0).padStart(3, ' ')}%</span>
          </div>
        ))}
      </div>
    </FocusPanel>
  );
}
