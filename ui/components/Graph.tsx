'use client';

import { useEffect, useRef } from 'react';

export interface Series {
  values: number[];
  color: string;
  invert?: boolean;
}

interface Props {
  series: Series[];
  max?: number;
  capacity: number;
  height: number;
  mirrored?: boolean;
}

export function Graph({ series, max, capacity, height, mirrored = false }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const draw = () => {
      const ratio = window.devicePixelRatio || 1;
      const width = element.clientWidth;
      element.width = Math.round(width * ratio);
      element.height = Math.round(height * ratio);
      const context = element.getContext('2d');
      if (!context) return;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);

      context.strokeStyle = 'rgba(77,184,255,0.07)';
      context.lineWidth = 1;
      for (let i = 1; i < 4; i++) {
        const y = Math.round((height * i) / 4) + 0.5;
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(width, y);
        context.stroke();
      }

      const peak = max ?? Math.max(1, ...series.flatMap((s) => s.values)) * 1.15;
      const baseline = mirrored ? height / 2 : height;
      const span = mirrored ? height / 2 - 2 : height - 2;
      const step = width / Math.max(1, capacity - 1);

      for (const { values, color, invert } of series) {
        if (values.length < 2) continue;
        const offset = capacity - values.length;
        const point = (value: number, index: number): [number, number] => {
          const magnitude = (Math.min(value, peak) / peak) * span;
          return [(offset + index) * step, invert ? baseline + magnitude : baseline - magnitude];
        };
        const gradient = context.createLinearGradient(0, invert ? baseline : baseline - span, 0, invert ? baseline + span : baseline);
        gradient.addColorStop(invert ? 1 : 0, `${color}66`);
        gradient.addColorStop(invert ? 0 : 1, `${color}08`);

        context.beginPath();
        values.forEach((value, index) => {
          const [x, y] = point(value, index);
          if (index === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        });
        const [lastX] = point(values[values.length - 1], values.length - 1);
        const [firstX] = point(values[0], 0);
        context.lineTo(lastX, baseline);
        context.lineTo(firstX, baseline);
        context.closePath();
        context.fillStyle = gradient;
        context.fill();

        context.beginPath();
        values.forEach((value, index) => {
          const [x, y] = point(value, index);
          if (index === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        });
        context.strokeStyle = color;
        context.lineWidth = 1.5;
        context.shadowColor = color;
        context.shadowBlur = 6;
        context.stroke();
        context.shadowBlur = 0;
      }

      if (mirrored) {
        context.strokeStyle = 'rgba(77,184,255,0.25)';
        context.beginPath();
        context.moveTo(0, baseline + 0.5);
        context.lineTo(width, baseline + 0.5);
        context.stroke();
      }
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(element);
    return () => observer.disconnect();
  }, [series, max, capacity, height, mirrored]);

  return <canvas ref={canvas} className="graph" style={{ height }} />;
}
