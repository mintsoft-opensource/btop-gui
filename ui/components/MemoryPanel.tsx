import { useMemo } from 'react';
import { bytes, ratio } from '@/lib/format';
import { groupApps } from '@/lib/processes';
import { Graph } from './Graph';
import { Meter } from './Meter';
import type { PanelProps } from './PanelProps';
import { FocusPanel, SideTitle } from './ui';

const TOP_APPS = 3;

export function MemoryPanel({ snapshot, history, capacity, spanSeconds }: PanelProps) {
  const { memory } = snapshot;
  const series = useMemo(() => [{ values: history.map((s) => s.memory), color: '--ice' }], [history]);
  const top = useMemo(
    () => groupApps(snapshot.processes).sort((a, b) => b.total.memory - a.total.memory).slice(0, TOP_APPS),
    [snapshot.processes],
  );
  const cache = Math.max(0, memory.available - memory.free);
  return (
    <FocusPanel title="MEMORY" meta={bytes(memory.total)} chart={<Graph series={series} max={100} capacity={capacity} spanSeconds={spanSeconds} />}>
      <Meter label="USED" value={ratio(memory.used, memory.total)} detail={bytes(memory.used)} warn={80} crit={92} />
      <Meter label="AVAIL" value={ratio(memory.available, memory.total)} detail={bytes(memory.available)} warn={101} crit={101} />
      <Meter label="CACHE" value={ratio(cache, memory.total)} detail={bytes(cache)} warn={101} crit={101} />
      {memory.swapTotal > 0 && (
        <Meter label="SWAP" value={ratio(memory.swapUsed, memory.swapTotal)} detail={`${bytes(memory.swapUsed)} / ${bytes(memory.swapTotal)}`} warn={50} crit={80} />
      )}
      <SideTitle>TOP APPS</SideTitle>
      {top.map((app) => (
        <Meter key={app.name} wide label={app.name} value={ratio(app.total.memory, memory.total)} detail={bytes(app.total.memory)} warn={101} crit={101} />
      ))}
    </FocusPanel>
  );
}
