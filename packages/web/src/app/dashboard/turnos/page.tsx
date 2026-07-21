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
  Plus,
  ChevronLeft,
  ChevronRight,
  MessageCircle,
  PenLine,
  LayoutGrid,
  Trash2,
  Search,
} from 'lucide-react';
import { VoltDrawer } from '@/components/ui/VoltDrawer';
import styles from './page.module.css';

const STATUS_LABELS: Record<string, string> = {
  pendiente_datos: 'Pendiente datos',
  pendiente_pago: 'Pendiente pago',
  senado: 'Señado (50%)',
  confirmado: 'Confirmado',
  cancelado: 'Cancelado',
  reprogramado: 'Reprogramado',
  completado: 'Completado',
  no_asistio: 'No asistió',
  vencido: 'Vencido',
};

const STATUS_BADGE: Record<string, string> = {
  confirmado: styles.badgeConfirmado,
  senado: styles.badgeSenado,
  pendiente_pago: styles.badgePendientePago,
  pendiente_datos: styles.badgePendienteDatos,
  cancelado: styles.badgeCancelado,
  completado: styles.badgeCompletado,
  vencido: styles.badgeVencido,
  reprogramado: styles.badgeDefault,
  no_asistio: styles.badgeCancelado,
};

const STATUS_ICON: Record<string, typeof CheckCircle> = {
  confirmado: CheckCircle,
  senado: CreditCard,
  pendiente_pago: CreditCard,
  pendiente_datos: Clock,
  cancelado: XCircle,
  completado: CheckCircle,
  vencido: Ban,
  reprogramado: Clock,
  no_asistio: Ban,
};

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function formatPrice(n: number) {
  return `$${Math.round(n).toLocaleString('es-AR')}`;
}

function dateKey(dateStr: string) {
  return dateStr?.slice(0, 10) || '';
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateLabel(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
}

function buildMonthGrid(year: number, month: number) {
  const first = new Date(year, month, 1);
  const startPad = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<{ date: string | null; day: number | null }> = [];

  for (let i = 0; i < startPad; i++) cells.push({ date: null, day: null });
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ date: iso, day: d });
  }
  while (cells.length % 7 !== 0) cells.push({ date: null, day: null });
  return cells;
}

function isManualAppointment(a: any) {
  return !a.conversationId;
}

function getWeekRange() {
  const now = new Date();
  const mondayOffset = (now.getDay() + 6) % 7;
  const mon = new Date(now);
  mon.setDate(now.getDate() - mondayOffset);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return {
    from: mon.toISOString().slice(0, 10),
    to: sun.toISOString().slice(0, 10),
  };
}

function getMonthRange() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const last = new Date(y, m + 1, 0).getDate();
  return {
    from: `${y}-${String(m + 1).padStart(2, '0')}-01`,
    to: `${y}-${String(m + 1).padStart(2, '0')}-${String(last).padStart(2, '0')}`,
  };
}

const EMPTY_FORM = {
  serviceId: '',
  appointmentDate: todayKey(),
  appointmentTime: '16:30',
  customerName: '',
  customerPhone: '',
  status: 'confirmado',
  amountPaid: '',
  customerNotes: '',
};

