import type { ReactNode } from 'react';
import { button, caption, cx } from './ui';

export const DETAIL_GRID = 'grid grid-cols-4 gap-x-4 gap-y-1.5 @max-[860px]:grid-cols-2';
export const DETAIL_VALUE = 'truncate tabular-nums';

interface Props {
  title: string;
  subtitle: ReactNode;
  actions: ReactNode;
  onClose: () => void;
  facts: ReactNode;
  trends: [string, ReactNode][];
  footer?: ReactNode;
}

export function DetailFrame({ title, subtitle, actions, onClose, facts, trends, footer }: Props) {
  return (
    <div className="mt-2.5 grid gap-2 rounded-md border border-line bg-phosphor/4 px-3.5 py-2.5">
      <div className="flex items-baseline gap-3">
        <b className="font-display text-[13px] tracking-[0.08em] text-phosphor">{title}</b>
        <span className="text-muted">{subtitle}</span>
        <span className="ml-auto flex gap-1.5">
          {actions}
          <button className={cx(button(), 'px-2.5 py-0.5')} onClick={onClose} title="Close (Esc)" aria-label="Close">✕</button>
        </span>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-[18px] max-[900px]:grid-cols-1 @max-[640px]:grid-cols-1">
        {facts}
        <div className="grid grid-cols-[repeat(2,auto)] gap-3.5 text-phosphor">
          {trends.map(([label, chart]) => (
            <div key={label} className="grid gap-0.5">
              <span className={caption}>{label}</span>
              {chart}
            </div>
          ))}
        </div>
      </div>
      {footer}
    </div>
  );
}

export function Fact({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'col-span-2' : undefined}>
      <dt className={caption}>{label}</dt>
      <dd className={wide ? 'flex flex-wrap gap-x-3 gap-y-1' : DETAIL_VALUE}>{children}</dd>
    </div>
  );
}
