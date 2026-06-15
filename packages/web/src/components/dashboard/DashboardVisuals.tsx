'use client';

import { useMemo } from 'react';

export interface TrendDay {
  date: string;
  label: string;
  conversations: number;
  messages: number;
  leads: number;
}

export type ChartMetric = 'messages' | 'conversations' | 'leads';

export const CHART_METRIC_META: Record<ChartMetric, { label: string; colors: [string, string] }> = {
  messages: { label: 'Mensajes', colors: ['#22d3ee', '#0891b2'] },
  conversations: { label: 'Chats', colors: ['#e879f9', '#a855f7'] },
  leads: { label: 'Leads', colors: ['#a78bfa', '#7c3aed'] },
};

interface WeeklyActivityChartProps {
  data: TrendDay[];
  activeMetrics: ChartMetric[];
  id: string;
}

export function WeeklyActivityChart({ data, activeMetrics, id }: WeeklyActivityChartProps) {
  const metrics = activeMetrics.length > 0 ? activeMetrics : (['messages'] as ChartMetric[]);

  const max = useMemo(() => {
    const vals = data.flatMap((d) => metrics.map((m) => d[m]));
    return Math.max(...vals, 1);
  }, [data, metrics]);

  const w = 560;
  const h = 188;
  const padX = 12;
  const padY = 22;
  const chartW = w - padX * 2;
  const slotW = chartW / Math.max(data.length, 1);
  const barGap = 3;
  const innerPad = 6;
  const barW = Math.min(
    9,
    (slotW - innerPad * 2 - barGap * (metrics.length - 1)) / Math.max(metrics.length, 1),
  );
  const plotH = h - padY * 2 - 14;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="dash-bar-svg" preserveAspectRatio="none">
      <defs>
        {metrics.map((m) => {
          const [from, to] = CHART_METRIC_META[m].colors;
          return (
            <linearGradient key={m} id={`${id}-grad-${m}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={from} stopOpacity="0.95" />
              <stop offset="100%" stopColor={to} stopOpacity="0.3" />
            </linearGradient>
          );
        })}
      </defs>

      {[0.33, 0.66].map((pct) => (
        <line
          key={pct}
          x1={padX}
          x2={w - padX}
          y1={padY + plotH * (1 - pct)}
          y2={padY + plotH * (1 - pct)}
          stroke="var(--chart-grid)"
          strokeWidth="1"
        />
      ))}

      {data.map((d, i) => {
        const slotX = padX + slotW * i;
        const slotCenter = slotX + slotW / 2;
        const groupW = metrics.length * barW + (metrics.length - 1) * barGap;
        const groupStart = slotCenter - groupW / 2;
        const dayLabel = d.label.split(' ')[0]?.slice(0, 1).toUpperCase() || '?';
        const baseY = h - padY;

        return (
          <g key={d.date}>
            <line
              x1={slotCenter - 10}
              x2={slotCenter + 10}
              y1={baseY - 10}
              y2={baseY - 10}
              stroke="var(--chart-tick)"
              strokeWidth="2"
              strokeLinecap="round"
            />

            {metrics.map((metric, j) => {
              const v = d[metric];
              const barH = Math.max((v / max) * plotH, v > 0 ? 5 : 0);
              if (barH <= 0) return null;
              const x = groupStart + j * (barW + barGap);
              const y = baseY - 12 - barH;

              return (
                <rect
                  key={metric}
                  x={x}
                  y={y}
                  width={barW}
                  height={barH}
                  rx={barW / 2}
                  fill={`url(#${id}-grad-${metric})`}
                />
              );
            })}

            <text
              x={slotCenter}
              y={h - 4}
              textAnchor="middle"
              fill="var(--chart-label)"
              fontSize="10"
              fontWeight="600"
            >
              {dayLabel}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function MiniSparkline({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(...values, 1);
  const w = 72;
  const h = 24;
  const pts = values.map((v, i) => {
    const x = (i / Math.max(values.length - 1, 1)) * w;
    const y = h - (v / max) * (h - 4) - 2;
    return `${i === 0 ? 'M' : 'L'}${x},${y}`;
  }).join(' ');

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={72} height={24} className="dash-mini-spark">
      <path d={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.75" />
    </svg>
  );
}

export function useDelta(values: number[]): number {
  return useMemo(() => {
    if (values.length < 2) return 0;
    const recent = values.slice(-3).reduce((a, b) => a + b, 0);
    const prev = values.slice(-6, -3).reduce((a, b) => a + b, 0);
    if (prev === 0) return recent > 0 ? 100 : 0;
    return Math.round(((recent - prev) / prev) * 100);
  }, [values]);
}

export function pct(current: number, total: number): number {
  if (!total) return 0;
  return Math.min(100, Math.round((current / total) * 100));
}
