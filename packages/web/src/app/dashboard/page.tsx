'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import {
  Users, ShoppingCart, Bot, Bell, AlertTriangle, Info, Settings, ArrowRight,
  Calendar, Zap, Inbox, TrendingUp, Phone,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { SuperAdminPanel } from '@/components/superadmin/SuperAdminPanel';
import { DashboardSearch } from '@/components/dashboard/DashboardSearch';
import { ChartMetricDropdown } from '@/components/dashboard/ChartMetricDropdown';
import {
  WeeklyActivityChart, MiniSparkline, useDelta, pct, type TrendDay, type ChartMetric,
} from '@/components/dashboard/DashboardVisuals';
import { getTenantDisplayName } from '@/lib/tenant';
import styles from './page.module.css';

interface TenantModules {
  sales: boolean;
  booking: boolean;
  zoho: boolean;
  pilot: boolean;
}

interface DashboardStats {
  conversations: { total: number; active: number; pendingHuman: number };
  leads: { total: number; newToday: number; newThisWeek: number };
  messages: { total: number; todayCount: number; avgResponseTime: number };
  sales?: { total: number; todayRevenue: number; pendingOrders: number };
  booking?: { todayAppointments: number; confirmed: number; pendingPayment: number; weekRevenue: number };
  trends?: TrendDay[];
  leadStages?: { stage: string; count: number }[];
  modules?: TenantModules;
}

function TenantDashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [actions, setActions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartMetrics, setChartMetrics] = useState<ChartMetric[]>(['messages', 'conversations', 'leads']);

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
        icon: <Inbox size={18} />,
        href: '/dashboard/inbox',
      },
      {
        id: 'leads',
        name: 'Pipeline de clientes',
        meta: `${stats.leads.newToday} nuevos hoy · ${stats.leads.total} total`,
        progress: pct(stats.leads.newThisWeek, stats.leads.total || 1),
        color: '#a78bfa',
        bg: 'rgba(167, 139, 250, 0.1)',
        icon: <Users size={18} />,
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
        icon: <Calendar size={18} />,
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
        icon: <ShoppingCart size={18} />,
        href: '/dashboard/sales',
      });
    }
    return items;
  }, [stats]);

  const thirdKpi = useMemo(() => {
    if (!stats) return null;
    if (stats.modules?.booking && stats.booking) {
      return {
        label: 'Turnos hoy',
        value: String(stats.booking.todayAppointments),
        sub: `${stats.booking.pendingPayment} pend. pago`,
        delta: `+${stats.booking.confirmed} conf.`,
        progress: pct(stats.booking.confirmed, stats.booking.confirmed + stats.booking.pendingPayment || 1),
        from: '#a78bfa', to: '#22d3ee',
      };
    }
    if (stats.modules?.sales && stats.sales) {
      return {
        label: 'Ventas',
        value: `$${(stats.sales.todayRevenue || 0).toLocaleString('es-AR')}`,
        sub: `${stats.sales.pendingOrders} pendientes`,
        delta: `${stats.sales.total} total`,
        progress: pct(stats.sales.total - stats.sales.pendingOrders, stats.sales.total || 1),
        from: '#34d399', to: '#059669',
      };
    }
    return {
      label: 'Bot hoy',
      value: String(stats.messages.todayCount ?? 0),
      sub: 'mensajes procesados',
      delta: `${msgDelta >= 0 ? '+' : ''}${msgDelta}%`,
      progress: Math.min(100, Math.max(8, stats.messages.todayCount * 4)),
      from: '#e879f9', to: '#a78bfa',
    };
  }, [stats, msgDelta]);

  const sideCards = useMemo(() => {
    if (!stats) return [];
    const cards: Array<{
      id: string;
      label: string;
      value: string;
      sub?: string;
      spark?: number[];
      sparkColor?: string;
      urgent?: boolean;
      href?: string;
    }> = [
      {
        id: 'human-queue',
        label: 'Cola humana',
        value: String(stats.conversations.pendingHuman),
        sub: 'conversaciones esperando',
        urgent: stats.conversations.pendingHuman > 0,
        href: '/dashboard/inbox',
      },
      {
        id: 'response-time',
        label: 'Respuesta IA',
        value: formatResponse(stats.messages.avgResponseTime || 0),
        spark: msgTrend,
        sparkColor: '#22d3ee',
      },
    ];

    if (stats.modules?.sales && stats.sales) {
      cards.push({
        id: 'sales-side',
        label: 'Ventas hoy',
        value: `$${(stats.sales.todayRevenue || 0).toLocaleString('es-AR')}`,
        sub: `${stats.sales.pendingOrders} pendientes`,
        spark: leadTrend,
        sparkColor: '#34d399',
        href: '/dashboard/sales',
      });
    } else {
      cards.push({
        id: 'bot-side',
        label: 'Bot hoy',
        value: String(stats.messages.todayCount ?? 0),
        sub: 'mensajes',
        spark: convTrend,
        sparkColor: '#a78bfa',
      });
    }

    return cards;
  }, [stats, msgTrend, convTrend, leadTrend]);

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

  const tenantName = getTenantDisplayName(user?.tenant) || 'Tu negocio';

  const statusPill = useMemo(() => {
    if (!stats) return null;
    if (stats.conversations.pendingHuman > 0) {
      return { text: `${stats.conversations.pendingHuman} requieren agente`, urgent: true, icon: <Phone size={13} /> };
    }
    if (stats.modules?.booking && stats.booking && stats.booking.pendingPayment > 0) {
      return { text: `${stats.booking.pendingPayment} turnos pend. pago`, urgent: false, icon: <Calendar size={13} /> };
    }
    if (stats.modules?.sales && stats.sales && stats.sales.pendingOrders > 0) {
      return { text: `${stats.sales.pendingOrders} ventas pendientes`, urgent: false, icon: <ShoppingCart size={13} /> };
    }
    return { text: `${stats.messages.todayCount} mensajes hoy`, urgent: false, icon: <Bot size={13} /> };
  }, [stats]);

  if (loading) {
    return (
      <div className={styles.shell}>
        <div className={styles.loadingHero} />
        <div className={styles.loadingBody}>
          <div className={styles.loadingPanel} />
          <div className={styles.loadingPanel} />
          <div className={styles.loadingSide} />
        </div>
        <div className={styles.loadingKpis}>
          <div className={styles.loadingKpi} />
          <div className={styles.loadingKpi} />
          <div className={styles.loadingKpi} />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.shell}>
      <div className={styles.topBar}>
        <div className={styles.searchPill}>
          <DashboardSearch modules={stats?.modules} />
        </div>
        <div className={styles.topBarRight}>
          {statusPill && (
            <span className={`${styles.statusPill} ${statusPill.urgent ? styles.statusPillUrgent : ''}`}>
              {statusPill.icon}
              {statusPill.text}
            </span>
          )}
        </div>
      </div>

      <section className={styles.heroStage}>
        <div className={styles.heroContent}>
          <div className={styles.heroEyebrow}>
            <span className={styles.liveDotSmall} />
            {tenantName} · en vivo
          </div>
          <h1 className={styles.heroTitle}>
            Hola, <em>{tenantName}</em>
          </h1>
          <p className={styles.heroSub}>
            {new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}
            {' · '}{stats?.conversations.active ?? 0} conversaciones activas
            {stats?.modules?.booking ? ` · ${stats.booking?.todayAppointments ?? 0} turnos hoy` : ''}
          </p>
        </div>

        <div className={styles.heroAlerts}>
          <div className={styles.heroAlertsHead}>
            <div>
              <h3 className={styles.heroAlertsTitle}>Acciones requeridas</h3>
              <p className={styles.heroAlertsSub}>
                {actions.length > 0 ? `${actions.length} tarea${actions.length > 1 ? 's' : ''} pendiente${actions.length > 1 ? 's' : ''}` : 'Sin pendientes críticos'}
              </p>
            </div>
            {actions.length > 0 && (
              <span className={styles.alertBadge}><AlertTriangle size={11} /> {actions.length}</span>
            )}
          </div>
          {actions.length === 0 ? (
            <div className={styles.alertOk}>✓ Operación al día</div>
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

      <div className={styles.bodyGrid}>
        <div className={styles.glassPanel}>
          <div className={styles.panelHeader}>
            <div>
              <h2 className={styles.panelTitle}>Actividad semanal</h2>
              <p className={styles.panelSub}>Últimos 7 días · {tenantName}</p>
            </div>
            <ChartMetricDropdown value={chartMetrics} onChange={setChartMetrics} />
          </div>
          <div className={styles.chartArea}>
            {trends.length > 0 ? (
              <WeeklyActivityChart data={trends} activeMetrics={chartMetrics} id="weekly-activity" />
            ) : (
              <div className={styles.chartEmpty}>Sin datos de tendencia aún</div>
            )}
          </div>
          <div className={styles.chartFooter}>
            <div className={styles.chartStat}>
              <div className={styles.chartStatValue}>{chartTotals.messages}</div>
              <div className={styles.chartStatLabel}>Mensajes</div>
            </div>
            <div className={styles.chartStat}>
              <div className={styles.chartStatValue}>{chartTotals.conversations}</div>
              <div className={styles.chartStatLabel}>Chats</div>
            </div>
            <div className={styles.chartStat}>
              <div className={styles.chartStatValue}>{chartTotals.leads}</div>
              <div className={styles.chartStatLabel}>Clientes</div>
            </div>
            {(stats?.conversations.pendingHuman ?? 0) > 0 && (
              <div className={styles.chartStat}>
                <div className={styles.chartStatValue} style={{ color: '#fbbf24' }}>{stats?.conversations.pendingHuman}</div>
                <div className={styles.chartStatLabel}>Humana</div>
              </div>
            )}
          </div>
        </div>

        <div className={styles.glassPanel}>
          <div className={styles.panelHeader}>
            <div>
              <h2 className={styles.panelTitle}>Módulos activos</h2>
              <p className={styles.panelSub}>
                {[
                  'Inbox',
                  'Clientes',
                  stats?.modules?.booking ? 'Turnera' : null,
                  stats?.modules?.sales ? 'Ventas' : null,
                ].filter(Boolean).join(' · ')}
              </p>
            </div>
            <TrendingUp size={16} style={{ color: 'var(--color-text-faint)', opacity: 0.7 }} />
          </div>
          <div className={styles.pipelineList}>
            {pipelines.map((p) => (
              <div key={p.id} className={styles.pipelineRow} onClick={() => router.push(p.href)}>
                <div className={styles.pipelineIcon} style={{ '--pipe-bg': p.bg, '--pipe-color': p.color } as React.CSSProperties}>{p.icon}</div>
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

        <div className={styles.sideStack}>
          {sideCards.map((card) => (
            <div
              key={card.id}
              className={`${styles.sideCard} ${card.urgent ? styles.sideCardUrgent : ''}`}
              onClick={card.href ? () => router.push(card.href!) : undefined}
              role={card.href ? 'button' : undefined}
            >
              <div className={styles.sideCardHead}>
                <span className={styles.sideCardLabel}>{card.label}</span>
                {card.spark && card.sparkColor && (
                  <MiniSparkline values={card.spark} color={card.sparkColor} />
                )}
              </div>
              <div className={styles.sideCardValue}>{card.value}</div>
              {card.sub && <div className={styles.sideCardSub}>{card.sub}</div>}
            </div>
          ))}
        </div>
      </div>

      <div className={styles.kpiRow}>
        <div className={styles.kpiCard}>
          <div className={styles.kpiHead}>
            <span className={styles.kpiLabel}>Conversaciones</span>
            <span className={`${styles.kpiDelta} ${convDelta < 0 ? styles.kpiDeltaNeg : ''}`}>
              {convDelta >= 0 ? '+' : ''}{convDelta}%
            </span>
          </div>
          <div className={styles.kpiValue}>
            {stats?.conversations.active ?? 0}<small>/{stats?.conversations.total ?? 0}</small>
          </div>
          <div className={styles.kpiTrack}>
            <div className={styles.kpiFill} style={{ width: `${pct(stats?.conversations.active ?? 0, stats?.conversations.total ?? 1)}%`, '--bar-from': '#22d3ee', '--bar-to': '#0891b2' } as React.CSSProperties} />
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiHead}>
            <span className={styles.kpiLabel}>Clientes</span>
            <span className={`${styles.kpiDelta} ${leadDelta < 0 ? styles.kpiDeltaNeg : ''}`}>
              {leadDelta >= 0 ? '+' : ''}{leadDelta}%
            </span>
          </div>
          <div className={styles.kpiValue}>
            {stats?.leads.newToday ?? 0}<small> hoy</small>
          </div>
          <div className={styles.kpiTrack}>
            <div className={styles.kpiFill} style={{ width: `${pct(stats?.leads.newThisWeek ?? 0, stats?.leads.total ?? 1)}%`, '--bar-from': '#a78bfa', '--bar-to': '#7c3aed' } as React.CSSProperties} />
          </div>
        </div>

        {thirdKpi && (
          <div className={styles.kpiCard}>
            <div className={styles.kpiHead}>
              <span className={styles.kpiLabel}>{thirdKpi.label}</span>
              <span className={styles.kpiDeltaNeutral}>{thirdKpi.delta}</span>
            </div>
            <div className={styles.kpiValue}>
              {thirdKpi.value}
              {thirdKpi.sub ? <small> · {thirdKpi.sub}</small> : null}
            </div>
            <div className={styles.kpiTrack}>
              <div className={styles.kpiFill} style={{ width: `${thirdKpi.progress}%`, '--bar-from': thirdKpi.from, '--bar-to': thirdKpi.to } as React.CSSProperties} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function formatResponse(sec: number) {
  if (!sec) return '—';
  if (sec < 60) return `${Math.round(sec)}s`;
  return `${Math.round(sec / 60)}m`;
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
