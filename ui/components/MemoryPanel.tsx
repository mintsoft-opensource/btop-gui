import { useMemo } from 'react';
import { bytes, ratio } from '@/lib/format';
import { HISTORY_LENGTH, type Sample } from '@/lib/history';
import type { Snapshot } from '@/lib/types';
import { Graph } from './Graph';
import { Meter } from './Meter';

export function MemoryPanel({ snapshot, history }: { snapshot: Snapshot; history: Sample[] }) {
  const { memory } = snapshot;
  const series = useMemo(() => [{ values: history.map((s) => s.memory), color: '#b8a6ff' }], [history]);
  const usedPct = ratio(memory.used, memory.total);
  return (
    <section className="panel">
      <h2>
        MEMORY <em>{bytes(memory.total)}</em>
      </h2>
      <Meter label="USED" value={usedPct} detail={bytes(memory.used)} warn={80} crit={92} />
      <Meter label="AVAIL" value={ratio(memory.available, memory.total)} detail={bytes(memory.available)} warn={101} crit={101} />
      <Meter label="FREE" value={ratio(memory.free, memory.total)} detail={bytes(memory.free)} warn={101} crit={101} />
      {memory.swapTotal > 0 && (
        <Meter label="SWAP" value={ratio(memory.swapUsed, memory.swapTotal)} detail={`${bytes(memory.swapUsed)} / ${bytes(memory.swapTotal)}`} warn={50} crit={80} />
      )}
      <Graph series={series} max={100} capacity={HISTORY_LENGTH} height={56} />
    </section>
  );
}
