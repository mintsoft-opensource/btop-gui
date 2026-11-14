import { level } from '@/lib/format';

interface Props {
  label: string;
  value: number;
  detail: string;
  warn?: number;
  crit?: number;
}

export function Meter({ label, value, detail, warn = 75, crit = 90 }: Props) {
  return (
    <div className={`meter ${level(value, warn, crit)}`}>
      <span className="meter-label" title={label}>{label}</span>
      <span className="meter-track"><i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></span>
      <span className="meter-detail">{detail}</span>
    </div>
  );
}
