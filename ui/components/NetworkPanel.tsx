import { useMemo } from 'react';
import { bits, bytes } from '@/lib/format';
import { isPhysicalInterface } from '@/lib/history';
import { Graph } from './Graph';
import type { PanelProps } from './PanelProps';
import { FocusPanel } from './ui';

const MAX_INTERFACES = 6;
const HEAD = 'px-1 pb-1 text-left text-[9px] font-normal tracking-[0.25em] text-muted';
const CELL = 'px-1 py-[3px] whitespace-nowrap';

export function NetworkPanel({ snapshot, history, capacity, spanSeconds }: PanelProps) {
  const series = useMemo(
    () => [
      { values: history.map((s) => s.rx), color: '--phosphor' },
      { values: history.map((s) => s.tx), color: '--pink', invert: true },
    ],
    [history],
  );
  const latest = history[history.length - 1];
  const interfaces = snapshot.networks.filter((net) => isPhysicalInterface(net.name) && net.rxTotal + net.txTotal > 0).slice(0, MAX_INTERFACES);
  const meta = (
    <>
      <span className="text-phosphor">▲ IN {bits(latest?.rx ?? 0)}</span> · <span className="text-pink">▼ OUT {bits(latest?.tx ?? 0)}</span>
    </>
  );
  return (
    <FocusPanel title="NETWORK" meta={meta} chart={<Graph series={series} capacity={capacity} spanSeconds={spanSeconds} mirrored />}>
      <table className="w-full border-collapse text-[11px] tabular-nums">
        <thead>
          <tr>
            <th className={HEAD}>IFACE</th>
            <th className={HEAD}>IN</th>
            <th className={HEAD}>OUT</th>
            <th className={`${HEAD} text-right`}>TOTAL</th>
          </tr>
        </thead>
        <tbody>
          {interfaces.map((net) => (
            <tr key={net.name}>
              <td className={`${CELL} max-w-[10ch] truncate text-fg`} title={net.addresses.join('\n')}>{net.name}</td>
              <td className={`${CELL} text-phosphor`}>{bits(net.rxRate)}</td>
              <td className={`${CELL} text-pink`}>{bits(net.txRate)}</td>
              <td className={`${CELL} text-right text-muted`}>{bytes(net.rxTotal + net.txTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </FocusPanel>
  );
}
