import { useMemo } from 'react';
import { bytes, rate, ratio } from '@/lib/format';
import { HISTORY_LENGTH, type Sample } from '@/lib/history';
import type { Snapshot } from '@/lib/types';
import { Graph } from './Graph';
import { Meter } from './Meter';

export function DiskPanel({ snapshot, history }: { snapshot: Snapshot; history: Sample[] }) {
  const series = useMemo(
    () => [
      { values: history.map((s) => s.read), color: '#4db8ff' },
      { values: history.map((s) => s.write), color: '#ffb547', invert: true },
    ],
    [history],
  );
  const latest = history[history.length - 1];
  return (
    <section className="panel">
      <h2>
        DISKS <em>R {rate(latest?.read ?? 0)} · W {rate(latest?.write ?? 0)}</em>
      </h2>
      {snapshot.disks.map((disk) => {
        const used = disk.total - disk.available;
        return (
          <Meter
            key={disk.mount}
            label={disk.mount}
            value={ratio(used, disk.total)}
            detail={`${bytes(disk.available)} free`}
            warn={85}
            crit={95}
          />
        );
      })}
      <Graph series={series} capacity={HISTORY_LENGTH} height={56} mirrored />
    </section>
  );
}
