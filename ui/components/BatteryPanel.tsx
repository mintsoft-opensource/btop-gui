import { useMemo } from 'react';
import { duration, percent } from '@/lib/format';
import { Graph } from './Graph';
import { Meter } from './Meter';
import type { PanelProps } from './PanelProps';
import { FocusPanel, Stats } from './ui';

export function BatteryPanel({ snapshot, history, capacity, spanSeconds }: PanelProps) {
  const battery = snapshot.battery;
  const series = useMemo(() => [{ values: history.map((s) => s.battery ?? 0), color: '--ice' }], [history]);
  if (!battery) return null;
  return (
    <FocusPanel
      title="BATTERY"
      meta={battery.charging ? 'CHARGING' : battery.plugged ? 'AC POWER' : 'ON BATTERY'}
      chart={<Graph series={series} max={100} capacity={capacity} spanSeconds={spanSeconds} />}
    >
      <Meter label="CHARGE" value={battery.percent} detail={percent(battery.percent)} warn={101} crit={101} />
      <Stats
        column
        items={[
          ['SOURCE', battery.plugged ? 'Power adapter' : 'Battery'],
          ['STATE', battery.charging ? 'Charging' : battery.plugged ? 'Not charging' : 'Discharging'],
          ['REMAINING', battery.remainingSecs ? duration(battery.remainingSecs) : '—'],
        ]}
      />
    </FocusPanel>
  );
}
