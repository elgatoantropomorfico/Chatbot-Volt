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
  CalendarClock,
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
  leadId: '',
  status: 'confirmado',
  amountPaid: '',
  customerNotes: '',
  /** '__list__' = sin promo; id de regla = promo elegida */
  priceRuleId: '__list__',
};

function toNum(v: unknown): number {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'string') {
    const cleaned = v.replace(/[^\d.-]/g, '');
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  }
  if (typeof v === 'object' && v !== null) {
    if ('toNumber' in v && typeof (v as { toNumber: () => number }).toNumber === 'function') {
      return (v as { toNumber: () => number }).toNumber();
    }
    // Prisma Decimal serializado
    if ('d' in v && Array.isArray((v as { d: number[] }).d)) {
      const n = Number(String((v as { d: number[] }).d.join('')));
      return Number.isFinite(n) ? n : 0;
    }
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function serviceListPrice(service: any, settings: any): number {
  if (!service) return 0;
  if (service.usesBasePrice === false || service.usesBasePrice === 'false') {
    const own = toNum(service.price);
    if (own > 0) return own;
  }
  const base = toNum(settings?.basePrice);
  if (base > 0) return base;
  return toNum(service.price);
}

function applyPriceRule(listPrice: number, rule: any | null): { finalPrice: number; label: string | null } {
  if (!rule) return { finalPrice: listPrice, label: null };
  const value = toNum(rule.value);
  let finalPrice = listPrice;
  if (rule.ruleType === 'percentage_discount') {
    finalPrice = Math.round(listPrice * (1 - value / 100));
  } else if (rule.ruleType === 'fixed_price') {
    finalPrice = value;
  }
  return { finalPrice, label: rule.label || null };
}

function isRuleActiveNow(rule: any): boolean {
  if (!rule?.isActive) return false;
  const now = Date.now();
  if (rule.validFrom && new Date(rule.validFrom).getTime() > now) return false;
  if (rule.validUntil && new Date(rule.validUntil).getTime() < now) return false;
  return true;
}

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
  const [priceRules, setPriceRules] = useState<any[]>([]);
  const [bookingSettings, setBookingSettings] = useState<any>(null);
  const [leadSuggestions, setLeadSuggestions] = useState<any[]>([]);
  const [leadSuggestOpen, setLeadSuggestOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleSlots, setRescheduleSlots] = useState<Array<{ date: string; time: string; label: string }>>([]);
  const [reschedulePick, setReschedulePick] = useState('');
  const [rescheduleError, setRescheduleError] = useState('');
  const [rescheduleSaving, setRescheduleSaving] = useState(false);

  const load = useCallback(async (opts?: { soft?: boolean }) => {
    const soft = !!opts?.soft;
    if (!soft) setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (filter) params.status = filter;
      if (dateFrom) params.from = dateFrom;
      if (dateTo) params.to = dateTo;

      if (soft) {
        const apptRes = await api.getAppointments(params);
        setAppointments(apptRes.appointments || []);
        return;
      }

      const [apptRes, svcRes, slotRes, rulesRes, settingsRes] = await Promise.all([
        api.getAppointments(params),
        api.getBookingServices(),
        api.getBookingSlots(),
        api.getBookingPriceRules().catch(() => ({ rules: [] })),
        api.getBookingSettings().catch(() => ({ settings: null })),
      ]);
      setAppointments(apptRes.appointments || []);
      setServices((svcRes.services || []).filter((s: any) => s.isActive));
      setSlots((slotRes.slots || []).filter((s: any) => s.isActive));
      setPriceRules((rulesRes.rules || []).filter(isRuleActiveNow));
      setBookingSettings(settingsRes.settings || null);
    } catch (e) {
      console.error(e);
    } finally {
      if (!soft) setLoading(false);
    }
  }, [filter, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  function upsertAppointmentLocal(appointment: any) {
    if (!appointment?.id) return;
    // Si hay filtro de estado y el turno ya no matchea, sacarlo de la lista
    if (filter && appointment.status && appointment.status !== filter) {
      setAppointments((prev) => prev.filter((a) => a.id !== appointment.id));
      setSelected((prev: any) => (prev?.id === appointment.id ? { ...prev, ...appointment } : prev));
      return;
    }
    setAppointments((prev) => {
      const idx = prev.findIndex((a) => a.id === appointment.id);
      if (idx === -1) return [appointment, ...prev];
      const next = prev.slice();
      next[idx] = { ...prev[idx], ...appointment };
      return next;
    });
    setSelected((prev: any) => (prev?.id === appointment.id ? { ...prev, ...appointment } : prev));
  }

  function removeAppointmentLocal(id: string) {
    setAppointments((prev) => prev.filter((a) => a.id !== id));
    setSelected((prev: any) => (prev?.id === id ? null : prev));
  }

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
    upsertAppointmentLocal(res.appointment);
    return res.appointment;
  }

  async function handleStatusChange(id: string, status: string) {
    const prev = appointments.find((a) => a.id === id) || selected;
    // Optimistic: el badge cambia al toque
    if (prev) upsertAppointmentLocal({ ...prev, status });
    try {
      await updateAppointment(id, { status });
    } catch (err) {
      if (prev) upsertAppointmentLocal(prev);
      throw err;
    }
  }

  async function openReschedule(a: any) {
    setRescheduleError('');
    setReschedulePick('');
    setRescheduleOpen(true);
    try {
      const data = await api.getBookingAvailability({
        limit: '40',
        excludeAppointmentId: a.id,
      });
      setRescheduleSlots(data.slots || []);
    } catch (err: any) {
      setRescheduleSlots([]);
      setRescheduleError(err.message || 'No se pudieron cargar horarios libres');
    }
  }

  async function handleReschedule() {
    if (!selected || !reschedulePick) return;
    const [date, time] = reschedulePick.split('|');
    if (!date || !time) return;
    setRescheduleSaving(true);
    setRescheduleError('');
    try {
      const res = await api.rescheduleAppointment(selected.id, { date, time });
      upsertAppointmentLocal(res.appointment);
      setRescheduleOpen(false);
    } catch (err: any) {
      setRescheduleError(err.message || 'No se pudo reprogramar');
    } finally {
      setRescheduleSaving(false);
    }
  }

  async function handleDeleteAppointment(a: any) {
    const label = `${a.customerName || a.lead?.name || 'Cliente'} — ${dateKey(a.appointmentDate)} ${a.appointmentTime}`;
    if (!confirm(`¿Eliminar el turno de ${label}?\n\nEsta acción no se puede deshacer.`)) return;
    try {
      await api.deleteAppointment(a.id);
      removeAppointmentLocal(a.id);
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
    const activeRules = priceRules.filter(isRuleActiveNow);
    setCreateForm({
      ...EMPTY_FORM,
      appointmentDate: date || selectedDate || todayKey(),
      appointmentTime: slotTimes[0] || '16:30',
      serviceId: services[0]?.id || '',
      // Por defecto aplicar la primera promo activa (si hay)
      priceRuleId: activeRules[0]?.id || '__list__',
    });
    setLeadSuggestions([]);
    setLeadSuggestOpen(false);
    setCreateError('');
    setShowCreate(true);
  }

  const createPricePreview = useMemo(() => {
    const svc = services.find((s) => s.id === createForm.serviceId);
    const list = serviceListPrice(svc, bookingSettings);
    const rule = createForm.priceRuleId === '__list__'
      ? null
      : priceRules.find((r) => r.id === createForm.priceRuleId) || null;
    const resolved = applyPriceRule(list, rule);
    return { list, ...resolved, hasService: !!svc && list > 0 };
  }, [services, bookingSettings, createForm.serviceId, createForm.priceRuleId, priceRules]);

  async function searchLeadsByName(q: string) {
    const query = q.trim();
    if (query.length < 2) {
      setLeadSuggestions([]);
      setLeadSuggestOpen(false);
      return;
    }
    try {
      const res = await api.getLeads({ search: query, limit: '8' });
      const leads = (res.leads || []).filter((l: any) => l.name || l.phone);
      setLeadSuggestions(leads);
      setLeadSuggestOpen(leads.length > 0);
    } catch {
      setLeadSuggestions([]);
      setLeadSuggestOpen(false);
    }
  }

  function pickLead(lead: any) {
    setCreateForm((prev) => ({
      ...prev,
      leadId: lead.id || '',
      customerName: lead.name || lead.fullName || prev.customerName,
      customerPhone: lead.phone || prev.customerPhone,
    }));
    setLeadSuggestOpen(false);
    setLeadSuggestions([]);
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
        priceRuleId: createForm.priceRuleId === '__list__' ? null : createForm.priceRuleId,
      };
      if (createForm.leadId) payload.leadId = createForm.leadId;
      if (createForm.amountPaid !== '') {
        payload.amountPaid = Number(createForm.amountPaid);
      }
      const res = await api.createAppointment(payload);
      setShowCreate(false);
      setCreateForm({ ...EMPTY_FORM });
      setSelectedDate(createForm.appointmentDate);
      upsertAppointmentLocal(res.appointment);
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
        <button type="button" className={styles.refreshBtn} onClick={() => load()} title="Actualizar">
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
        <VoltDrawer open onClose={() => setShowCreate(false)} width={420}>
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

            <div className={styles.formGrid}>
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
            </div>

            <label className={styles.formField}>
              <span>Otro horario</span>
              <input
                type="time"
                value={createForm.appointmentTime}
                onChange={(e) => setCreateForm({ ...createForm, appointmentTime: e.target.value })}
              />
            </label>

            <label className={`${styles.formField} ${styles.suggestField}`}>
              <span>Nombre del cliente</span>
              <input
                required
                value={createForm.customerName}
                onChange={(e) => {
                  const value = e.target.value;
                  setCreateForm({ ...createForm, customerName: value, leadId: '' });
                  void searchLeadsByName(value);
                }}
                onFocus={() => {
                  if (leadSuggestions.length) setLeadSuggestOpen(true);
                }}
                onBlur={() => {
                  setTimeout(() => setLeadSuggestOpen(false), 150);
                }}
                placeholder="Buscar existente o escribir nombre nuevo"
                autoComplete="off"
              />
              {leadSuggestOpen && leadSuggestions.length > 0 && (
                <ul className={styles.suggestList}>
                  {leadSuggestions.map((lead) => (
                    <li key={lead.id}>
                      <button
                        type="button"
                        className={styles.suggestItem}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => pickLead(lead)}
                      >
                        <strong>{lead.name || lead.fullName || 'Sin nombre'}</strong>
                        <span>{lead.phone}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </label>

            <label className={styles.formField}>
              <span>Teléfono</span>
              <input
                required
                value={createForm.customerPhone}
                onChange={(e) => setCreateForm({
                  ...createForm,
                  customerPhone: e.target.value,
                  leadId: createForm.leadId,
                })}
                placeholder="Ej: 5493511234567"
              />
            </label>

            <label className={styles.formField}>
              <span>Precio / promo</span>
              <select
                value={createForm.priceRuleId}
                onChange={(e) => setCreateForm({ ...createForm, priceRuleId: e.target.value })}
              >
                <option value="__list__">
                  Precio de lista
                  {createPricePreview.list > 0 ? ` (${formatPrice(createPricePreview.list)})` : ''}
                </option>
                {priceRules.map((rule) => {
                  const svc = services.find((s) => s.id === createForm.serviceId);
                  const list = serviceListPrice(svc, bookingSettings);
                  const { finalPrice } = applyPriceRule(list, rule);
                  return (
                    <option key={rule.id} value={rule.id}>
                      {rule.label}
                      {list > 0 ? ` — ${formatPrice(finalPrice)}` : ''}
                    </option>
                  );
                })}
              </select>
            </label>

            {createForm.serviceId && (
              <p className={createPricePreview.list > 0 ? styles.pricePreview : styles.pricePreviewWarn}>
                {createPricePreview.list > 0 ? (
                  <>
                    Cobrado en el turno:{' '}
                    <strong>{formatPrice(createPricePreview.finalPrice)}</strong>
                    {createPricePreview.label ? ` · ${createPricePreview.label}` : ' · sin promo'}
                    {createPricePreview.finalPrice !== createPricePreview.list
                      ? ` (lista ${formatPrice(createPricePreview.list)})`
                      : ''}
                  </>
                ) : (
                  <>Este servicio no tiene precio cargado. Revisalo en Turnera antes de crear el turno.</>
                )}
              </p>
            )}

            <div className={styles.formGrid}>
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
                <span>Monto pagado</span>
                <input
                  type="number"
                  min={0}
                  value={createForm.amountPaid}
                  onChange={(e) => setCreateForm({ ...createForm, amountPaid: e.target.value })}
                  placeholder={createPricePreview.list > 0 ? `Auto: ${formatPrice(createPricePreview.finalPrice)}` : 'Auto'}
                />
              </label>
            </div>

            <label className={styles.formField}>
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
                <span className={styles.detailLabel}>Precio cobrado</span>
                <span className={styles.detailValue}>
                  {formatPrice(Number(selected.finalPrice || 0))}
                  {selected.discountLabel ? ` · ${selected.discountLabel}` : ''}
                  {selected.listPrice != null && Number(selected.listPrice) !== Number(selected.finalPrice)
                    ? ` (lista ${formatPrice(Number(selected.listPrice))})`
                    : ''}
                </span>
              </div>
              {selected.discountLabel && (
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Promo aplicada</span>
                  <span className={styles.detailValue}>{selected.discountLabel}</span>
                </div>
              )}
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
              {['confirmado', 'senado'].includes(selected.status) && (
                <button
                  type="button"
                  className={styles.actionBtn}
                  onClick={() => openReschedule(selected)}
                >
                  <CalendarClock size={14} /> Reprogramar
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

            {rescheduleOpen && ['confirmado', 'senado'].includes(selected.status) && (
              <div className={styles.detailSection} style={{ marginTop: 12 }}>
                <h3><CalendarClock size={12} /> Nueva fecha (mismo cobro)</h3>
                <p style={{ fontSize: 12, opacity: 0.75, marginBottom: 8 }}>
                  Solo horarios libres. El turno se mueve in place; no se crea otro ni se toca el pago.
                </p>
                <select
                  className={styles.filterSelect}
                  value={reschedulePick}
                  onChange={(e) => setReschedulePick(e.target.value)}
                  style={{ width: '100%', marginBottom: 8 }}
                >
                  <option value="">Elegí horario…</option>
                  {rescheduleSlots.map((s) => (
                    <option key={`${s.date}|${s.time}`} value={`${s.date}|${s.time}`}>
                      {s.label}
                    </option>
                  ))}
                </select>
                {rescheduleError && (
                  <div style={{ color: '#c0392b', fontSize: 12, marginBottom: 8 }}>{rescheduleError}</div>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className={`${styles.actionBtn} ${styles.actionBtnSuccess}`}
                    disabled={!reschedulePick || rescheduleSaving}
                    onClick={handleReschedule}
                  >
                    {rescheduleSaving ? 'Guardando…' : 'Confirmar fecha'}
                  </button>
                  <button
                    type="button"
                    className={styles.actionBtn}
                    onClick={() => setRescheduleOpen(false)}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

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
