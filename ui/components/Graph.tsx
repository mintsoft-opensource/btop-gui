'use client';

import { useEffect, useRef } from 'react';
import { span } from '@/lib/format';

export interface Series {
  values: number[];
  color: string;
  invert?: boolean;
}

interface Props {
  series: Series[];
  max?: number;
  capacity: number;
  height?: number;
  mirrored?: boolean;
  spanSeconds?: number | null;
  className?: string;
}

const MIN_POINTS = 30;

function token(element: Element, name: string, fallback: string): string {
  return getComputedStyle(element).getPropertyValue(name).trim() || fallback;
}

export function Graph({ series, max, capacity, height, mirrored = false, spanSeconds, className = '' }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const draw = () => {
      const ratio = window.devicePixelRatio || 1;
      const width = element.clientWidth;
      const tall = element.clientHeight;
      if (!width || !tall) return;
      element.width = Math.round(width * ratio);
      element.height = Math.round(tall * ratio);
      const context = element.getContext('2d');
      if (!context) return;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, tall);

      const grid = token(element, '--grid', 'rgba(77,184,255,0.07)');
      context.strokeStyle = grid;
      context.lineWidth = 1;
      for (let i = 1; i < 4; i++) {
        const y = Math.round((tall * i) / 4) + 0.5;
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(width, y);
        context.stroke();
      }

      const visible = series.map((s) => ({ ...s, values: s.values.slice(-capacity), color: s.color.startsWith('--') ? token(element, s.color, '#4db8ff') : s.color }));
      const filled = Math.max(0, ...visible.map((s) => s.values.length));
      const points = Math.min(capacity, Math.max(filled, MIN_POINTS));
      const peak = max ?? Math.max(1, ...visible.flatMap((s) => s.values)) * 1.15;
      const baseline = mirrored ? tall / 2 : tall;
      const reach = mirrored ? tall / 2 - 2 : tall - 2;
      const step = width / Math.max(1, points - 1);
      const glow = Number(token(element, '--chart-glow', '6')) || 0;

      for (const { values, color, invert } of visible) {
        if (values.length < 2) continue;
        const offset = points - values.length;
        const point = (value: number, index: number): [number, number] => {
          const magnitude = (Math.min(value, peak) / peak) * reach;
          return [(offset + index) * step, invert ? baseline + magnitude : baseline - magnitude];
        };
        const trace = () => {
          context.beginPath();
          values.forEach((value, index) => {
            const [x, y] = point(value, index);
            if (index === 0) context.moveTo(x, y);
            else context.lineTo(x, y);
          });
        };
        const gradient = context.createLinearGradient(0, invert ? baseline : baseline - reach, 0, invert ? baseline + reach : baseline);
        gradient.addColorStop(invert ? 1 : 0, `${color}66`);
        gradient.addColorStop(invert ? 0 : 1, `${color}08`);

        trace();
        context.lineTo(point(values[values.length - 1], values.length - 1)[0], baseline);
        context.lineTo(point(values[0], 0)[0], baseline);
        context.closePath();
        context.fillStyle = gradient;
        context.fill();

        trace();
        context.strokeStyle = color;
        context.lineWidth = 1.5;
        context.shadowColor = color;
        context.shadowBlur = glow;
        context.stroke();
        context.shadowBlur = 0;
      }

      if (mirrored) {
        context.strokeStyle = token(element, '--line-strong', 'rgba(77,184,255,0.4)');
        context.beginPath();
        context.moveTo(0, baseline + 0.5);
        context.lineTo(width, baseline + 0.5);
        context.stroke();
      }

      const shown = spanSeconds ? (spanSeconds * (points - 1)) / Math.max(1, capacity - 1) : 0;
      if (shown && tall >= 40) {
        context.font = '9px "IBM Plex Mono", ui-monospace, monospace';
        context.fillStyle = token(element, '--muted', '#5d7a96');
        context.textBaseline = 'bottom';
        context.textAlign = 'left';
        context.fillText(`-${span(shown)}`, 3, tall - 2);
        context.textAlign = 'right';
        context.fillText('now', width - 3, tall - 2);
      }
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(element);
    return () => observer.disconnect();
  }, [series, max, capacity, height, mirrored, spanSeconds]);

  return (
    <canvas
      ref={canvas}
      className={`block w-full ${height ? '' : 'h-0 min-h-[60px] flex-1 max-[900px]:min-h-[140px]'} ${className}`}
      style={height ? { height } : undefined}
    />
  );
}
