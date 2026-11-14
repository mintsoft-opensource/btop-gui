import { level } from '@/lib/format';
import { Bar, cx } from './ui';

interface Props {
  label: string;
  value: number;
  detail: string;
  warn?: number;
  crit?: number;
  wide?: boolean;
}

export function Meter({ label, value, detail, warn = 75, crit = 90, wide = false }: Props) {
  return (
    <div className={cx('mt-1 grid items-center gap-2 text-[11px]', wide ? 'grid-cols-[15ch_1fr_auto]' : 'grid-cols-[7ch_1fr_auto]')}>
      <span className={cx('truncate text-left text-muted', !wide && '[direction:rtl]')} title={label}>{label}</span>
      <Bar value={value} tone={level(value, warn, crit)} />
      <span className="min-w-[9ch] text-right whitespace-nowrap text-fg tabular-nums">{detail}</span>
    </div>
  );
}
