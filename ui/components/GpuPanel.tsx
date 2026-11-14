import { useMemo } from 'react';
import { bytes, level, percent, ratio, temperature } from '@/lib/format';
import { Graph } from './Graph';
import { Meter } from './Meter';
import type { PanelProps } from './PanelProps';
import { FocusPanel, SideTitle, TONE_TEXT, cx } from './ui';

export function GpuPanel({ snapshot, history, capacity, spanSeconds, tempUnit }: PanelProps) {
  const gpus = snapshot.gpus ?? [];
  const series = useMemo(() => [{ values: history.map((s) => s.gpu), color: '--amber' }], [history]);
  return (
    <FocusPanel title="GPU" meta={gpus[0]?.name ?? '—'} chart={<Graph series={series} max={100} capacity={capacity} spanSeconds={spanSeconds} />}>
      {gpus.map((gpu, index) => (
        <div key={`${gpu.name}-${index}`} className="mt-2.5 first:mt-0">
          {gpus.length > 1 && <SideTitle>{gpu.name}</SideTitle>}
          <Meter label="LOAD" value={gpu.usage} detail={percent(gpu.usage)} />
          {gpu.memoryUsed !== null && (
            <Meter
              label="VRAM"
              value={gpu.memoryTotal ? ratio(gpu.memoryUsed, gpu.memoryTotal) : 0}
              detail={gpu.memoryTotal ? `${bytes(gpu.memoryUsed)} / ${bytes(gpu.memoryTotal)}` : bytes(gpu.memoryUsed)}
              warn={85}
              crit={95}
            />
          )}
          {gpu.temperature !== null && (
            <p className={cx('mt-1.5 text-right text-[11px]', TONE_TEXT[level(gpu.temperature, 75, 90)])}>TEMP {temperature(gpu.temperature, tempUnit)}</p>
          )}
        </div>
      ))}
    </FocusPanel>
  );
}
