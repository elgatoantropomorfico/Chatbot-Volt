'use client';

import { useMemo } from 'react';

export interface TrendDay {
  date: string;
  label: string;
  conversations: number;
  messages: number;
  leads: number;
}

const BAR_COLORS: [string, string][] = [
  ['#a78bfa', '#7c3aed'],
  ['#22d3ee', '#0891b2'],
];

interface GlowingBarChartProps {
  data: TrendDay[];
  metric: 'messages' | 'conversations' | 'leads';
  id: string;
}

export function GlowingBarChart({ data, metric, id }: GlowingBarChartProps) {
  const values = data.map((d) => d[metric]);
  const max = Math.max(...values, 1);
  const w = 520;
  const h = 180;
  const padX = 24;
  const padY = 20;
  const barGap = 18;
  const barW = Math.min(12, (w - padX * 2 - barGap * (data.length - 1)) / Math.max(data.length, 1));

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="dash-bar-svg" preserveAspectRatio="xMidYMid meet">
      <defs>
        {BAR_COLORS.map(([from, to], i) => (
          <linearGradient key={i} id={`${id}-grad-${i}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={from} stopOpacity="0.95" />
            <stop offset="100%" stopColor={to} stopOpacity="0.35" />
          </linearGradient>
        ))}
      </defs>

      {[0.33, 0.66].map((pct) => (
        <line
          key={pct}
          x1={padX}
          x2={w - padX}
          y1={h - padY - (h - padY * 2) * pct}
          y2={h - padY - (h - padY * 2) * pct}
          stroke="rgba(255,255,255,0.04)"
          strokeWidth="1"
        />
      ))}

      {data.map((d, i) => {
        const v = d[metric];
        const barH = Math.max((v / max) * (h - padY * 2 - 16), v > 0 ? 6 : 2);
        const totalW = data.length * barW + (data.length - 1) * barGap;
        const startX = (w - totalW) / 2;
        const x = startX + i * (barW + barGap);
        const y = h - padY - barH;
        const dayLabel = d.label.split(' ')[0]?.slice(0, 1).toUpperCase() || '?';
        const colorIdx = i % BAR_COLORS.length;

        return (
          <g key={d.date}>
            <rect
              x={x}
              y={y}
              width={barW}
              height={barH}
              rx={barW / 2}
              fill={`url(#${id}-grad-${colorIdx})`}
            />
            <text
              x={x + barW / 2}
              y={h - 5}
              textAnchor="middle"
              fill="rgba(255,255,255,0.28)"
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
