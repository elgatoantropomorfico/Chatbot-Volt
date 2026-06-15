'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import {
  CHART_METRIC_META,
  type ChartMetric,
} from '@/components/dashboard/DashboardVisuals';
import styles from './ChartMetricDropdown.module.css';

const ALL_METRICS: ChartMetric[] = ['messages', 'conversations', 'leads'];

interface ChartMetricDropdownProps {
  value: ChartMetric[];
  onChange: (metrics: ChartMetric[]) => void;
}

export function ChartMetricDropdown({ value, onChange }: ChartMetricDropdownProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const toggle = (metric: ChartMetric) => {
    if (value.includes(metric)) {
      if (value.length === 1) return;
      onChange(value.filter((m) => m !== metric));
    } else {
      onChange([...value, metric]);
    }
  };

  const summary =
    value.length === ALL_METRICS.length
      ? 'Todos'
      : value.map((m) => CHART_METRIC_META[m].label).join(', ');

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span className={styles.triggerLabel}>Ver en el gráfico</span>
        <ChevronDown size={14} className={open ? styles.chevronOpen : ''} />
      </button>

      {open && (
        <div className={styles.menu}>
          <p className={styles.menuHint}>Elegí qué series superponer</p>
          {ALL_METRICS.map((metric) => {
            const active = value.includes(metric);
            const [color] = CHART_METRIC_META[metric].colors;
            return (
              <button
                key={metric}
                type="button"
                className={`${styles.option} ${active ? styles.optionActive : ''}`}
                onClick={() => toggle(metric)}
              >
                <span className={styles.optionLeft}>
                  <span className={styles.dot} style={{ background: color }} />
                  {CHART_METRIC_META[metric].label}
                </span>
                {active && <Check size={13} />}
              </button>
            );
          })}
        </div>
      )}

      <span className={styles.srOnly}>{summary}</span>
    </div>
  );
}
