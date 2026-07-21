'use client';

import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from 'react';
import { api } from '@/lib/api';
import {
  DollarSign,
  CheckCircle,
  Clock,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Calendar,
  Filter,
} from 'lucide-react';
import styles from '../sales/page.module.css';

const STATUS_OPTIONS = [
  { value: '', label: 'Todos los estados' },
  { value: 'confirmado', label: 'Confirmado' },
  { value: 'completado', label: 'Completado' },
  { value: 'pendiente_pago', label: 'Pendiente de pago' },
  { value: 'cancelado', label: 'Cancelado' },
  { value: 'vencido', label: 'Vencido' },
  { value: 'no_asistio', label: 'No asistió' },
];

function monthLabel(year: number, month: number) {
  const d = new Date(Date.UTC(year, month - 1, 1));
  return d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function buildMonthChips(count = 6) {
  const now = new Date();
  const chips: Array<{ year: number; month: number; label: string }> = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    chips.push({
      year: d.getUTCFullYear(),
      month: d.getUTCMonth() + 1,
      label: monthLabel(d.getUTCFullYear(), d.getUTCMonth() + 1),
    });
  }
  return chips;
}

export default function BookingSalesPage() {
  const now = new Date();
  const [sales, setSales] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [year, setYear] = useState(now.getUTCFullYear());
  const [month, setMonth] = useState(now.getUTCMonth() + 1);
  const [showRange, setShowRange] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [historyById, setHistoryById] = useState<Record<string, any[]>>({});
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const months = useMemo(() => buildMonthChips(6), []);
  const usingRange = showRange && (!!dateFrom || !!dateTo);

  const loadSales = useCallback(async () => {
    try {
      const params: Record<string, string> = { page: String(page), limit: '20' };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      if (usingRange) {
        if (dateFrom) params.dateFrom = dateFrom;
        if (dateTo) params.dateTo = dateTo;
      } else {
        params.year = String(year);
        params.month = String(month);
      }
      const data = await api.getBookingSales(params);
      setSales(data.sales);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch (err) {
      console.error('Error loading booking sales:', err);
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, year, month, usingRange, dateFrom, dateTo]);

  const loadStats = useCallback(async () => {
    try {
      const params: Record<string, string> = {};
      if (usingRange) {
        if (dateFrom) params.dateFrom = dateFrom;
        if (dateTo) params.dateTo = dateTo;
      } else {
        params.year = String(year);
        params.month = String(month);
      }
      const data = await api.getBookingSaleStats(params);
      setStats(data.stats);
    } catch (err) {
      console.error('Error loading booking sale stats:', err);
    }
  }, [year, month, usingRange, dateFrom, dateTo]);

  useEffect(() => { loadSales(); }, [loadSales]);
  useEffect(() => { loadStats(); }, [loadStats]);

  const loadSalesRef = useRef(loadSales);
  const loadStatsRef = useRef(loadStats);
  loadSalesRef.current = loadSales;
  loadStatsRef.current = loadStats;
  useEffect(() => {
    const t = setInterval(() => {
      loadSalesRef.current();
      loadStatsRef.current();
    }, 15000);
    return () => clearInterval(t);
  }, []);

  async function toggleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (!historyById[id]) {
      try {
        const { history } = await api.getAppointmentStatusHistory(id);
        setHistoryById((prev) => ({ ...prev, [id]: history }));
      } catch {
        setHistoryById((prev) => ({ ...prev, [id]: [] }));
      }
    }
  }

  async function handleConfirmPayment(id: string) {
    if (!confirm('¿Confirmar el pago completo y pasar el turno a Completado?')) return;
    setConfirmingId(id);
    try {
      await api.confirmBookingSalePayment(id);
      await loadSales();
      await loadStats();
      const { history } = await api.getAppointmentStatusHistory(id);
      setHistoryById((prev) => ({ ...prev, [id]: history }));
    } catch (err: any) {
      alert(err.message || 'No se pudo confirmar el pago');
    } finally {
      setConfirmingId(null);
    }
  }

  function formatPrice(amount: number) {
    return `$${Math.round(amount || 0).toLocaleString('es-AR')}`;
  }

  function formatDay(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('es-AR', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      timeZone: 'UTC',
    });
  }

  function formatHistoryWhen(dateStr: string) {
    return new Date(dateStr).toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function paymentClass(key: string) {
    if (key === 'paid_100') return styles.badgeCompleted;
    if (key === 'paid_50' || key === 'paid_partial') return styles.badgePending;
    if (key === 'pending') return styles.badgePending;
    if (key === 'cancelled' || key === 'expired') return styles.badgeCancelled;
    return styles.badgePending;
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>Ventas</h1>
      </div>

      {stats && (
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <div className={styles.statLabel}><Calendar size={14} /> Turnos del período</div>
            <div className={styles.statValue}>{stats.totalSales}</div>
            <div className={styles.statSubtext}>{stats.completed} completados · {stats.confirmed} confirmados</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}><DollarSign size={14} /> Cobrado</div>
            <div className={styles.statValue}>{formatPrice(stats.revenue)}</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}><CheckCircle size={14} /> Cobrado 100%</div>
            <div className={styles.statValue}>{stats.paid100}</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}><Clock size={14} /> Cobrado 50% / parcial</div>
            <div className={styles.statValue}>{stats.paid50}</div>
          </div>
        </div>
      )}

      <div className={styles.filters} style={{ alignItems: 'center' }}>
        {months.map((m) => {
          const active = !usingRange && year === m.year && month === m.month;
          return (
            <button
              key={`${m.year}-${m.month}`}
              type="button"
              onClick={() => {
                setShowRange(false);
                setDateFrom('');
                setDateTo('');
                setYear(m.year);
                setMonth(m.month);
                setPage(1);
              }}
              className={styles.filterSelect}
              style={{
                cursor: 'pointer',
                borderColor: active ? 'var(--color-primary)' : undefined,
                background: active ? 'rgba(139, 92, 246, 0.12)' : undefined,
                textTransform: 'capitalize',
              }}
            >
              {m.label}
            </button>
          );
        })}
        <button
          type="button"
          className={styles.filterSelect}
          style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          onClick={() => setShowRange((v) => !v)}
        >
          <Filter size={14} />
          {showRange ? 'Ocultar rango' : 'Ver más'}
        </button>
      </div>

      {showRange && (
        <div className={styles.filters}>
          <input
            type="date"
            className={styles.dateInput}
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
          />
          <input
            type="date"
            className={styles.dateInput}
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
          />
        </div>
      )}

      <div className={styles.filters}>
        <div style={{ flex: 1, position: 'relative', minWidth: 200 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: 12, opacity: 0.5 }} />
          <input
            className={styles.searchInput}
            style={{ paddingLeft: 36 }}
            placeholder="Buscar cliente, teléfono o camino…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <select
          className={styles.filterSelect}
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value || 'all'} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      <div className={styles.tableWrap}>
        {loading ? (
          <div className={styles.empty}>Cargando ventas…</div>
        ) : sales.length === 0 ? (
          <div className={styles.empty}>No hay turnos en este período.</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th style={{ width: 36 }} />
                <th>Fecha</th>
                <th>Cliente</th>
                <th>Camino</th>
                <th>Cobro</th>
                <th>Pagado</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((sale) => {
                const open = expandedId === sale.id;
                const history = historyById[sale.id] || [];
                return (
                  <Fragment key={sale.id}>
                    <tr onClick={() => toggleExpand(sale.id)} style={{ cursor: 'pointer' }}>
                      <td>{open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</td>
                      <td>
                        <div>{formatDay(sale.appointmentDate)}</div>
                        <div className={styles.statSubtext}>{sale.appointmentTime}</div>
                      </td>
                      <td>
                        <div>{sale.customerName || sale.lead?.name || '—'}</div>
                        <div className={styles.statSubtext}>{sale.customerPhone || sale.lead?.phone}</div>
                      </td>
                      <td>{sale.service?.name || '—'}</td>
                      <td>
                        <span className={`${styles.badge} ${paymentClass(sale.payment?.key)}`}>
                          {sale.payment?.label || '—'}
                        </span>
                      </td>
                      <td>
                        <div>{formatPrice(sale.amountPaid)}</div>
                        {sale.balanceDue > 0 && (
                          <div className={styles.statSubtext}>Saldo {formatPrice(sale.balanceDue)}</div>
                        )}
                      </td>
                      <td style={{ textTransform: 'capitalize' }}>{String(sale.status).replace(/_/g, ' ')}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {sale.canConfirmPayment && (
                          <button
                            type="button"
                            className={styles.filterSelect}
                            style={{ cursor: 'pointer' }}
                            disabled={confirmingId === sale.id}
                            onClick={() => handleConfirmPayment(sale.id)}
                          >
                            {confirmingId === sale.id ? '…' : 'Confirmar pago'}
                          </button>
                        )}
                      </td>
                    </tr>
                    {open && (
                      <tr>
                        <td colSpan={8}>
                          <div style={{ padding: '8px 12px 14px', display: 'grid', gap: 10 }}>
                            <div className={styles.statSubtext}>
                              Total sesión {formatPrice(sale.finalPrice)}
                              {sale.paymentType ? ` · Tipo MP: ${sale.paymentType === 'total' ? '100%' : 'seña'}` : ''}
                              {sale.mpPaymentId ? ` · MP #${sale.mpPaymentId}` : ''}
                            </div>
                            <div>
                              <strong style={{ fontSize: 12 }}>Historial de estados</strong>
                              {history.length === 0 ? (
                                <div className={styles.statSubtext} style={{ marginTop: 6 }}>Sin cambios registrados aún.</div>
                              ) : (
                                <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13, lineHeight: 1.5 }}>
                                  {history.map((h) => (
                                    <li key={h.id}>
                                      <span style={{ textTransform: 'capitalize' }}>
                                        {(h.fromStatus || '—').replace(/_/g, ' ')} → {String(h.toStatus).replace(/_/g, ' ')}
                                      </span>
                                      {' · '}
                                      {formatHistoryWhen(h.createdAt)}
                                      {' · '}
                                      {h.changedByName || h.source || 'Sistema'}
                                      {h.note ? ` — ${h.note}` : ''}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {totalPages > 1 && (
        <div className={styles.pagination}>
          <button type="button" className={styles.pageBtn} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            <ChevronLeft size={16} />
          </button>
          <span className={styles.pageInfo}>{page} / {totalPages} · {total} turnos</span>
          <button type="button" className={styles.pageBtn} disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