export default function TurnosPage() {
  const [view, setView] = useState<'calendar' | 'list'>('calendar');
  const [appointments, setAppointments] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [slots, setSlots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selected, setSelected] = useState<any>(null);
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [monthCursor, setMonthCursor] = useState(() => {
    const n = new Date();
    return { year: n.getFullYear(), month: n.getMonth() };
  });
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (filter) params.status = filter;
      if (dateFrom) params.from = dateFrom;
      if (dateTo) params.to = dateTo;
      const [apptRes, svcRes, slotRes] = await Promise.all([
        api.getAppointments(params),
        api.getBookingServices(),
        api.getBookingSlots(),
      ]);
      setAppointments(apptRes.appointments || []);
      setServices((svcRes.services || []).filter((s: any) => s.isActive));
      setSlots((slotRes.slots || []).filter((s: any) => s.isActive));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [filter, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  // Deep link: /dashboard/turnos?appointment=<id>
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('appointment');
    if (!id) return;
    api.getAppointment(id).then(({ appointment }) => setSelected(appointment)).catch(() => {});
  }, []);

  const byDate = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const a of appointments) {
      const key = dateKey(a.appointmentDate);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    for (const [, list] of map) {
      list.sort((x, y) => x.appointmentTime.localeCompare(y.appointmentTime));
    }
    return map;
  }, [appointments]);

  const monthCells = useMemo(
    () => buildMonthGrid(monthCursor.year, monthCursor.month),
    [monthCursor],
  );

  const dayAppointments = useMemo(
    () => byDate.get(selectedDate) || [],
    [byDate, selectedDate],
  );

  const filteredList = useMemo(() => {
    if (!searchQuery.trim()) return appointments;
    const q = searchQuery.trim().toLowerCase();
    return appointments.filter((a) => {
      const name = (a.customerName || a.lead?.name || '').toLowerCase();
      const phone = (a.customerPhone || a.lead?.phone || '').toLowerCase();
      const service = (a.service?.name || '').toLowerCase();
      return name.includes(q) || phone.includes(q) || service.includes(q);
    });
  }, [appointments, searchQuery]);

  const groupedList = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const a of filteredList) {
      const key = dateKey(a.appointmentDate);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, items]) => ({
        date,
        items: items.sort((x, y) => x.appointmentTime.localeCompare(y.appointmentTime)),
      }));
  }, [filteredList]);

  const stats = useMemo(() => {
    const today = todayKey();
    const confirmados = appointments.filter((a) => ['confirmado', 'senado'].includes(a.status)).length;
    const pendientesPago = appointments.filter((a) => a.status === 'pendiente_pago').length;
    const hoy = appointments.filter(
      (a) => dateKey(a.appointmentDate) === today && !['cancelado', 'vencido'].includes(a.status),
    ).length;
    const monthPrefix = `${monthCursor.year}-${String(monthCursor.month + 1).padStart(2, '0')}`;
    const ingresos = appointments
      .filter((a) => {
        const key = dateKey(a.appointmentDate);
        if (!key.startsWith(monthPrefix)) return false;
        return ['confirmado', 'senado', 'completado'].includes(a.status);
      })
      .reduce((sum, a) => sum + Number(a.amountPaid || 0), 0);
    return { confirmados, pendientesPago, hoy, ingresos };
  }, [appointments, monthCursor]);

  const slotTimes = useMemo(() => {
    const times = slots.map((s) => s.time);
    if (!times.includes(createForm.appointmentTime) && createForm.appointmentTime) {
      return [...times, createForm.appointmentTime].sort();
    }
    return times.length ? times : ['16:30', '18:00', '19:30'];
  }, [slots, createForm.appointmentTime]);

  function statusBadge(status: string) {
    const Icon = STATUS_ICON[status] || AlertCircle;
    const cls = STATUS_BADGE[status] || styles.badgeDefault;
    return (
      <span className={`${styles.badge} ${cls}`}>
        <Icon size={13} /> {STATUS_LABELS[status] || status}
      </span>
    );
  }

  function sourceBadge(a: any) {
    return isManualAppointment(a) ? (
      <span className={styles.sourceBadgeManual}><PenLine size={11} /> Manual</span>
    ) : (
      <span className={styles.sourceBadgeBot}><MessageCircle size={11} /> WhatsApp</span>
    );
  }

  async function updateAppointment(id: string, data: Record<string, unknown>) {
    const res = await api.updateAppointment(id, data);
    await load();
    if (selected?.id === id) setSelected(res.appointment);
    return res.appointment;
  }

  async function handleStatusChange(id: string, status: string) {
    await updateAppointment(id, { status });
  }

  async function handleDeleteAppointment(a: any) {
    const label = `${a.customerName || a.lead?.name || 'Cliente'} — ${dateKey(a.appointmentDate)} ${a.appointmentTime}`;
    if (!confirm(`¿Eliminar el turno de ${label}?\n\nEsta acción no se puede deshacer.`)) return;
    try {
      await api.deleteAppointment(a.id);
      if (selected?.id === a.id) setSelected(null);
      await load();
    } catch (err: any) {
      alert(err.message || 'No se pudo eliminar el turno');
    }
  }

  function applyDatePreset(preset: 'week' | 'month' | 'upcoming' | 'clear') {
    if (preset === 'clear') {
      setDateFrom('');
      setDateTo('');
      return;
    }
    if (preset === 'upcoming') {
      setDateFrom(todayKey());
      setDateTo('');
      return;
    }
    if (preset === 'week') {
      const r = getWeekRange();
      setDateFrom(r.from);
      setDateTo(r.to);
      return;
    }
    const r = getMonthRange();
    setDateFrom(r.from);
    setDateTo(r.to);
  }

  function openCreate(date?: string) {
    setCreateForm({
      ...EMPTY_FORM,
      appointmentDate: date || selectedDate || todayKey(),
      appointmentTime: slotTimes[0] || '16:30',
      serviceId: services[0]?.id || '',
    });
    setCreateError('');
    setShowCreate(true);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setCreateError('');
    try {
      const payload: Record<string, unknown> = {
        serviceId: createForm.serviceId,
        appointmentDate: createForm.appointmentDate,
        appointmentTime: createForm.appointmentTime,
        customerName: createForm.customerName.trim(),
        customerPhone: createForm.customerPhone.trim(),
        status: createForm.status,
        customerNotes: createForm.customerNotes.trim() || null,
      };
      if (createForm.amountPaid !== '') {
        payload.amountPaid = Number(createForm.amountPaid);
      }
      const res = await api.createAppointment(payload);
      setShowCreate(false);
      setCreateForm({ ...EMPTY_FORM });
      setSelectedDate(createForm.appointmentDate);
      await load();
      setSelected(res.appointment);
    } catch (err: any) {
      setCreateError(err.message || 'No se pudo crear el turno');
    } finally {
      setSaving(false);
    }
  }

  function shiftMonth(delta: number) {
    setMonthCursor((prev) => {
      let { year, month } = prev;
      month += delta;
      if (month > 11) { month = 0; year++; }
      if (month < 0) { month = 11; year--; }
      return { year, month };
    });
  }

  function renderAppointmentCard(a: any, compact = false) {
    return (
      <button
        key={a.id}
        type="button"
        className={`${styles.apptCard} ${compact ? styles.apptCardCompact : ''}`}
        onClick={() => setSelected(a)}
      >
        <div className={styles.apptCardTime}>{a.appointmentTime}</div>
        <div className={styles.apptCardBody}>
          <div className={styles.apptCardTop}>
            <span className={styles.apptCardName}>{a.customerName || a.lead?.name || 'Sin nombre'}</span>
            {sourceBadge(a)}
          </div>
          <div className={styles.apptCardService}>{a.service?.name}</div>
        </div>
        <div className={styles.apptCardMeta}>
          {statusBadge(a.status)}
          <span className={styles.apptCardPrice}>{formatPrice(Number(a.finalPrice || 0))}</span>
        </div>
      </button>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>
            <Calendar size={24} style={{ color: '#a78bfa' }} />
            Turnos
          </h1>
          <p className={styles.subtitle}>Agenda premium · reservas WhatsApp y carga manual</p>
        </div>
        <button type="button" className={styles.primaryBtn} onClick={() => openCreate()}>
          <Plus size={18} /> Nuevo turno
        </button>
      </div>

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
          <div className={styles.statSubtext}>Este mes</div>
        </div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.viewTabs}>
          <button
            type="button"
            className={`${styles.viewTab} ${view === 'calendar' ? styles.viewTabActive : ''}`}
            onClick={() => setView('calendar')}
          >
            <LayoutGrid size={15} /> Calendario
          </button>
          <button
            type="button"
            className={`${styles.viewTab} ${view === 'list' ? styles.viewTabActive : ''}`}
            onClick={() => setView('list')}
          >
            <List size={15} /> Lista
          </button>
        </div>
        <select className={styles.filterSelect} value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">Todos los estados</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <button type="button" className={styles.refreshBtn} onClick={load} title="Actualizar">
          <RefreshCw size={16} />
        </button>
      </div>

      {view === 'list' && (
        <div className={styles.listFilters}>
          <div className={styles.listFiltersRow}>
            <label className={styles.dateFilterField}>
              <span>Desde</span>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </label>
            <label className={styles.dateFilterField}>
              <span>Hasta</span>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </label>
            <div className="volt-input-wrap">
              <Search size={15} strokeWidth={1.75} />
              <input
                type="search"
                className="volt-input"
                placeholder="Buscar cliente, teléfono o camino..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
          <div className={styles.presetRow}>
            <button type="button" className={styles.presetBtn} onClick={() => applyDatePreset('upcoming')}>
              Próximos
            </button>
            <button type="button" className={styles.presetBtn} onClick={() => applyDatePreset('week')}>
              Esta semana
            </button>
            <button type="button" className={styles.presetBtn} onClick={() => applyDatePreset('month')}>
              Este mes
            </button>
            <button type="button" className={styles.presetBtn} onClick={() => applyDatePreset('clear')}>
              Limpiar
            </button>
            <span className={styles.listResultCount}>
              {filteredList.length} turno{filteredList.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      )}

      {loading ? (
        <div className={styles.loading}>Cargando turnos...</div>
      ) : view === 'calendar' ? (
        <div className={styles.calendarLayout}>
          <div className={styles.calendarShell}>
            <div className={styles.calendarNav}>
              <button type="button" className={styles.navBtn} onClick={() => shiftMonth(-1)}>
                <ChevronLeft size={18} />
              </button>
              <div className={styles.calendarMonthLabel}>
                {MONTHS[monthCursor.month]} {monthCursor.year}
              </div>
              <button type="button" className={styles.navBtn} onClick={() => shiftMonth(1)}>
                <ChevronRight size={18} />
              </button>
              <button
                type="button"
                className={styles.todayBtn}
                onClick={() => {
                  const t = todayKey();
                  setSelectedDate(t);
                  const n = new Date();
                  setMonthCursor({ year: n.getFullYear(), month: n.getMonth() });
                }}
              >
                Hoy
              </button>
            </div>

            <div className={styles.weekdayRow}>
              {WEEKDAYS.map((d) => (
                <div key={d} className={styles.weekdayCell}>{d}</div>
              ))}
            </div>

            <div className={styles.monthGrid}>
              {monthCells.map((cell, idx) => {
                if (!cell.date) {
                  return <div key={`empty-${idx}`} className={styles.dayCellEmpty} />;
                }
                const count = byDate.get(cell.date)?.length || 0;
                const isSelected = cell.date === selectedDate;
                const isToday = cell.date === todayKey();
                const hasConfirmed = byDate.get(cell.date)?.some((a) =>
                  ['confirmado', 'senado'].includes(a.status),
                );
                const hasPending = byDate.get(cell.date)?.some((a) =>
                  ['pendiente_pago', 'pendiente_datos'].includes(a.status),
                );

                return (
                  <button
                    key={cell.date}
                    type="button"
                    className={[
                      styles.dayCell,
                      isSelected ? styles.dayCellSelected : '',
                      isToday ? styles.dayCellToday : '',
                      count > 0 ? styles.dayCellHasAppts : '',
                    ].filter(Boolean).join(' ')}
                    onClick={() => setSelectedDate(cell.date!)}
                    onDoubleClick={() => openCreate(cell.date!)}
                  >
                    <span className={styles.dayNumber}>{cell.day}</span>
                    {count > 0 && (
                      <div className={styles.dayDots}>
                        {hasConfirmed && <span className={styles.dotConfirmado} />}
                        {hasPending && <span className={styles.dotPendiente} />}
                        <span className={styles.dayCount}>{count}</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className={styles.dayPanel}>
            <div className={styles.dayPanelHeader}>
              <div>
                <h2 className={styles.dayPanelTitle}>{formatDateLabel(selectedDate)}</h2>
                <p className={styles.dayPanelSub}>
                  {dayAppointments.length} turno{dayAppointments.length !== 1 ? 's' : ''}
                </p>
              </div>
              <button type="button" className={styles.secondaryBtn} onClick={() => openCreate(selectedDate)}>
                <Plus size={16} /> Agregar
              </button>
            </div>

            {dayAppointments.length === 0 ? (
              <div className={styles.dayEmpty}>
                <CalendarDays size={36} style={{ opacity: 0.25 }} />
                <p>Sin turnos este día</p>
                <button type="button" className={styles.secondaryBtn} onClick={() => openCreate(selectedDate)}>
                  Crear turno manual
                </button>
              </div>
            ) : (
              <div className={styles.dayTimeline}>
                {dayAppointments.map((a) => renderAppointmentCard(a))}
              </div>
            )}
          </div>
        </div>
      ) : filteredList.length === 0 ? (
        <div className={styles.empty}>
          <Calendar size={48} style={{ opacity: 0.3 }} />
          <h3>Sin turnos con estos filtros</h3>
          <p>Probá ampliar el rango de fechas o limpiar los filtros.</p>
          <button type="button" className={styles.secondaryBtn} onClick={() => applyDatePreset('clear')}>
            Limpiar filtros
          </button>
        </div>
      ) : (
        <div className={styles.listView}>
          {groupedList.map(({ date, items }) => (
            <section key={date} className={styles.listGroup}>
              <header className={styles.listGroupHeader}>
                <div>
                  <h3 className={styles.listGroupTitle}>{formatDateLabel(date)}</h3>
                  <p className={styles.listGroupSub}>
                    {items.length} turno{items.length !== 1 ? 's' : ''}
                    {date === todayKey() ? ' · Hoy' : ''}
                  </p>
                </div>
                <button type="button" className={styles.secondaryBtn} onClick={() => openCreate(date)}>
                  <Plus size={14} /> Agregar
                </button>
              </header>
              <div className={styles.listGroupBody}>
                {items.map((a) => (
                  <div key={a.id} className={styles.listRow}>
                    <button type="button" className={styles.listRowMain} onClick={() => setSelected(a)}>
                      <div className={styles.listRowTime}>{a.appointmentTime}</div>
                      <div className={styles.listRowInfo}>
                        <div className={styles.listRowTop}>
                          <span className={styles.listRowName}>
                            {a.customerName || a.lead?.name || 'Sin nombre'}
                          </span>
                          {sourceBadge(a)}
                        </div>
                        <div className={styles.listRowMeta}>
                          <span>{a.service?.name}</span>
                          <span>{a.customerPhone || a.lead?.phone}</span>
                        </div>
                      </div>
                      <div className={styles.listRowEnd}>
                        {statusBadge(a.status)}
                        <span className={styles.listRowPrice}>{formatPrice(Number(a.amountPaid || 0))}</span>
                      </div>
                    </button>
                    <button
                      type="button"
                      className={styles.listRowDelete}
                      title="Eliminar turno"
                      onClick={() => handleDeleteAppointment(a)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {showCreate && (
        <VoltDrawer open onClose={() => setShowCreate(false)} width={440}>
          <div className={styles.detailHeader}>
              <h2>Nuevo turno manual</h2>
              <button type="button" className={styles.closeBtn} onClick={() => setShowCreate(false)}>
                <X size={18} />
              </button>
            </div>
            <p className={styles.createHint}>
              Los turnos manuales no pasan por el chatbot. Podés asignar el estado desde el inicio.
            </p>
            <form onSubmit={handleCreate} className={styles.createForm}>
              <div className={styles.formGrid}>
                <label className={styles.formField}>
                  <span>Camino / servicio</span>
                  <select
                    required
                    value={createForm.serviceId}
                    onChange={(e) => setCreateForm({ ...createForm, serviceId: e.target.value })}
                  >
                    <option value="">Seleccionar...</option>
                    {services.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </label>
                <label className={styles.formField}>
                  <span>Fecha</span>
                  <input
                    type="date"
                    required
                    value={createForm.appointmentDate}
                    onChange={(e) => setCreateForm({ ...createForm, appointmentDate: e.target.value })}
                  />
                </label>
                <label className={styles.formField}>
                  <span>Horario</span>
                  <select
                    value={createForm.appointmentTime}
                    onChange={(e) => setCreateForm({ ...createForm, appointmentTime: e.target.value })}
                  >
                    {slotTimes.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </label>
                <label className={styles.formField}>
                  <span>Otro horario</span>
                  <input
                    type="time"
                    value={createForm.appointmentTime}
                    onChange={(e) => setCreateForm({ ...createForm, appointmentTime: e.target.value })}
                  />
                </label>
                <label className={styles.formField}>
                  <span>Nombre del cliente</span>
                  <input
                    required
                    value={createForm.customerName}
                    onChange={(e) => setCreateForm({ ...createForm, customerName: e.target.value })}
                    placeholder="Nombre y apellido"
                  />
                </label>
                <label className={styles.formField}>
                  <span>Teléfono</span>
                  <input
                    required
                    value={createForm.customerPhone}
                    onChange={(e) => setCreateForm({ ...createForm, customerPhone: e.target.value })}
                    placeholder="549351..."
                  />
                </label>
                <label className={styles.formField}>
                  <span>Estado inicial</span>
                  <select
                    value={createForm.status}
                    onChange={(e) => setCreateForm({ ...createForm, status: e.target.value })}
                  >
                    {Object.entries(STATUS_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </label>
                <label className={styles.formField}>
                  <span>Monto pagado (opcional)</span>
                  <input
                    type="number"
                    min={0}
                    value={createForm.amountPaid}
                    onChange={(e) => setCreateForm({ ...createForm, amountPaid: e.target.value })}
                    placeholder="Auto según estado"
                  />
                </label>
              </div>
              <label className={styles.formFieldFull}>
                <span>Notas</span>
                <textarea
                  rows={3}
                  value={createForm.customerNotes}
                  onChange={(e) => setCreateForm({ ...createForm, customerNotes: e.target.value })}
                  placeholder="Preferencias, contexto, etc."
                />
              </label>
              {createError && <p className={styles.formError}>{createError}</p>}
              <div className={styles.createActions}>
                <button type="button" className={styles.secondaryBtn} onClick={() => setShowCreate(false)}>
                  Cancelar
                </button>
                <button type="submit" className={styles.primaryBtn} disabled={saving}>
                  {saving ? 'Guardando...' : 'Crear turno'}
                </button>
              </div>
            </form>
        </VoltDrawer>
      )}

      {selected && (
        <VoltDrawer open onClose={() => setSelected(null)} width={440}>
          <div className={styles.detailHeader}>
              <h2>Detalle del turno</h2>
              <button type="button" className={styles.closeBtn} onClick={() => setSelected(null)}>
                <X size={18} />
              </button>
            </div>

            <div className={styles.detailBadges}>
              {statusBadge(selected.status)}
              {sourceBadge(selected)}
            </div>

            <label className={styles.statusSelectWrap}>
              <span className={styles.statusSelectLabel}>Cambiar estado</span>
              <select
                className={styles.statusSelect}
                value={selected.status}
                onChange={(e) => handleStatusChange(selected.id, e.target.value)}
              >
                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </label>

            <div className={styles.detailSection}>
              <h3><User size={12} /> Cliente</h3>
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
              <h3><Sparkles size={12} /> Sesión</h3>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Camino</span>
                <span className={styles.detailValue}>{selected.service?.name}</span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Fecha</span>
                <span className={styles.detailValue}>{dateKey(selected.appointmentDate)}</span>
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
              <h3><CreditCard size={12} /> Pago</h3>
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
              {selected.paymentType && (
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Tipo</span>
                  <span className={styles.detailValue}>
                    {selected.paymentType === 'total' ? 'Pago total' : 'Seña'}
                  </span>
                </div>
              )}
              {selected.mpPaymentId && (
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>ID transacción MP</span>
                  <span className={styles.detailValueMono}>{selected.mpPaymentId}</span>
                </div>
              )}
            </div>

            <div className={styles.detailActions}>
              {['confirmado', 'senado'].includes(selected.status) && (
                <button
                  type="button"
                  className={`${styles.actionBtn} ${styles.actionBtnSuccess}`}
                  onClick={() => handleStatusChange(selected.id, 'completado')}
                >
                  <CheckCircle size={14} /> Completar
                </button>
              )}
              {!['cancelado', 'completado'].includes(selected.status) && (
                <button
                  type="button"
                  className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                  onClick={() => handleStatusChange(selected.id, 'cancelado')}
                >
                  <XCircle size={14} /> Cancelar
                </button>
              )}
            </div>

            <div className={styles.detailDangerZone}>
              <button
                type="button"
                className={styles.deleteBtn}
                onClick={() => handleDeleteAppointment(selected)}
              >
                <Trash2 size={14} /> Eliminar turno
              </button>
            </div>
        </VoltDrawer>
      )}
    </div>
  );
}
