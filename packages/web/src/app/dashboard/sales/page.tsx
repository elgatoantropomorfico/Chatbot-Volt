'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import {
  DollarSign,
  ShoppingCart,
  CheckCircle,
  XCircle,
  Clock,
  Search,
  Trash2,
  ChevronLeft,
  ChevronRight,
  X,
  TrendingUp,
} from 'lucide-react';
import styles from './page.module.css';

export default function SalesPage() {
  const { user } = useAuth();
  const [sales, setSales] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedSale, setSelectedSale] = useState<any>(null);

  const loadSales = useCallback(async () => {
    try {
      const params: Record<string, string> = { page: page.toString(), limit: '20' };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;
      const data = await api.getSales(params);
      setSales(data.sales);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch (err) {
      console.error('Error loading sales:', err);
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, dateFrom, dateTo]);

  const loadStats = useCallback(async () => {
    try {
      const data = await api.getSaleStats();
      setStats(data.stats);
    } catch (err) {
      console.error('Error loading stats:', err);
    }
  }, []);

  useEffect(() => {
    loadSales();
  }, [loadSales]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // Real-time polling every 10s
  const loadSalesRef = useRef(loadSales);
  const loadStatsRef = useRef(loadStats);
  loadSalesRef.current = loadSales;
  loadStatsRef.current = loadStats;

  useEffect(() => {
    const interval = setInterval(() => {
      loadSalesRef.current();
      loadStatsRef.current();
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  async function handleStatusChange(saleId: string, newStatus: string) {
    try {
      await api.updateSale(saleId, { status: newStatus });
      await loadSales();
      await loadStats();
      if (selectedSale?.id === saleId) {
        setSelectedSale((prev: any) => prev ? { ...prev, status: newStatus } : null);
      }
    } catch (err) {
      console.error('Error updating sale:', err);
    }
  }

  async function handleDelete(saleId: string) {
    if (!confirm('¿Estás seguro de eliminar esta venta? Esta acción no se puede deshacer.')) return;
    try {
      await api.deleteSale(saleId);
      await loadSales();
      await loadStats();
      if (selectedSale?.id === saleId) setSelectedSale(null);
    } catch (err: any) {
      alert(err.message || 'Error al eliminar la venta');
    }
  }

  function formatPrice(amount: number) {
    return `$${Math.round(amount).toLocaleString('es-AR')}`;
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function statusBadge(status: string) {
    const map: Record<string, { label: string; icon: any; className: string }> = {
      pending: { label: 'Pendiente', icon: Clock, className: styles.badgePending },
      completed: { label: 'Completada', icon: CheckCircle, className: styles.badgeCompleted },
      cancelled: { label: 'Cancelada', icon: XCircle, className: styles.badgeCancelled },
    };
    const s = map[status] || map.pending;
    const Icon = s.icon;
    return (
      <span className={`${styles.badge} ${s.className}`}>
        <Icon size={13} /> {s.label}
      </span>
    );
  }

  function getItems(sale: any): any[] {
    try {
      return Array.isArray(sale.itemsJson) ? sale.itemsJson : JSON.parse(sale.itemsJson);
    } catch {
      return [];
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>Ventas</h1>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>
              <ShoppingCart size={14} /> Total Ventas
            </div>
            <div className={styles.statValue}>{stats.totalSales}</div>
            <div className={styles.statSubtext}>
              {stats.monthSalesCount} este mes
            </div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>
              <Clock size={14} /> Pendientes
            </div>
            <div className={styles.statValue}>{stats.pendingSales}</div>
            <div className={styles.statSubtext}>Esperando confirmación</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>
              <CheckCircle size={14} /> Completadas
            </div>
            <div className={styles.statValue}>{stats.completedSales}</div>
            <div className={styles.statSubtext}>{stats.cancelledSales} canceladas</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>
              <TrendingUp size={14} /> Facturación Mes
            </div>
            <div className={styles.statValue}>{formatPrice(stats.monthRevenue)}</div>
            <div className={styles.statSubtext}>
              Total: {formatPrice(stats.totalRevenue)}
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className={styles.filters}>
        <input
          type="text"
          placeholder="Buscar por nombre, teléfono..."
          className={styles.searchInput}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
        <select
          className={styles.filterSelect}
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
        >
          <option value="">Todos los estados</option>
          <option value="pending">Pendientes</option>
          <option value="completed">Completadas</option>
          <option value="cancelled">Canceladas</option>
        </select>
        <input
          type="date"
          className={styles.dateInput}
          value={dateFrom}
          onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
          title="Desde"
        />
        <input
          type="date"
          className={styles.dateInput}
          value={dateTo}
          onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
          title="Hasta"
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className={styles.loading}>Cargando ventas...</div>
      ) : sales.length === 0 ? (
        <div className={styles.empty}>
          <DollarSign size={48} style={{ opacity: 0.3, marginBottom: 12 }} />
          <h3>Sin ventas registradas</h3>
          <p>Las ventas aparecen cuando los clientes completan un checkout por WhatsApp.</p>
        </div>
      ) : (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Cliente</th>
                  <th>Productos</th>
                  <th>Total</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((sale) => {
                  const items = getItems(sale);
                  return (
                    <tr key={sale.id} onClick={() => setSelectedSale(sale)} style={{ cursor: 'pointer' }}>
                      <td>{formatDate(sale.createdAt)}</td>
                      <td>
                        <div>{sale.customerName || sale.lead?.name || '—'}</div>
                        <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                          {sale.customerPhone || sale.lead?.phone || ''}
                        </div>
                      </td>
                      <td>
                        <ul className={styles.itemsList}>
                          {items.slice(0, 3).map((item: any, i: number) => (
                            <li key={i}>
                              <span className={styles.itemName}>{item.name}</span>
                              <span className={styles.itemQty}>x{item.quantity}</span>
                            </li>
                          ))}
                          {items.length > 3 && (
                            <li style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>
                              +{items.length - 3} más
                            </li>
                          )}
                        </ul>
                      </td>
                      <td style={{ fontWeight: 600 }}>{formatPrice(sale.totalAmount)}</td>
                      <td>{statusBadge(sale.status)}</td>
                      <td>
                        <div className={styles.actions} onClick={(e) => e.stopPropagation()}>
                          {sale.status === 'pending' && (
                            <>
                              <button
                                className={`${styles.actionBtn} ${styles.actionBtnSuccess}`}
                                onClick={() => handleStatusChange(sale.id, 'completed')}
                                title="Marcar completada"
                              >
                                <CheckCircle size={14} />
                              </button>
                              <button
                                className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                                onClick={() => handleStatusChange(sale.id, 'cancelled')}
                                title="Cancelar"
                              >
                                <XCircle size={14} />
                              </button>
                            </>
                          )}
                          {sale.status === 'cancelled' && (
                            <button
                              className={`${styles.actionBtn}`}
                              onClick={() => handleStatusChange(sale.id, 'pending')}
                              title="Reactivar"
                            >
                              <Clock size={14} />
                            </button>
                          )}
                          {sale.status === 'completed' && (
                            <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Finalizada</span>
                          )}
                          {sale.checkoutMode === 'wa_human' && (
                            <button
                              className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                              onClick={() => handleDelete(sale.id)}
                              title="Eliminar venta"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className={styles.pagination}>
              <button
                className={styles.pageBtn}
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                <ChevronLeft size={16} />
              </button>
              <span className={styles.pageInfo}>
                Página {page} de {totalPages} ({total} ventas)
              </span>
              <button
                className={styles.pageBtn}
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </>
      )}

      {/* Detail Overlay */}
      {selectedSale && (
        <>
          <div className={styles.detailBackdrop} onClick={() => setSelectedSale(null)} />
          <div className={styles.detailPanel}>
            <div className={styles.detailHeader}>
              <h2>Detalle de Venta</h2>
              <button className={styles.closeBtn} onClick={() => setSelectedSale(null)}>
                <X size={18} />
              </button>
            </div>

            <div className={styles.detailSection}>
              <h3>Información</h3>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Estado</span>
                <span className={styles.detailValue}>{statusBadge(selectedSale.status)}</span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Fecha</span>
                <span className={styles.detailValue}>{formatDate(selectedSale.createdAt)}</span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Cliente</span>
                <span className={styles.detailValue}>
                  {selectedSale.customerName || selectedSale.lead?.name || '—'}
                </span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Teléfono</span>
                <span className={styles.detailValue}>
                  {selectedSale.customerPhone || selectedSale.lead?.phone || '—'}
                </span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Modo</span>
                <span className={styles.detailValue}>
                  {selectedSale.checkoutMode === 'wa_human' ? 'WhatsApp Humano' : 'MercadoPago'}
                </span>
              </div>
            </div>

            <div className={styles.detailSection}>
              <h3>Productos</h3>
              <ul className={styles.detailItemsList}>
                {getItems(selectedSale).map((item: any, i: number) => (
                  <li key={i}>
                    <span>{item.name} x{item.quantity}</span>
                    <span style={{ fontWeight: 600 }}>
                      {formatPrice(parseFloat(item.price) * item.quantity)}
                    </span>
                  </li>
                ))}
              </ul>
              <div className={styles.detailTotal}>
                <span>Total</span>
                <span>{formatPrice(selectedSale.totalAmount)}</span>
              </div>
            </div>

            {selectedSale.status === 'pending' && (
              <div className={styles.detailActions}>
                <button
                  className={`${styles.actionBtn} ${styles.actionBtnSuccess}`}
                  onClick={() => handleStatusChange(selectedSale.id, 'completed')}
                >
                  <CheckCircle size={14} /> Completar
                </button>
                <button
                  className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                  onClick={() => handleStatusChange(selectedSale.id, 'cancelled')}
                >
                  <XCircle size={14} /> Cancelar
                </button>
              </div>
            )}
            {selectedSale.checkoutMode === 'wa_human' && (
              <div className={styles.detailActions} style={{ marginTop: 8 }}>
                <button
                  className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                  onClick={() => handleDelete(selectedSale.id)}
                >
                  <Trash2 size={14} /> Eliminar venta
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
