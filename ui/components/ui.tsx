import type { ReactNode } from 'react';

export type Tone = 'ok' | 'warn' | 'crit';

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

export const TONE_TEXT: Record<Tone, string> = { ok: '', warn: 'text-amber', crit: 'text-red' };
const TONE_BAR: Record<Tone, string> = {
  ok: 'from-phosphor-dim to-phosphor',
  warn: 'from-amber/45 to-amber',
  crit: 'from-red/45 to-red',
};

type ButtonVariant = 'plain' | 'on' | 'warn' | 'crit' | 'quiet';
const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  plain: 'border-line-strong text-fg',
  quiet: 'border-line text-fg',
  on: 'border-phosphor bg-phosphor/10 text-phosphor',
  warn: 'border-amber text-amber',
  crit: 'border-red text-red',
};

export function button(variant: ButtonVariant = 'plain'): string {
  return cx(
    'cursor-pointer rounded-[5px] border px-3 py-[5px] font-display text-[11px] tracking-[0.15em] transition-colors',
    'enabled:hover:border-phosphor enabled:hover:text-phosphor disabled:cursor-default disabled:opacity-35',
    BUTTON_VARIANT[variant],
  );
}

export const linkButton = 'cursor-pointer font-mono text-phosphor underline decoration-dotted';
export const fieldInput =
  'rounded-md border border-line bg-field px-2.5 py-1.5 outline-none select-text placeholder:text-muted focus:border-phosphor focus:ring-1 focus:ring-phosphor/20';
export const caption = 'text-[9px] tracking-[0.3em] text-muted';

export function Bar({ value, tone = 'ok', className }: { value: number; tone?: Tone; className?: string }) {
  return (
    <span className={cx('relative block h-1.5 overflow-hidden bg-phosphor/8', className)}>
      <i
        className={cx('absolute inset-y-0 left-0 bg-linear-to-r transition-[width] duration-600', TONE_BAR[tone])}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </span>
  );
}

export function Panel({ title, meta, className, children }: { title?: ReactNode; meta?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={cx('relative min-w-0 rounded-lg border border-line bg-panel px-4 pt-3 pb-3.5', className)}>
      {title && (
        <h2 className="mb-2.5 flex items-baseline justify-between gap-3 font-display text-[11px] font-semibold tracking-[0.3em] text-muted">
          {title}
          {meta && <em className="truncate font-mono text-[10px] not-italic tracking-[0.06em] text-phosphor-dim">{meta}</em>}
        </h2>
      )}
      {children}
    </section>
  );
}

export function FocusPanel({ title, meta, chart, children }: { title: ReactNode; meta?: ReactNode; chart: ReactNode; children: ReactNode }) {
  return (
    <Panel title={title} meta={meta} className="flex min-h-0 flex-col">
      <div className="grid min-h-0 flex-1 grid-rows-[minmax(140px,1fr)_auto] gap-4">
        <div className="flex min-h-0 min-w-0 flex-col gap-2">{chart}</div>
        <div className="max-h-[300px] min-h-0 overflow-y-auto [scrollbar-width:thin]">{children}</div>
      </div>
    </Panel>
  );
}

export function SideTitle({ children }: { children: ReactNode }) {
  return <p className={cx(caption, 'mt-2.5 mb-0.5 first:mt-0')}>{children}</p>;
}

export function Stats({ items, column = false }: { items: [string, ReactNode, string?][]; column?: boolean }) {
  return (
    <dl className={cx('flex gap-x-[22px] gap-y-1.5', column ? 'mt-3 flex-col' : 'flex-wrap')}>
      {items.map(([label, value, className]) => (
        <div key={label}>
          <dt className={caption}>{label}</dt>
          <dd className={cx('text-[13px] tabular-nums', className)}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Dialog({ title, wide = false, onClose, children }: { title: string; wide?: boolean; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-60 grid place-items-center bg-black/55 p-4 backdrop-blur-[2px]" onClick={onClose}>
      <div
        className={cx('grid w-full gap-2.5 rounded-[10px] border border-line-strong bg-surface px-5 py-[18px] shadow-2xl shadow-phosphor/10', wide ? 'max-w-[560px]' : 'max-w-[440px]')}
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="font-display text-[13px] tracking-[0.3em] text-phosphor">{title}</h3>
        {children}
      </div>
    </div>
  );
}
