'use client';

import { useMemo } from 'react';

export interface TrendDay {
  date: string;
  label: string;
  conversations: number;
  messages: number;
  leads: number;
}

interface GlowingBarChartProps {
  data: TrendDay[];
  metric: 'messages' | 'conversations' | 'leads';
  colors: [string, string];
  id: string;
}

export function GlowingBarChart({ data, metric, colors, id }: GlowingBarChartProps) {
  const values = data.map((d) => d[metric]);
  const max = Math.max(...values, 1);
  const w = 520;
  const h = 200;
  const padX = 28;
  const padY = 24;
  const barGap = 14;
  const barW = (w - padX * 2 - barGap * (data.length - 1)) / Math.max(data.length, 1);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="dash-bar-svg" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id={`${id}-grad`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={colors[0]} stopOpacity="1" />
          <stop offset="100%" stopColor={colors[1]} stopOpacity="0.15" />
        </linearGradient>
        <filter id={`${id}-glow`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {[0.25, 0.5, 0.75].map((pct) => (
        <line
          key={pct}
          x1={padX}
          x2={w - padX}
          y1={h - padY - (h - padY * 2) * pct}
          y2={h - padY - (h - padY * 2) * pct}
          stroke="rgba(255,255,255,0.035)"
          strokeWidth="1"
          strokeDasharray="4 6"
        />
      ))}

      {data.map((d, i) => {
        const v = d[metric];
        const barH = Math.max((v / max) * (h - padY * 2 - 20), v > 0 ? 8 : 2);
        const x = padX + i * (barW + barGap);
        const y = h - padY - barH;
        const dayLabel = d.label.split(' ')[0]?.slice(0, 1).toUpperCase() || '?';

        return (
          <g key={d.date}>
            <rect
              x={x}
              y={y}
              width={barW}
              height={barH}
              rx={barW / 2}
              ry={barW / 2}
              fill={`url(#${id}-grad)`}
              filter={`url(#${id}-glow)`}
              opacity={0.95}
            />
            <rect
              x={x + 2}
              y={y + 2}
              width={Math.max(barW - 4, 0)}
              height={Math.max(barH - 4, 0)}
              rx={(barW - 4) / 2}
              fill="rgba(255,255,255,0.06)"
              opacity={0.5}
            />
            <text
              x={x + barW / 2}
              y={h - 6}
              textAnchor="middle"
              fill="rgba(255,255,255,0.35)"
              fontSize="11"
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

export function HeroOrb() {
  return (
    <div className="dash-hero-orb" aria-hidden>
      <div className="dash-orb-glow" />
      <svg viewBox="0 0 400 280" className="dash-orb-svg">
        <defs>
          <radialGradient id="orbGrad1" cx="50%" cy="40%" r="60%">
            <stop offset="0%" stopColor="#c4b5fd" stopOpacity="0.9" />
            <stop offset="50%" stopColor="#8b5cf6" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#4c1d95" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="orbGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#e879f9" />
            <stop offset="50%" stopColor="#a78bfa" />
            <stop offset="100%" stopColor="#6366f1" />
          </linearGradient>
          <filter id="orbBlur">
            <feGaussianBlur stdDeviation="18" />
          </filter>
        </defs>
        <ellipse cx="280" cy="120" rx="120" ry="90" fill="url(#orbGrad1)" filter="url(#orbBlur)" opacity="0.7" />
        <path
          d="M 180 60 Q 260 20 320 80 Q 380 140 300 200 Q 200 260 140 180 Q 80 100 180 60 Z"
          fill="url(#orbGrad2)"
          opacity="0.85"
        />
        <ellipse cx="240" cy="130" rx="70" ry="50" fill="rgba(255,255,255,0.08)" />
        <ellipse cx="200" cy="100" rx="30" ry="20" fill="rgba(255,255,255,0.12)" />
      </svg>
    </div>
  );
}

export function MiniSparkline({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(...values, 1);
  const w = 80;
  const h = 28;
  const pts = values.map((v, i) => {
    const x = (i / Math.max(values.length - 1, 1)) * w;
    const y = h - (v / max) * (h - 4) - 2;
    return `${i === 0 ? 'M' : 'L'}${x},${y}`;
  }).join(' ');

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={80} height={28} className="dash-mini-spark">
      <path d={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
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
