'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import {
  Users, ShoppingCart, Bot, Bell, Search,
  AlertTriangle, Info, Settings, ArrowRight, LayoutGrid, Calendar,
  Zap, BarChart3, Check, Inbox, Sparkles, TrendingUp,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { SuperAdminPanel } from '@/components/superadmin/SuperAdminPanel';
import {
  GlowingBarChart, HeroOrb, MiniSparkline, useDelta, pct, type TrendDay,
} from '@/components/dashboard/DashboardVisuals';
import styles from './page.module.css';

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

type WidgetId = 'leads-funnel' | 'response-time' | 'booking-module' | 'sales-module';

const WIDGET_META: Record<WidgetId, { label: string; requires?: 'sales' | 'booking' }> = {
  'leads-funnel': { label: 'Embudo leads' },
  'response-time': { label: 'Tiempo respuesta' },
  'booking-module': { label: 'Turnera', requires: 'booking' },
  'sales-module': { label: 'Ventas', requires: 'sales' },
};

const DEFAULT_WIDGETS: WidgetId[] = ['leads-funnel', 'response-time', 'booking-module', 'sales-module'];

const STAGE_COLORS: Record<string, string> = {
  nuevo: '#34d399', contactado: '#60a5fa', interesado: '#fbbf24', venta: '#a78bfa', perdido: '#6b7280',
};

const STAGE_LABELS: Record<string, string> = {
  nuevo: 'Nuevo', contactado: 'Contactado', interesado: 'Interesado', venta: 'Venta', perdido: 'Perdido',
};

function TenantDashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [actions, setActions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [chartMetric, setChartMetric] = useState<'messages' | 'conversations' | 'leads'>('messages');
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

  const trends = stats?.trends || [];
  const msgTrend = trends.map((d) => d.messages);
  const convTrend = trends.map((d) => d.conversations);
  const leadTrend = trends.map((d) => d.leads);
  const msgDelta = useDelta(msgTrend);
  const convDelta = useDelta(convTrend);
  const leadDelta = useDelta(leadTrend);

  const chartColors: Record<string, [string, string]> = {
    messages: ['#22d3ee', '#0891b2'],
    conversations: ['#a78bfa', '#7c3aed'],
    leads: ['#e879f9', '#c026d3'],
  };

  const chartTotals = useMemo(() => ({
    messages: msgTrend.reduce((a, b) => a + b, 0),
    conversations: convTrend.reduce((a, b) => a + b, 0),
    leads: leadTrend.reduce((a, b) => a + b, 0),
  }), [msgTrend, convTrend, leadTrend]);

  const pipelines = useMemo(() => {
    if (!stats) return [];
    const items = [
      {
        id: 'inbox',
        name: 'Inbox WhatsApp',
        meta: `${stats.conversations.pendingHuman} requieren agente · ${stats.conversations.active} activas`,
        progress: pct(stats.conversations.active, stats.conversations.total || 1),
        color: '#22d3ee',
        bg: 'rgba(34, 211, 238, 0.1)',
        icon: <Inbox size={20} />,
        href: '/dashboard/inbox',
      },
      {
        id: 'leads',
        name: 'Pipeline de leads',
        meta: `${stats.leads.newToday} nuevos hoy · ${stats.leads.total} total`,
        progress: pct(stats.leads.newThisWeek, stats.leads.total || 1),
        color: '#a78bfa',
        bg: 'rgba(167, 139, 250, 0.1)',
        icon: <Users size={20} />,
        href: '/dashboard/leads',
      },
    ];
    if (stats.modules?.booking && stats.booking) {
      items.push({
        id: 'booking',
        name: 'Turnera',
        meta: `${stats.booking.todayAppointments} hoy · ${stats.booking.pendingPayment} pend. pago`,
        progress: pct(stats.booking.confirmed, stats.booking.confirmed + stats.booking.pendingPayment || 1),
        color: '#e879f9',
        bg: 'rgba(232, 121, 249, 0.1)',
        icon: <Calendar size={20} />,
        href: '/dashboard/turnos',
      });
    }
    if (stats.modules?.sales && stats.sales) {
      const done = stats.sales.total - stats.sales.pendingOrders;
      items.push({
        id: 'sales',
        name: 'Ventas WooCommerce',
        meta: `$${(stats.sales.todayRevenue || 0).toLocaleString('es-AR')} hoy · ${stats.sales.pendingOrders} pend.`,
        progress: pct(done, stats.sales.total || 1),
        color: '#34d399',
        bg: 'rgba(52, 211, 153, 0.1)',
        icon: <ShoppingCart size={20} />,
        href: '/dashboard/sales',
      });
    }
    return items;
  }, [stats]);

  const actionStyle = (type: string) => {
    switch (type) {
      case 'urgent': return { bg: 'rgba(251, 113, 133, 0.12)', color: '#fb7185' };
      case 'warning': return { bg: 'rgba(251, 191, 36, 0.12)', color: '#fbbf24' };
      case 'config': return { bg: 'rgba(139, 92, 246, 0.12)', color: '#8b5cf6' };
      default: return { bg: 'rgba(6, 182, 212, 0.12)', color: '#06b6d4' };
    }
  };

  const actionIcon = (type: string) => {
    switch (type) {
      case 'urgent': return <AlertTriangle size={15} />;
      case 'warning': return <Bell size={15} />;
      case 'config': return <Settings size={15} />;
      default: return <Info size={15} />;
    }
  };

  const formatResponse = (sec: number) => {
    if (!sec) return '—';
    if (sec < 60) return `${Math.round(sec)}s`;
    return `${Math.round(sec / 60)}m`;
  };

  const isVisible = (id: WidgetId) => visibleWidgets.includes(id);
  const availableWidgets = DEFAULT_WIDGETS.filter((id) => {
    const m = WIDGET_META[id];
    if (m.requires === 'sales') return stats?.modules?.sales;
    if (m.requires === 'booking') return stats?.modules?.booking;
    return true;
  });

  const tenantName = user?.tenant?.name || 'Tu negocio';
  const todayMsgs = stats?.messages.todayCount ?? 0;

  if (loading) {
    return (
      <div className={styles.shell}>
        <div className={styles.loadingHero} />
        <div className={styles.loadingGrid}>
          <div className={styles.loadingPanel} />
          <div className={styles.loadingPanel} />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.shell}>
      {/* Top bar */}
      <div className={styles.topBar}>
        <label className={styles.searchPill}>
          <Search size={16} />
          <input type="text" placeholder="Buscar conversaciones, leads, turnos..." />
        </label>
        <div className={styles.topBarRight}>
          <span className={styles.xpPill}>
            <Sparkles size={14} />
            <strong>+{todayMsgs}</strong> msgs hoy
          </span>
          <button
            type="button"
            className={`${styles.iconBtn} ${editMode ? styles.iconBtnActive : ''}`}
            onClick={() => setEditMode(!editMode)}
            title="Personalizar widgets"
          >
            <LayoutGrid size={16} />
          </button>
          <button type="button" className={styles.iconBtn} onClick={() => router.push('/dashboard/inbox')} title="Notificaciones">
            <Bell size={16} />
            {actions.length > 0 && <span className={styles.notifDot} />}
          </button>
          <div className={styles.userChip}>
            <div className={styles.userAvatar}>{user?.email?.[0]?.toUpperCase()}</div>
            <span>{user?.email}</span>
          </div>
        </div>
      </div>

      {editMode && (
        <div className={styles.widgetEditor}>
          <div className={styles.widgetEditorTitle}><BarChart3 size={14} /> Widgets del panel</div>
          <div className={styles.widgetToggles}>
            {availableWidgets.map((id) => (
              <button
                key={id}
                type="button"
                className={`${styles.widgetToggle} ${isVisible(id) ? styles.widgetToggleOn : ''}`}
                onClick={() => {
                  const next = isVisible(id) ? visibleWidgets.filter((w) => w !== id) : [...visibleWidgets, id];
                  saveWidgets(next);
                }}
              >
                {isVisible(id) && <Check size={12} />}
                {WIDGET_META[id].label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Hero stage */}
      <section className={styles.heroStage}>
        <div className={styles.heroVisual}>
          <HeroOrb />
        </div>

        <div className={styles.heroContent}>
          <div className={styles.heroEyebrow}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#34d399', boxShadow: '0 0 8px #34d399' }} />
            Operación en vivo
          </div>
          <h1 className={styles.heroTitle}>
            Hola, <em>{tenantName.split(' ')[0]}</em>
          </h1>
          <p className={styles.heroSub}>
            {new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}
            {' · '}{stats?.conversations.active ?? 0} conversaciones activas
          </p>
        </div>

        <div className={styles.floatingStats}>
          <div className={styles.floatCard} style={{ '--card-glow': 'rgba(34,211,238,0.2)', '--bar-from': '#22d3ee', '--bar-to': '#0891b2' } as React.CSSProperties}>
            <div className={styles.floatCardHead}>
              <span className={styles.floatCardLabel}>Conversaciones</span>
              <span className={`${styles.floatCardDelta} ${convDelta < 0 ? styles.floatCardDeltaNeg : ''}`}>
                {convDelta >= 0 ? '+' : ''}{convDelta}%
              </span>
            </div>
            <div className={styles.floatCardValue}>
              {stats?.conversations.active ?? 0}<small>/{stats?.conversations.total ?? 0}</small>
            </div>
            <div className={styles.progressTrack}>
              <div className={styles.progressFill} style={{ width: `${pct(stats?.conversations.active ?? 0, stats?.conversations.total ?? 1)}%` }} />
            </div>
          </div>

          <div className={styles.floatCard} style={{ '--card-glow': 'rgba(167,139,250,0.2)', '--bar-from': '#a78bfa', '--bar-to': '#7c3aed' } as React.CSSProperties}>
            <div className={styles.floatCardHead}>
              <span className={styles.floatCardLabel}>Leads</span>
              <span className={`${styles.floatCardDelta} ${leadDelta < 0 ? styles.floatCardDeltaNeg : ''}`}>
                {leadDelta >= 0 ? '+' : ''}{leadDelta}%
              </span>
            </div>
            <div className={styles.floatCardValue}>
              {stats?.leads.newToday ?? 0}<small> hoy</small>
            </div>
            <div className={styles.progressTrack}>
              <div className={styles.progressFill} style={{ width: `${pct(stats?.leads.newThisWeek ?? 0, stats?.leads.total ?? 1)}%` }} />
            </div>
          </div>

          <div className={styles.floatCard} style={{ '--card-glow': 'rgba(232,121,249,0.2)', '--bar-from': '#e879f9', '--bar-to': '#c026d3' } as React.CSSProperties}>
            <div className={styles.floatCardHead}>
              <span className={styles.floatCardLabel}>Respuesta IA</span>
              <span className={styles.floatCardDelta}>
                <Zap size={10} style={{ display: 'inline', marginRight: 2 }} />
                bot
              </span>
            </div>
            <div className={styles.floatCardValue}>
              {formatResponse(stats?.messages.avgResponseTime || 0)}
            </div>
            <div className={styles.progressTrack}>
              <div
                className={styles.progressFill}
                style={{
                  width: `${Math.min(100, Math.max(8, 100 - (stats?.messages.avgResponseTime || 0) / 3))}%`,
                }}
              />
            </div>
          </div>
        </div>

        <div className={styles.heroAlerts}>
          <div className={styles.heroAlertsHead}>
            <div>
              <h3 className={styles.heroAlertsTitle}>Centro de alertas</h3>
              <p className={styles.heroAlertsSub}>
                {actions.length > 0 ? `${actions.length} acción${actions.length > 1 ? 'es' : ''} pendiente${actions.length > 1 ? 's' : ''}` : 'Todo bajo control'}
              </p>
            </div>
            {actions.length > 0 && (
              <span className={styles.alertBadge}>
                <AlertTriangle size={11} /> {actions.length}
              </span>
            )}
          </div>
          {actions.length === 0 ? (
            <div className={styles.alertOk}>✓ Sin tareas urgentes</div>
          ) : (
            actions.slice(0, 3).map((action: any) => {
              const c = actionStyle(action.type);
              return (
                <div key={action.id} className={styles.alertItem} onClick={() => router.push(action.link)}>
                  <div className={styles.alertIcon} style={{ '--alert-bg': c.bg, '--alert-color': c.color } as React.CSSProperties}>
                    {actionIcon(action.type)}
                  </div>
                  <div className={styles.alertText}>
                    <strong>{action.title}</strong>
                    <span>{action.description}</span>
                  </div>
                  <ArrowRight size={14} style={{ color: c.color, flexShrink: 0 }} />
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Main grid */}
      <div className={styles.mainGrid}>
        <div className={styles.glassPanel}>
          <div className={styles.panelHeader}>
            <div>
              <h2 className={styles.panelTitle}>Actividad semanal</h2>
              <p className={styles.panelSub}>Últimos 7 días de operación</p>
            </div>
            <div className={styles.periodToggle}>
              {(['messages', 'conversations', 'leads'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`${styles.periodBtn} ${chartMetric === m ? styles.periodBtnActive : ''}`}
                  onClick={() => setChartMetric(m)}
                >
                  {m === 'messages' ? 'Mensajes' : m === 'conversations' ? 'Chats' : 'Leads'}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.chartArea}>
            {trends.length > 0 ? (
              <GlowingBarChart
                data={trends}
                metric={chartMetric}
                colors={chartColors[chartMetric]}
                id={`chart-${chartMetric}`}
              />
            ) : (
              <div style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>Sin datos de tendencia aún</div>
            )}
          </div>
          <div className={styles.chartFooter}>
            <div className={styles.chartStat}>
              <div className={styles.chartStatValue}>{chartTotals.messages}</div>
              <div className={styles.chartStatLabel}>Mensajes</div>
            </div>
            <div className={styles.chartStat}>
              <div className={styles.chartStatValue}>{chartTotals.conversations}</div>
              <div className={styles.chartStatLabel}>Conversaciones</div>
            </div>
            <div className={styles.chartStat}>
              <div className={styles.chartStatValue}>{chartTotals.leads}</div>
              <div className={styles.chartStatLabel}>Leads</div>
            </div>
            <div className={styles.chartStat}>
              <div className={styles.chartStatValue}>{stats?.conversations.pendingHuman ?? 0}</div>
              <div className={styles.chartStatLabel}>Humana</div>
            </div>
          </div>
        </div>

        <div className={styles.glassPanel}>
          <div className={styles.panelHeader}>
            <div>
              <h2 className={styles.panelTitle}>Módulos activos</h2>
              <p className={styles.panelSub}>Progreso operativo por canal</p>
            </div>
            <TrendingUp size={18} style={{ color: 'var(--color-primary)', opacity: 0.6 }} />
          </div>
          <div className={styles.pipelineList}>
            {pipelines.map((p) => (
              <div
                key={p.id}
                className={styles.pipelineRow}
                onClick={() => router.push(p.href)}
              >
                <div className={styles.pipelineIcon} style={{ '--pipe-bg': p.bg, '--pipe-color': p.color } as React.CSSProperties}>
                  {p.icon}
                </div>
                <div className={styles.pipelineBody}>
                  <div className={styles.pipelineName}>{p.name}</div>
                  <div className={styles.pipelineMeta}>{p.meta}</div>
                </div>
                <div className={styles.pipelineProgress}>
                  <div className={styles.pipelinePct}>{p.progress}%</div>
                  <div className={styles.pipelineBar}>
                    <div className={styles.pipelineBarFill} style={{ width: `${p.progress}%`, '--pipe-color': p.color } as React.CSSProperties} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Secondary widgets */}
      <div className={styles.secondaryGrid}>
        {isVisible('response-time') && (
          <div className={styles.miniWidget}>
            <div className={styles.miniWidgetHead}>
              <span className={styles.miniWidgetTitle}><Zap size={12} /> Respuesta IA</span>
              <MiniSparkline values={msgTrend} color="#22d3ee" />
            </div>
            <div className={styles.miniWidgetValue}>{formatResponse(stats?.messages.avgResponseTime || 0)}</div>
            <div className={styles.miniWidgetSub}>promedio última semana</div>
          </div>
        )}

        {isVisible('leads-funnel') && (stats?.leadStages?.length ?? 0) > 0 && (
          <div className={styles.miniWidget}>
            <div className={styles.miniWidgetHead}>
              <span className={styles.miniWidgetTitle}><Users size={12} /> Embudo</span>
              <MiniSparkline values={leadTrend} color="#e879f9" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
              {(stats?.leadStages || []).slice(0, 4).map((s) => (
                <div key={s.stage} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: STAGE_COLORS[s.stage] || '#6b7280', flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 11, color: 'var(--color-text-muted)' }}>{STAGE_LABELS[s.stage] || s.stage}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text)' }}>{s.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {isVisible('booking-module') && stats?.booking && (
          <div className={styles.miniWidget}>
            <div className={styles.miniWidgetHead}>
              <span className={styles.miniWidgetTitle}><Calendar size={12} /> Turnera</span>
            </div>
            <div className={styles.miniWidgetValue}>{stats.booking.confirmed}</div>
            <div className={styles.miniWidgetSub}>
              confirmados · ${stats.booking.weekRevenue.toLocaleString('es-AR')} semana
            </div>
          </div>
        )}

        {isVisible('sales-module') && stats?.sales && (
          <div className={styles.miniWidget}>
            <div className={styles.miniWidgetHead}>
              <span className={styles.miniWidgetTitle}><ShoppingCart size={12} /> Ventas</span>
            </div>
            <div className={styles.miniWidgetValue}>${(stats.sales.todayRevenue || 0).toLocaleString('es-AR')}</div>
            <div className={styles.miniWidgetSub}>{stats.sales.pendingOrders} órdenes pendientes</div>
          </div>
        )}

        <div className={styles.miniWidget}>
          <div className={styles.miniWidgetHead}>
            <span className={styles.miniWidgetTitle}><Bot size={12} /> Bot hoy</span>
            <MiniSparkline values={convTrend} color="#a78bfa" />
          </div>
          <div className={styles.miniWidgetValue}>{stats?.messages.todayCount ?? 0}</div>
          <div className={styles.miniWidgetSub}>
            <span className={`${styles.floatCardDelta} ${msgDelta < 0 ? styles.floatCardDeltaNeg : ''}`} style={{ display: 'inline-flex' }}>
              {msgDelta >= 0 ? '+' : ''}{msgDelta}% vs prev.
            </span>
          </div>
        </div>
      </div>
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
