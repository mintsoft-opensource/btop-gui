import { useMemo } from 'react';
import { bits, bytes } from '@/lib/format';
import { HISTORY_LENGTH, isPhysicalInterface, type Sample } from '@/lib/history';
import type { Snapshot } from '@/lib/types';
import { Graph } from './Graph';

export function NetworkPanel({ snapshot, history }: { snapshot: Snapshot; history: Sample[] }) {
  const series = useMemo(
    () => [
      { values: history.map((s) => s.rx), color: '#4db8ff' },
      { values: history.map((s) => s.tx), color: '#ff7ab6', invert: true },
    ],
    [history],
  );
  const latest = history[history.length - 1];
  const interfaces = snapshot.networks.filter((net) => isPhysicalInterface(net.name) && net.rxTotal + net.txTotal > 0).slice(0, 4);
  return (
    <section className="panel">
      <h2>
        NETWORK <em>▼ {bits(latest?.rx ?? 0)} · ▲ {bits(latest?.tx ?? 0)}</em>
      </h2>
      <Graph series={series} capacity={HISTORY_LENGTH} height={84} mirrored />
      <table className="nics">
        <tbody>
          {interfaces.map((net) => (
            <tr key={net.name}>
              <td title={net.addresses.join('\n')}>{net.name}</td>
              <td className="rx">▼ {bits(net.rxRate)}</td>
              <td className="tx">▲ {bits(net.txRate)}</td>
              <td className="muted">{bytes(net.rxTotal + net.txTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
