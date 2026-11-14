import { useMemo } from 'react';
import { bytes, rate, ratio } from '@/lib/format';
import { Graph } from './Graph';
import { Meter } from './Meter';
import type { PanelProps } from './PanelProps';
import { FocusPanel, SideTitle } from './ui';

export function DiskPanel({ snapshot, history, capacity, spanSeconds }: PanelProps) {
  const series = useMemo(
    () => [
      { values: history.map((s) => s.read), color: '--phosphor' },
      { values: history.map((s) => s.write), color: '--amber', invert: true },
    ],
    [history],
  );
  const latest = history[history.length - 1];
  const meta = (
    <>
      <span className="text-phosphor">▲ READ {rate(latest?.read ?? 0)}</span> · <span className="text-amber">▼ WRITE {rate(latest?.write ?? 0)}</span>
    </>
  );
  return (
    <FocusPanel title="DISK I/O" meta={meta} chart={<Graph series={series} capacity={capacity} spanSeconds={spanSeconds} mirrored />}>
      <SideTitle>VOLUMES</SideTitle>
      {snapshot.disks.map((disk) => (
        <Meter
          key={disk.mount}
          label={disk.mount}
          value={ratio(disk.total - disk.available, disk.total)}
          detail={`${bytes(disk.available)} free / ${bytes(disk.total)}`}
          warn={85}
          crit={95}
        />
      ))}
    </FocusPanel>
  );
}
