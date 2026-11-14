import { useMemo } from 'react';
import { duration, level, percent } from '@/lib/format';
import type { Sample } from '@/lib/history';
import { HISTORY_LENGTH } from '@/lib/history';
import type { Snapshot } from '@/lib/types';
import { Graph } from './Graph';

export function CpuPanel({ snapshot, history }: { snapshot: Snapshot; history: Sample[] }) {
  const { cpu, host } = snapshot;
  const series = useMemo(() => [{ values: history.map((s) => s.cpu), color: '#4db8ff' }], [history]);
  return (
    <section className="panel cpu">
      <h2>
        CPU <em>{cpu.brand || host.arch}</em>
      </h2>
      <div className="cpu-body">
        <div className="cpu-main">
          <div className="cpu-readout">
            <b className={level(cpu.usage)}>{percent(cpu.usage)}</b>
            <dl>
              <div><dt>LOAD</dt><dd>{cpu.load ? cpu.load.map((v) => v.toFixed(2)).join(' ') : '—'}</dd></div>
              <div><dt>FREQ</dt><dd>{cpu.frequencyMhz ? `${(cpu.frequencyMhz / 1000).toFixed(2)} GHz` : '—'}</dd></div>
              <div><dt>TEMP</dt><dd className={cpu.temperature ? level(cpu.temperature, 75, 90) : ''}>{cpu.temperature ? `${cpu.temperature.toFixed(0)}°C` : '—'}</dd></div>
              <div><dt>CORES</dt><dd>{cpu.physicalCores ? `${cpu.physicalCores}C / ${cpu.cores.length}T` : `${cpu.cores.length}T`}</dd></div>
              <div><dt>UP</dt><dd>{duration(host.uptime)}</dd></div>
            </dl>
          </div>
          <Graph series={series} max={100} capacity={HISTORY_LENGTH} height={150} />
        </div>
        <div className="cores" style={{ gridTemplateColumns: `repeat(${cpu.cores.length > 16 ? 4 : 2}, minmax(0, 1fr))` }}>
          {cpu.cores.map((usage, index) => (
            <div key={index} className={`core ${level(usage)}`}>
              <span>C{index}</span>
              <span className="core-track"><i style={{ width: `${usage}%` }} /></span>
              <span>{usage.toFixed(0).padStart(3, ' ')}%</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
