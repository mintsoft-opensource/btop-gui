import { bytes, clockTime, duration, percent, rate, ratio } from '@/lib/format';
import type { ProcessTrend } from '@/lib/history';
import { processKey } from '@/lib/processes';
import type { ProcessInfo, Snapshot } from '@/lib/types';
import { DETAIL_GRID, DetailFrame, Fact } from './DetailFrame';
import { Sparkline } from './Sparkline';
import { button, cx, linkButton } from './ui';

interface Props {
  process: ProcessInfo;
  trend: ProcessTrend | undefined;
  snapshot: Snapshot;
  onSelect: (key: string | null) => void;
  onKill: (process: ProcessInfo) => void;
}

export function ProcessDetail({ process, trend, snapshot, onSelect, onKill }: Props) {
  const parent = process.parent !== null ? snapshot.processes.find((p) => p.pid === process.parent) : undefined;
  const children = snapshot.processes.filter((p) => p.parent === process.pid).length;
  const running = process.startedAt ? snapshot.at / 1000 - process.startedAt : 0;
  return (
    <DetailFrame
      title={process.name}
      subtitle={`PID ${process.pid} · ${process.status || '—'}`}
      actions={<button className={cx(button(), 'px-2.5 py-0.5')} onClick={() => onKill(process)}>END PROCESS</button>}
      onClose={() => onSelect(null)}
      facts={
        <dl className={DETAIL_GRID}>
          <Fact label="PARENT">
            {parent ? <button className={linkButton} onClick={() => onSelect(processKey(parent.pid))}>{parent.name} ({parent.pid})</button> : (process.parent ?? '—')}
          </Fact>
          <Fact label="CHILDREN">{children}</Fact>
          <Fact label="USER">{process.user || '—'}</Fact>
          <Fact label="STARTED">{clockTime(process.startedAt)}{running > 0 && <span className="text-muted"> · {duration(running)}</span>}</Fact>
          <Fact label="MEMORY">{bytes(process.memory)} <span className="text-muted">· {percent(ratio(process.memory, snapshot.memory.total), 1)}</span></Fact>
          <Fact label="VIRTUAL">{process.virtualMemory ? bytes(process.virtualMemory) : '—'}</Fact>
          <Fact label="DISK I/O">R {rate(process.readRate)} · W {rate(process.writeRate)}</Fact>
        </dl>
      }
      trends={[
        [`CPU ${percent(process.cpu, 1)}`, <Sparkline key="cpu" values={trend?.cpu ?? []} width={150} height={30} />],
        [`MEM ${bytes(process.memory)}`, <Sparkline key="mem" values={trend?.memory ?? []} floor={1} width={150} height={30} />],
      ]}
      footer={<p className="max-h-[2.8em] overflow-auto text-[11px] leading-[1.4] break-all text-muted select-text">{process.command}</p>}
    />
  );
}
