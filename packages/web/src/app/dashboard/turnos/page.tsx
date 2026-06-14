'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import {
  Calendar,
  CalendarDays,
  List,
  RefreshCw,
  CheckCircle,
  Clock,
  CreditCard,
  TrendingUp,
  X,
  XCircle,
  User,
  Sparkles,
  AlertCircle,
  Ban,
} from 'lucide-react';
import styles from './page.module.css';

const STATUS_LABELS: Record<string, string> = {
  pendiente_datos: 'Pendiente datos',
  pendiente_pago: 'Pendiente pago',
  confirmado: 'Confirmado',
  cancelado: 'Cancelado',
  reprogramado: 'Reprogramado',
  completado: 'Completado',
  no_asistio: 'No asistió',
  vencido: 'Vencido',
};

const STATUS_BADGE: Record<string, string> = {
  confirmado: styles.badgeConfirmado,
  pendiente_pago: styles.badgePendientePago,
  pendiente_datos: styles.badgePendienteDatos,
  cancelado: styles.badgeCancelado,
  completado: styles.badgeCompletado,
  vencido: styles.badgeVencido,
};

const STATUS_ICON: Record<string, typeof CheckCircle> = {
  confirmado: CheckCircle,
  pendiente_pago: CreditCard,
  pendiente_datos: Clock,
  cancelado: XCircle,
  completado: CheckCircle,
  vencido: Ban,
};

function formatPrice(n: number) {
  return `$${Math.round(n).toLocaleString('es-AR')}`;
}

function formatDateLabel(dateStr: string) {
  const d = new Date(dateStr.slice(0, 10) + 'T12:00:00');
  return d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
}

function isToday(dateStr: string) {
  const today = new Date().toISOString().slice(0, 10);
  return dateStr?.slice(0, 10) === today;
}

