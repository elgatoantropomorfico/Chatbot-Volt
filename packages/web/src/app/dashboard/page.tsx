'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import {
  MessageSquare, Users, Clock, TrendingUp, ShoppingCart, Phone, Bot,
  AlertTriangle, Info, Settings, ArrowRight, LayoutGrid, Calendar,
  Activity, Zap, BarChart3, Check,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { SuperAdminPanel } from '@/components/superadmin/SuperAdminPanel';
import layoutStyles from './layout.module.css';
import styles from './page.module.css';

// ════════════════════════════════════════════
// Types & widget config
// ════════════════════════════════════════════

interface TrendDay {
  date: string;
  label: string;
  conversations: number;
  messages: number;
  leads: number;
}

interface DashboardStats {
  conversations: { total: number; active: number; pendingHuman: number };
  leads: { total: number; newToday: number; newThisWeek: number };
  messages: { total: number; todayCount: number; avgResponseTime: number };
  sales?: { total: number; todayRevenue: number; pendingOrders: number };
  booking?: { todayAppointments: number; confirmed: number; pendingPayment: number; weekRevenue: number };
  trends?: TrendDay[];
  leadStages?: { stage: string; count: number }[];
  modules?: { sales: boolean; booking: boolean };
}

type WidgetId =
  | 'activity-chart'
  | 'conversations-chart'
  | 'leads-funnel'
  | 'actions'
  | 'response-time'
  | 'booking-module'
  | 'sales-module';

const WIDGET_META: Record<WidgetId, { label: string; requires?: 'sales' | 'booking' }> = {
  'activity-chart': { label: 'Actividad de mensajes' },
  'conversations-chart': { label: 'Conversaciones nuevas' },
  'leads-funnel': { label: 'Embudo de leads' },
  'actions': { label: 'Tareas pendientes' },
  'response-time': { label: 'Tiempo de respuesta' },
  'booking-module': { label: 'Turnera', requires: 'booking' },
  'sales-module': { label: 'Ventas', requires: 'sales' },
};

const DEFAULT_WIDGETS: WidgetId[] = [
  'activity-chart',
  'conversations-chart',
  'leads-funnel',
  'actions',
  'response-time',
  'booking-module',
  'sales-module',
];

const STAGE_COLORS: Record<string, string> = {
  nuevo: '#34d399',
  contactado: '#60a5fa',
  interesado: '#fbbf24',
  venta: '#a78bfa',
  perdido: '#6b7280',
};

const STAGE_LABELS: Record<string, string> = {
  nuevo: 'Nuevo',
  contactado: 'Contactado',
  interesado: 'Interesado',
  venta: 'Venta',
  perdido: 'Perdido',
};

// ════════════════════════════════════════════
// Chart helpers (pure SVG)
// ════════════════════════════════════════════

function buildAreaPath(values: number[], w: number, h: number, pad = 8): string {
  if (!values.length) return '';
  const max = Math.max(...values, 1);
  const step = (w - pad * 2) / Math.max(values.length - 1, 1);
  const pts = values.map((v, i) => {
    const x = pad + i * step;
    const y = h - pad - (v / max) * (h - pad * 2);
    return [x, y] as const;
  });
  const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ');
  const area = `${line} L${pts[pts.length - 1][0]},${h - pad} L${pts[0][0]},${h - pad} Z`;
  return area;
}

function buildLinePath(values: number[], w: number, h: number, pad = 8): string {
  if (!values.length) return '';
  const max = Math.max(...values, 1);
  const step = (w - pad * 2) / Math.max(values.length - 1, 1);
  return values
    .map((v, i) => {
      const x = pad + i * step;
      const y = h - pad - (v / max) * (h - pad * 2);
      return `${i === 0 ? 'M' : 'L'}${x},${y}`;
    })
    .join(' ');
}

