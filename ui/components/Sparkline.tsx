import { PROCESS_HISTORY } from '@/lib/history';

interface Props {
  values: number[];
  floor?: number;
  width?: number;
  height?: number;
  capacity?: number;
}

export function Sparkline({ values, floor = 10, width = 64, height = 16, capacity = PROCESS_HISTORY }: Props) {
  if (values.length < 2) return <svg className="block" width={width} height={height} aria-hidden />;
  const peak = Math.max(floor, ...values);
  const step = width / Math.max(1, capacity - 1);
  const offset = capacity - values.length;
  const points = values.map((value, index) => `${((offset + index) * step).toFixed(1)},${(height - 1 - (Math.min(value, peak) / peak) * (height - 2)).toFixed(1)}`);
  const first = (offset * step).toFixed(1);
  return (
    <svg className="block overflow-visible" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <path className="fill-current opacity-15" d={`M${first},${height} L${points.join(' L')} L${width},${height} Z`} />
      <polyline className="fill-none stroke-current stroke-[1.2]" points={points.join(' ')} />
    </svg>
  );
}