export default function TurnosPage() {
  const [tab, setTab] = useState<'lista' | 'calendario'>('lista');
  const [appointments, setAppointments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (filter) params.status = filter;
      const res = await api.getAppointments(params);
      setAppointments(res.appointments || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const confirmados = appointments.filter((a) => a.status === 'confirmado').length;
    const pendientesPago = appointments.filter((a) => a.status === 'pendiente_pago').length;
    const hoy = appointments.filter((a) => a.appointmentDate?.slice(0, 10) === today && !['cancelado', 'vencido'].includes(a.status)).length;
    const ingresos = appointments
      .filter((a) => ['confirmado', 'completado'].includes(a.status))
      .reduce((sum, a) => sum + Number(a.amountPaid || 0), 0);
    return { confirmados, pendientesPago, hoy, ingresos };
  }, [appointments]);

  const groupedByDate = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const a of appointments) {
      const key = a.appointmentDate?.slice(0, 10) || 'sin-fecha';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [appointments]);

  async function updateStatus(id: string, status: string) {
    await api.updateAppointment(id, { status });
    await load();
    if (selected?.id === id) {
      setSelected((prev: any) => (prev ? { ...prev, status } : null));
    }
  }

  function statusBadge(status: string) {
    const Icon = STATUS_ICON[status] || AlertCircle;
    const cls = STATUS_BADGE[status] || styles.badgeDefault;
    return (
      <span className={`${styles.badge} ${cls}`}>
        <Icon size={13} /> {STATUS_LABELS[status] || status}
      </span>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>
          <Calendar size={24} style={{ color: '#a78bfa', WebkitTextFillColor: 'initial' }} />
          Turnos
        </h1>
      </div>
      <p className={styles.subtitle}>Gestión de reservas confirmadas y pendientes</p>

      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statLabel}><CalendarDays size={14} /> Hoy</div>
          <div className={styles.statValue}>{stats.hoy}</div>
          <div className={styles.statSubtext}>Turnos del día</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}><CheckCircle size={14} /> Confirmados</div>
          <div className={styles.statValue}>{stats.confirmados}</div>
          <div className={styles.statSubtext}>Con pago acreditado</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}><CreditCard size={14} /> Pendientes</div>
          <div className={styles.statValue}>{stats.pendientesPago}</div>
          <div className={styles.statSubtext}>Esperando pago</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}><TrendingUp size={14} /> Cobrado</div>
          <div className={styles.statValue}>{formatPrice(stats.ingresos)}</div>
          <div className={styles.statSubtext}>Confirmados y completados</div>
        </div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.viewTabs}>
          <button
            type="button"
            className={`${styles.viewTab} ${tab === 'lista' ? styles.viewTabActive : ''}`}
            onClick={() => setTab('lista')}
          >
            <List size={15} /> Lista
          </button>
          <button
            type="button"
            className={`${styles.viewTab} ${tab === 'calendario' ? styles.viewTabActive : ''}`}
            onClick={() => setTab('calendario')}
          >
            <CalendarDays size={15} /> Agenda
          </button>
        </div>
        <select
          className={styles.filterSelect}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="">Todos los estados</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <button type="button" className={styles.refreshBtn} onClick={load} title="Actualizar">
          <RefreshCw size={16} />
        </button>
      </div>

      {loading ? (
        <div className={styles.loading}>Cargando turnos...</div>
      ) : appointments.length === 0 ? (
        <div className={styles.empty}>
          <Calendar size={48} style={{ opacity: 0.3 }} />
          <h3>Sin turnos todavía</h3>
          <p>Cuando un cliente reserve por WhatsApp, el turno aparecerá acá.</p>
        </div>
      ) : tab === 'calendario' ? (
        <div className={styles.agenda}>
          {groupedByDate.map(([date, items]) => (
            <div key={date} className={styles.agendaDay}>
              <div className={styles.agendaDayHeader}>
                <CalendarDays size={16} style={{ color: '#a78bfa' }} />
                {formatDateLabel(date)}
                {isToday(date) && (
                  <span className={styles.agendaDayCount} style={{ background: 'rgba(139, 92, 246, 0.15)', color: '#a78bfa' }}>Hoy</span>
                )}
                <span className={styles.agendaDayCount}>{items.length} turno{items.length !== 1 ? 's' : ''}</span>
              </div>
              <div className={styles.agendaList}>
                {items.map((a) => (
                  <div key={a.id} className={styles.agendaItem} onClick={() => setSelected(a)}>
                    <div className={styles.agendaTime}>{a.appointmentTime}</div>
                    <div className={styles.agendaBody}>
                      <div className={styles.agendaClient}>{a.customerName || a.lead?.name || a.customerPhone}</div>
                      <div className={styles.agendaService}>{a.service?.name}</div>
                    </div>
                    <div className={styles.agendaMeta}>
                      {statusBadge(a.status)}
                      <div className={styles.agendaPrice}>{formatPrice(Number(a.finalPrice || 0))}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Hora</th>
                <th>Cliente</th>
                <th>Camino</th>
                <th>Estado</th>
                <th>Pagado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {appointments.map((a) => (
                <tr key={a.id} onClick={() => setSelected(a)}>
                  <td>{a.appointmentDate?.slice(0, 10)}</td>
                  <td style={{ fontWeight: 600, color: '#a78bfa' }}>{a.appointmentTime}</td>
                  <td>
                    <div>{a.customerName || a.lead?.name || '—'}</div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{a.customerPhone || a.lead?.phone}</div>
                  </td>
                  <td>{a.service?.name}</td>
                  <td>{statusBadge(a.status)}</td>
                  <td style={{ fontWeight: 600 }}>{formatPrice(Number(a.amountPaid || 0))}</td>
                  <td>
                    <div className={styles.actions} onClick={(e) => e.stopPropagation()}>
                      {a.status === 'confirmado' && (
                        <button
                          type="button"
                          className={`${styles.actionBtn} ${styles.actionBtnSuccess}`}
                          onClick={() => updateStatus(a.id, 'completado')}
                        >
                          <CheckCircle size={14} /> Completar
                        </button>
                      )}
                      {!['cancelado', 'completado'].includes(a.status) && (
                        <button
                          type="button"
                          className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                          onClick={() => updateStatus(a.id, 'cancelado')}
                        >
                          <XCircle size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <>
          <div className={styles.detailBackdrop} onClick={() => setSelected(null)} />
          <div className={styles.detailPanel}>
            <div className={styles.detailHeader}>
              <h2>Detalle del turno</h2>
              <button type="button" className={styles.closeBtn} onClick={() => setSelected(null)}>
                <X size={18} />
              </button>
            </div>

            <div style={{ marginBottom: 16 }}>{statusBadge(selected.status)}</div>

            <div className={styles.detailSection}>
              <h3><User size={12} style={{ display: 'inline', marginRight: 4 }} /> Cliente</h3>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Nombre</span>
                <span className={styles.detailValue}>{selected.customerName || selected.lead?.name || '—'}</span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Teléfono</span>
                <span className={styles.detailValue}>{selected.customerPhone || selected.lead?.phone || '—'}</span>
              </div>
            </div>

            <div className={styles.detailSection}>
              <h3><Sparkles size={12} style={{ display: 'inline', marginRight: 4 }} /> Sesión</h3>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Camino</span>
                <span className={styles.detailValue}>{selected.service?.name}</span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Fecha</span>
                <span className={styles.detailValue}>{selected.appointmentDate?.slice(0, 10)}</span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Horario</span>
                <span className={styles.detailValue}>{selected.appointmentTime}</span>
              </div>
              {selected.customerNotes && (
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Notas</span>
                  <span className={styles.detailValue}>{selected.customerNotes}</span>
                </div>
              )}
            </div>

            <div className={styles.detailSection}>
              <h3><CreditCard size={12} style={{ display: 'inline', marginRight: 4 }} /> Pago</h3>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Precio final</span>
                <span className={styles.detailValue}>{formatPrice(Number(selected.finalPrice || 0))}</span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Pagado</span>
                <span className={styles.detailValue}>{formatPrice(Number(selected.amountPaid || 0))}</span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Saldo</span>
                <span className={styles.detailValue}>{formatPrice(Number(selected.balanceDue || 0))}</span>
              </div>
            </div>

            <div className={styles.detailActions}>
              {selected.status === 'confirmado' && (
                <button
                  type="button"
                  className={`${styles.actionBtn} ${styles.actionBtnSuccess}`}
                  onClick={() => updateStatus(selected.id, 'completado')}
                >
                  <CheckCircle size={14} /> Completar
                </button>
              )}
              {!['cancelado', 'completado'].includes(selected.status) && (
                <button
                  type="button"
                  className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                  onClick={() => updateStatus(selected.id, 'cancelado')}
                >
                  <XCircle size={14} /> Cancelar
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