function AreaChart({ data, color, gradientId }: { data: number[]; color: string; gradientId: string }) {
  const w = 400;
  const h = 160;
  const area = buildAreaPath(data, w, h);
  const line = buildLinePath(data, w, h);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={styles.chartSvg} preserveAspectRatio="none">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((pct) => (
        <line
          key={pct}
          x1="8"
          x2={w - 8}
          y1={h * pct}
          y2={h * pct}
          stroke="rgba(255,255,255,0.04)"
          strokeWidth="1"
        />
      ))}
      {area && <path d={area} fill={`url(#${gradientId})`} />}
      {line && <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
      {data.map((v, i) => {
        const max = Math.max(...data, 1);
        const step = (w - 16) / Math.max(data.length - 1, 1);
        const x = 8 + i * step;
        const y = h - 8 - (v / max) * (h - 16);
        return <circle key={i} cx={x} cy={y} r="3.5" fill={color} stroke="#030308" strokeWidth="1.5" />;
      })}
    </svg>
  );
}

function DonutChart({ segments }: { segments: { value: number; color: string }[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  let offset = 0;
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 140 140" className={styles.donutChart}>
      <circle cx="70" cy="70" r={r} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="14" />
      {segments.map((seg, i) => {
        const len = (seg.value / total) * c;
        const dash = `${len} ${c - len}`;
        const el = (
          <circle
            key={i}
            cx="70"
            cy="70"
            r={r}
            fill="none"
            stroke={seg.color}
            strokeWidth="14"
            strokeDasharray={dash}
            strokeDashoffset={-offset}
            strokeLinecap="round"
            transform="rotate(-90 70 70)"
            style={{ filter: `drop-shadow(0 0 6px ${seg.color}55)` }}
          />
        );
        offset += len;
        return el;
      })}
      <text x="70" y="66" textAnchor="middle" fill="var(--color-text)" fontSize="22" fontWeight="800">
        {total}
      </text>
      <text x="70" y="82" textAnchor="middle" fill="var(--color-text-muted)" fontSize="9" fontWeight="600">
        LEADS
      </text>
    </svg>
  );
}

// ════════════════════════════════════════════
// TENANT DASHBOARD
// ════════════════════════════════════════════

function TenantDashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [actions, setActions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [visibleWidgets, setVisibleWidgets] = useState<WidgetId[]>(DEFAULT_WIDGETS);

  const storageKey = `volt-dashboard-widgets-${user?.tenantId || 'default'}`;

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) setVisibleWidgets(JSON.parse(saved));
    } catch { /* ignore */ }
  }, [storageKey]);

  const saveWidgets = useCallback((widgets: WidgetId[]) => {
    setVisibleWidgets(widgets);
    try { localStorage.setItem(storageKey, JSON.stringify(widgets)); } catch { /* ignore */ }
  }, [storageKey]);

  const toggleWidget = (id: WidgetId) => {
    const next = visibleWidgets.includes(id)
      ? visibleWidgets.filter((w) => w !== id)
      : [...visibleWidgets, id];
    saveWidgets(next);
  };

  useEffect(() => {
    (async () => {
      try {
        const [statsData, actionsData] = await Promise.all([
          api.getDashboardStats(),
          api.getDashboardActions().catch(() => ({ actions: [] })),
        ]);
        setStats(statsData);
        setActions(actionsData.actions);
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    })();
  }, []);

  const availableWidgets = useMemo(() => {
    return DEFAULT_WIDGETS.filter((id) => {
      const meta = WIDGET_META[id];
      if (meta.requires === 'sales') return stats?.modules?.sales;
      if (meta.requires === 'booking') return stats?.modules?.booking;
      return true;
    });
  }, [stats?.modules]);

  const isVisible = (id: WidgetId) => visibleWidgets.includes(id);

  const actionStyle = (type: string) => {
    switch (type) {
      case 'urgent': return { bg: 'rgba(251, 113, 133, 0.08)', border: 'rgba(251, 113, 133, 0.2)', color: '#fb7185' };
      case 'warning': return { bg: 'rgba(251, 191, 36, 0.08)', border: 'rgba(251, 191, 36, 0.2)', color: '#fbbf24' };
      case 'config': return { bg: 'rgba(139, 92, 246, 0.08)', border: 'rgba(139, 92, 246, 0.2)', color: '#8b5cf6' };
      default: return { bg: 'rgba(6, 182, 212, 0.08)', border: 'rgba(6, 182, 212, 0.2)', color: '#06b6d4' };
    }
  };

  const actionIcon = (type: string) => {
    switch (type) {
      case 'urgent': return <AlertTriangle size={16} />;
      case 'warning': return <Clock size={16} />;
      case 'config': return <Settings size={16} />;
      default: return <Info size={16} />;
    }
  };

  const formatResponse = (sec: number) => {
    if (!sec) return '—';
    if (sec < 60) return `${Math.round(sec)}s`;
    return `${Math.round(sec / 60)}min`;
  };

  const trends = stats?.trends || [];
  const messageTrend = trends.map((d) => d.messages);
  const convTrend = trends.map((d) => d.conversations);
  const leadStages = stats?.leadStages || [];
  const maxStage = Math.max(...leadStages.map((s) => s.count), 1);

  if (loading) {
    return (
      <div className={styles.shell}>
        <div className={layoutStyles.pageHeader}>
          <h1>Dashboard</h1>
          <p>Cargando métricas...</p>
        </div>
        <div className={styles.loadingGrid}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className={styles.skeleton} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.shell}>
      <div className={styles.hero}>
        <div className={styles.heroLeft}>
          <h1>Centro de comando</h1>
          <p>
            {user?.tenant?.name || 'Tu negocio'} · {new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <div className={styles.heroMeta}>
          <span className={styles.livePill}>
            <span className={styles.liveDot} />
            En vivo
          </span>
          <button
            type="button"
            className={`${styles.editBtn} ${editMode ? styles.editBtnActive : ''}`}
            onClick={() => setEditMode(!editMode)}
          >
            <LayoutGrid size={14} />
            {editMode ? 'Listo' : 'Personalizar'}
          </button>
        </div>
      </div>

      {editMode && (
        <div className={styles.widgetEditor}>
          <div className={styles.widgetEditorTitle}>
            <BarChart3 size={14} />
            Widgets visibles
          </div>
          <div className={styles.widgetToggles}>
            {availableWidgets.map((id) => (
              <button
                key={id}
                type="button"
                className={`${styles.widgetToggle} ${isVisible(id) ? styles.widgetToggleOn : ''}`}
                onClick={() => toggleWidget(id)}
              >
                {isVisible(id) && <Check size={12} />}
                {WIDGET_META[id].label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* KPI strip */}
      <div className={styles.kpiStrip}>
        <div className={styles.kpiCard} style={{ '--kpi-accent': '#9b7bf7' } as React.CSSProperties}>
          <div className={styles.kpiLabel}><MessageSquare size={11} /> Activas</div>
          <div className={styles.kpiValue}>{stats?.conversations.active ?? 0}</div>
          <div className={styles.kpiSub}>{stats?.conversations.total ?? 0} total</div>
        </div>
        <div className={styles.kpiCard} style={{ '--kpi-accent': '#34d399' } as React.CSSProperties}>
          <div className={styles.kpiLabel}><Users size={11} /> Leads hoy</div>
          <div className={styles.kpiValue}>{stats?.leads.newToday ?? 0}</div>
          <div className={styles.kpiSub}>{stats?.leads.newThisWeek ?? 0} esta semana</div>
        </div>
        <div className={styles.kpiCard} style={{ '--kpi-accent': '#fbbf24' } as React.CSSProperties}>
          <div className={styles.kpiLabel}><Phone size={11} /> Humana</div>
          <div className={styles.kpiValue}>{stats?.conversations.pendingHuman ?? 0}</div>
          <div className={styles.kpiSub}>esperando agente</div>
        </div>
        <div className={styles.kpiCard} style={{ '--kpi-accent': '#06b6d4' } as React.CSSProperties}>
          <div className={styles.kpiLabel}><Bot size={11} /> Msgs hoy</div>
          <div className={styles.kpiValue}>{stats?.messages.todayCount ?? 0}</div>
          <div className={styles.kpiSub}>{stats?.messages.total ?? 0} total</div>
        </div>
        {stats?.modules?.sales && stats.sales && (
          <div className={styles.kpiCard} style={{ '--kpi-accent': '#10b981' } as React.CSSProperties}>
            <div className={styles.kpiLabel}><ShoppingCart size={11} /> Ventas hoy</div>
            <div className={styles.kpiValue}>${(stats.sales.todayRevenue || 0).toLocaleString('es-AR')}</div>
            <div className={styles.kpiSub}>{stats.sales.pendingOrders} pendientes</div>
          </div>
        )}
        {stats?.modules?.booking && stats.booking && (
          <div className={styles.kpiCard} style={{ '--kpi-accent': '#a78bfa' } as React.CSSProperties}>
            <div className={styles.kpiLabel}><Calendar size={11} /> Turnos hoy</div>
            <div className={styles.kpiValue}>{stats.booking.todayAppointments}</div>
            <div className={styles.kpiSub}>{stats.booking.confirmed} confirmados</div>
          </div>
        )}
      </div>

      <div className={styles.grid}>
        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {isVisible('activity-chart') && trends.length > 0 && (
            <div className={styles.widget} style={{ '--widget-glow': 'rgba(6, 182, 212, 0.12)' } as React.CSSProperties}>
              <div className={styles.widgetHeader}>
                <span className={styles.widgetTitle}><Activity size={13} /> Actividad de mensajes</span>
                <span className={styles.widgetBadge}>7 días</span>
              </div>
              <div className={styles.chartWrap}>
                <AreaChart data={messageTrend} color="#06b6d4" gradientId="msgGrad" />
              </div>
              <div className={styles.chartLegend}>
                {trends.map((d) => (
                  <span key={d.date} className={styles.legendItem}>
                    <span className={styles.legendDot} style={{ background: '#06b6d4' }} />
                    {d.label}: {d.messages}
                  </span>
                ))}
              </div>
            </div>
          )}

          {isVisible('conversations-chart') && trends.length > 0 && (
            <div className={styles.widget} style={{ '--widget-glow': 'rgba(155, 123, 247, 0.12)' } as React.CSSProperties}>
              <div className={styles.widgetHeader}>
                <span className={styles.widgetTitle}><MessageSquare size={13} /> Conversaciones nuevas</span>
                <span className={styles.widgetBadge}>7 días</span>
              </div>
              <div className={styles.chartWrap}>
                <AreaChart data={convTrend} color="#9b7bf7" gradientId="convGrad" />
              </div>
            </div>
          )}
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {isVisible('leads-funnel') && leadStages.length > 0 && (
            <div className={styles.widget} style={{ '--widget-glow': 'rgba(52, 211, 153, 0.1)' } as React.CSSProperties}>
              <div className={styles.widgetHeader}>
                <span className={styles.widgetTitle}><Users size={13} /> Embudo de leads</span>
              </div>
              <div className={styles.donutWrap}>
                <DonutChart
                  segments={leadStages.map((s) => ({
                    value: s.count,
                    color: STAGE_COLORS[s.stage] || '#6b7280',
                  }))}
                />
                <div className={styles.donutLegend}>
                  {leadStages.map((s) => (
                    <div key={s.stage} className={styles.donutLegendItem}>
                      <span className={styles.donutLegendLabel}>
                        <span className={styles.legendDot} style={{ background: STAGE_COLORS[s.stage] || '#6b7280' }} />
                        {STAGE_LABELS[s.stage] || s.stage}
                      </span>
                      <span className={styles.donutLegendValue}>{s.count}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ marginTop: 12 }}>
                {leadStages.map((s) => (
                  <div key={s.stage} className={styles.barRow}>
                    <span className={styles.barLabel}>{STAGE_LABELS[s.stage] || s.stage}</span>
                    <div className={styles.barTrack}>
                      <div
                        className={styles.barFill}
                        style={{
                          width: `${(s.count / maxStage) * 100}%`,
                          '--bar-color': STAGE_COLORS[s.stage] || '#6b7280',
                        } as React.CSSProperties}
                      />
                    </div>
                    <span className={styles.barValue}>{s.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {isVisible('response-time') && (
            <div className={styles.widget} style={{ '--widget-glow': 'rgba(155, 123, 247, 0.1)' } as React.CSSProperties}>
              <div className={styles.widgetHeader}>
                <span className={styles.widgetTitle}><Zap size={13} /> Tiempo de respuesta</span>
              </div>
              <div className={styles.metricHero}>
                <span className={styles.metricHeroValue}>
                  {formatResponse(stats?.messages.avgResponseTime || 0)}
                </span>
                <span className={styles.metricHeroUnit}>promedio bot</span>
              </div>
              <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: 0, position: 'relative', zIndex: 1 }}>
                Calculado sobre la última semana · in → out del asistente
              </p>
              {trends.length > 0 && (
                <div className={styles.sparkline}>
                  <AreaChart data={trends.map((d) => d.leads)} color="#d48de8" gradientId="leadSpark" />
                </div>
              )}
            </div>
          )}

          {isVisible('actions') && (
            <div className={styles.widget} style={{ '--widget-glow': 'rgba(251, 191, 36, 0.08)' } as React.CSSProperties}>
              <div className={styles.widgetHeader}>
                <span className={styles.widgetTitle}><AlertTriangle size={13} /> Tareas pendientes</span>
                {actions.length > 0 && <span className={styles.widgetBadge}>{actions.length}</span>}
              </div>
              {actions.length === 0 ? (
                <div className={styles.emptyState}>Todo al día. No hay tareas urgentes.</div>
              ) : (
                <div className={styles.actionsList}>
                  {actions.map((action: any) => {
                    const c = actionStyle(action.type);
                    return (
                      <div
                        key={action.id}
                        className={styles.actionCard}
                        style={{ '--action-bg': c.bg, '--action-border': c.border, '--action-color': c.color } as React.CSSProperties}
                        onClick={() => router.push(action.link)}
                      >
                        <div className={styles.actionIcon}>{actionIcon(action.type)}</div>
                        <div className={styles.actionBody}>
                          <div className={styles.actionTitle}>{action.title}</div>
                          <div className={styles.actionDesc}>{action.description}</div>
                        </div>
                        <ArrowRight size={14} className={styles.actionArrow} />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Module widgets */}
      {(isVisible('booking-module') || isVisible('sales-module')) && (
        <div className={styles.bottomGrid}>
          {isVisible('booking-module') && stats?.booking && (
            <div className={styles.moduleCard}>
              <div className={styles.moduleCardHeader}>
                <Calendar size={13} /> Turnera
              </div>
              <div className={styles.moduleStats}>
                <div className={styles.moduleStat}>
                  <div className={styles.moduleStatValue}>{stats.booking.confirmed}</div>
                  <div className={styles.moduleStatLabel}>Confirmados</div>
                </div>
                <div className={styles.moduleStat}>
                  <div className={styles.moduleStatValue}>{stats.booking.pendingPayment}</div>
                  <div className={styles.moduleStatLabel}>Pend. pago</div>
                </div>
                <div className={styles.moduleStat}>
                  <div className={styles.moduleStatValue}>{stats.booking.todayAppointments}</div>
                  <div className={styles.moduleStatLabel}>Hoy</div>
                </div>
                <div className={styles.moduleStat}>
                  <div className={styles.moduleStatValue}>${stats.booking.weekRevenue.toLocaleString('es-AR')}</div>
                  <div className={styles.moduleStatLabel}>Semana</div>
                </div>
              </div>
            </div>
          )}
          {isVisible('sales-module') && stats?.sales && (
            <div className={styles.moduleCard}>
              <div className={styles.moduleCardHeader}>
                <ShoppingCart size={13} /> WooCommerce
              </div>
              <div className={styles.moduleStats}>
                <div className={styles.moduleStat}>
                  <div className={styles.moduleStatValue}>{stats.sales.total}</div>
                  <div className={styles.moduleStatLabel}>Órdenes</div>
                </div>
                <div className={styles.moduleStat}>
                  <div className={styles.moduleStatValue}>{stats.sales.pendingOrders}</div>
                  <div className={styles.moduleStatLabel}>Pendientes</div>
                </div>
                <div className={styles.moduleStat} style={{ gridColumn: '1 / -1' }}>
                  <div className={styles.moduleStatValue}>${(stats.sales.todayRevenue || 0).toLocaleString('es-AR')}</div>
                  <div className={styles.moduleStatLabel}>Ingresos hoy</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SuperAdminFallback() {
  return (
    <div>
      <h1 style={{ fontSize: '26px', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: '24px' }}>Tenants</h1>
      <div style={{ textAlign: 'center', padding: '60px', color: 'var(--color-text-muted)' }}>Cargando...</div>
    </div>
  );
}

export default function DashboardPage() {
  const { isSuperAdmin } = useAuth();
  return isSuperAdmin ? (
    <Suspense fallback={<SuperAdminFallback />}>
      <SuperAdminPanel />
    </Suspense>
  ) : (
    <TenantDashboard />
  );
}
