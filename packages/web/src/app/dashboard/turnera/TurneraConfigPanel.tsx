'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import {
  Sparkles,
  Clock,
  CalendarX,
  CreditCard,
  MessageSquare,
  CalendarClock,
  Leaf,
  Plus,
  Edit2,
  Trash2,
  Save,
  Power,
  Mail,
} from 'lucide-react';
import styles from './page.module.css';

export type TurneraTab = 'servicios' | 'horarios' | 'bloqueos' | 'pagos' | 'avisos' | 'mensajes';
type ModalType = 'service' | 'slot' | 'rule' | null;

export const TURNERA_TABS: { id: TurneraTab; label: string; icon: typeof Sparkles }[] = [
  { id: 'servicios', label: 'Caminos', icon: Sparkles },
  { id: 'horarios', label: 'Horarios', icon: Clock },
  { id: 'bloqueos', label: 'Bloqueos', icon: CalendarX },
  { id: 'pagos', label: 'Pagos', icon: CreditCard },
  { id: 'avisos', label: 'Avisos', icon: Mail },
  { id: 'mensajes', label: 'Mensajes', icon: MessageSquare },
];

const MESSAGE_LABELS: Record<string, string> = {
  welcome: 'Bienvenida (menú principal)',
  welcome_resume: 'Retomar flujo (volver sin repetir bienvenida)',
  payment_summary: 'Resumen de pago',
  payment_pending: 'Link de pago enviado',
  confirmation: 'Confirmación post-pago',
  human_handoff: 'Derivación a humano',
  fallback: 'Respuesta fallback',
};

const WEEK_DAYS = [
  { value: 1, label: 'Lun' },
  { value: 2, label: 'Mar' },
  { value: 3, label: 'Mié' },
  { value: 4, label: 'Jue' },
  { value: 5, label: 'Vie' },
  { value: 6, label: 'Sáb' },
  { value: 0, label: 'Dom' },
];

const EMPTY_SERVICE = {
  slug: '',
  name: '',
  serviceType: '',
  shortDescription: '',
  longDescription: '',
  durationMinutes: 80,
  isActive: true,
  sortOrder: 0,
  botSummary: '',
  botRecommendationText: '',
  recommendedWhen: '',
};

const EMPTY_SLOT = { time: '16:30', durationMinutes: 80, isActive: true, sortOrder: 0 };

const EMPTY_RULE = {
  label: '',
  ruleType: 'percentage_discount' as 'percentage_discount' | 'fixed_price',
  value: 10,
  validFrom: '',
  validUntil: '',
  isActive: true,
};

function slugify(text: string) {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function linesToArray(text: string) {
  return text.split('\n').map((s) => s.trim()).filter(Boolean);
}

function arrayToLines(arr?: string[]) {
  return (arr || []).join('\n');
}

function computeEffectivePrice(basePrice: number, rules: any[]) {
  const now = new Date();
  let price = basePrice;
  for (const r of rules.filter((x) => x.isActive)) {
    const from = r.validFrom ? new Date(r.validFrom) : null;
    const until = r.validUntil ? new Date(r.validUntil) : null;
    if (from && now < from) continue;
    if (until && now > until) continue;
    if (r.ruleType === 'percentage_discount') {
      price = price * (1 - Number(r.value) / 100);
    } else if (r.ruleType === 'fixed_price') {
      price = Number(r.value);
    }
  }
  return Math.round(price);
}

export function TurneraConfigPanel({
  tab,
  onStatusChange,
}: {
  tab: TurneraTab;
  onStatusChange?: (status: { msg: string; saving: boolean }) => void;
}) {
  const [settings, setSettings] = useState<any>(null);
  const [services, setServices] = useState<any[]>([]);
  const [slots, setSlots] = useState<any[]>([]);
  const [blocks, setBlocks] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const [modal, setModal] = useState<ModalType>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [serviceForm, setServiceForm] = useState(EMPTY_SERVICE);
  const [slotForm, setSlotForm] = useState(EMPTY_SLOT);
  const [ruleForm, setRuleForm] = useState(EMPTY_RULE);
  const [blockForm, setBlockForm] = useState({ date: '', time: '', reason: '' });
  const [scheduleForm, setScheduleForm] = useState({
    sessionDurationMinutes: 80,
    bufferMinutes: 10,
    slotIntervalMinutes: 90,
    paymentLinkExpirationMinutes: 15,
    workingDays: [1, 2, 3, 4, 5] as number[],
  });
  const [policyText, setPolicyText] = useState('');
  const [hasResend, setHasResend] = useState(false);
  const [notifyEmail, setNotifyEmail] = useState('');

  useEffect(() => { loadAll(); }, []);

  useEffect(() => {
    onStatusChange?.({ msg, saving });
  }, [msg, saving, onStatusChange]);

  function flash(text: string) {
    setMsg(text);
    setTimeout(() => setMsg(''), 2500);
  }

  async function loadAll() {
    setLoading(true);
    try {
      const [s, sv, sl, bl, rl, integrationsRes] = await Promise.all([
        api.getBookingSettings(),
        api.getBookingServices(),
        api.getBookingSlots(),
        api.getBookingBlocks(),
        api.getBookingPriceRules(),
        api.getIntegrations().catch(() => ({ integrations: [] })),
      ]);
      const st = s.settings;
      setSettings(st);
      setServices(sv.services || []);
      setSlots(sl.slots || []);
      setBlocks(bl.blocks || []);
      setRules(rl.rules || []);
      const resend = integrationsRes.integrations?.find((i: any) => i.type === 'resend' && i.status === 'active');
      setHasResend(!!resend);
      if (st) {
        setNotifyEmail(st.confirmNotifyEmail || '');
        setScheduleForm({
          sessionDurationMinutes: st.sessionDurationMinutes,
          bufferMinutes: st.bufferMinutes,
          slotIntervalMinutes: st.slotIntervalMinutes,
          paymentLinkExpirationMinutes: st.paymentLinkExpirationMinutes,
          workingDays: (st.workingDaysJson as number[]) || [1, 2, 3, 4, 5],
        });
        setPolicyText((st.cancellationPolicyJson as any)?.policy_short_text || '');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings(patch: any) {
    setSaving(true);
    try {
      const res = await api.updateBookingSettings(patch);
      setSettings(res.settings);
      flash('Guardado');
    } catch (e: any) {
      setMsg(e.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  async function saveSchedule() {
    await saveSettings({
      sessionDurationMinutes: scheduleForm.sessionDurationMinutes,
      bufferMinutes: scheduleForm.bufferMinutes,
      slotIntervalMinutes: scheduleForm.slotIntervalMinutes,
      paymentLinkExpirationMinutes: scheduleForm.paymentLinkExpirationMinutes,
      workingDaysJson: scheduleForm.workingDays,
    });
  }

  async function savePolicy() {
    await saveSettings({
      cancellationPolicyJson: {
        ...(settings?.cancellationPolicyJson || {}),
        policy_short_text: policyText,
      },
    });
  }

  function openServiceModal(service?: any) {
    if (service) {
      setEditingId(service.id);
      setServiceForm({
        slug: service.slug,
        name: service.name,
        serviceType: service.serviceType || '',
        shortDescription: service.shortDescription || '',
        longDescription: service.longDescription || '',
        durationMinutes: service.durationMinutes || 80,
        isActive: service.isActive,
        sortOrder: service.sortOrder || 0,
        botSummary: service.botSummary || '',
        botRecommendationText: service.botRecommendationText || '',
        recommendedWhen: arrayToLines(service.recommendedWhen),
      });
    } else {
      setEditingId(null);
      setServiceForm({ ...EMPTY_SERVICE, sortOrder: services.length });
    }
    setModal('service');
  }

  async function saveService() {
    if (!serviceForm.name.trim()) return alert('El nombre es obligatorio');
    setSaving(true);
    try {
      const payload = {
        slug: serviceForm.slug || slugify(serviceForm.name),
        name: serviceForm.name,
        serviceType: serviceForm.serviceType || null,
        shortDescription: serviceForm.shortDescription || null,
        longDescription: serviceForm.longDescription || null,
        durationMinutes: serviceForm.durationMinutes,
        isActive: serviceForm.isActive,
        sortOrder: serviceForm.sortOrder,
        botSummary: serviceForm.botSummary || null,
        botRecommendationText: serviceForm.botRecommendationText || null,
        recommendedWhen: linesToArray(serviceForm.recommendedWhen),
        usesBasePrice: true,
      };
      if (editingId) {
        await api.updateBookingService(editingId, payload);
      } else {
        await api.createBookingService(payload);
      }
      setModal(null);
      await loadAll();
      flash('Camino guardado');
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleServiceActive(service: any) {
    await api.updateBookingService(service.id, { isActive: !service.isActive });
    await loadAll();
  }

  async function deleteService(id: string) {
    if (!confirm('¿Eliminar este camino?')) return;
    await api.deleteBookingService(id);
    await loadAll();
    flash('Eliminado');
  }

  function openSlotModal(slot?: any) {
    if (slot) {
      setEditingId(slot.id);
      setSlotForm({
        time: slot.time,
        durationMinutes: slot.durationMinutes || scheduleForm.sessionDurationMinutes,
        isActive: slot.isActive,
        sortOrder: slot.sortOrder || 0,
      });
    } else {
      setEditingId(null);
      setSlotForm({ ...EMPTY_SLOT, sortOrder: slots.length, durationMinutes: scheduleForm.sessionDurationMinutes });
    }
    setModal('slot');
  }

  async function saveSlot() {
    if (!/^\d{2}:\d{2}$/.test(slotForm.time)) return alert('Formato de hora: HH:MM');
    setSaving(true);
    try {
      if (editingId) {
        await api.updateBookingSlot(editingId, slotForm);
      } else {
        await api.createBookingSlot(slotForm);
      }
      setModal(null);
      await loadAll();
      flash('Horario guardado');
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleSlotActive(slot: any) {
    await api.updateBookingSlot(slot.id, { isActive: !slot.isActive });
    await loadAll();
  }

  async function deleteSlot(id: string) {
    if (!confirm('¿Eliminar este horario?')) return;
    await api.deleteBookingSlot(id);
    await loadAll();
  }

  async function addBlock() {
    if (!blockForm.date) return alert('Seleccioná una fecha');
    setSaving(true);
    try {
      await api.createBookingBlock({
        date: blockForm.date,
        time: blockForm.time || null,
        reason: blockForm.reason || null,
      });
      setBlockForm({ date: '', time: '', reason: '' });
      await loadAll();
      flash('Bloqueo agregado');
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteBlock(id: string) {
    if (!confirm('¿Quitar este bloqueo?')) return;
    await api.deleteBookingBlock(id);
    await loadAll();
  }

  function openRuleModal(rule?: any) {
    if (rule) {
      setEditingId(rule.id);
      setRuleForm({
        label: rule.label,
        ruleType: rule.ruleType,
        value: Number(rule.value),
        validFrom: rule.validFrom ? rule.validFrom.slice(0, 10) : '',
        validUntil: rule.validUntil ? rule.validUntil.slice(0, 10) : '',
        isActive: rule.isActive,
      });
    } else {
      setEditingId(null);
      setRuleForm({ ...EMPTY_RULE });
    }
    setModal('rule');
  }

  async function saveRule() {
    if (!ruleForm.label.trim()) return alert('El nombre de la promo es obligatorio');
    setSaving(true);
    try {
      const payload: any = {
        label: ruleForm.label,
        ruleType: ruleForm.ruleType,
        value: ruleForm.value,
        isActive: ruleForm.isActive,
        validFrom: ruleForm.validFrom ? new Date(ruleForm.validFrom + 'T12:00:00').toISOString() : null,
        validUntil: ruleForm.validUntil ? new Date(ruleForm.validUntil + 'T23:59:59').toISOString() : null,
      };
      if (editingId) {
        await api.updateBookingPriceRule(editingId, payload);
      } else {
        await api.createBookingPriceRule(payload);
      }
      setModal(null);
      await loadAll();
      flash('Promo guardada');
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleRuleActive(rule: any) {
    await api.updateBookingPriceRule(rule.id, { isActive: !rule.isActive });
    await loadAll();
  }

  async function deleteRule(id: string) {
    if (!confirm('¿Eliminar esta regla promocional?')) return;
    await api.deleteBookingPriceRule(id);
    await loadAll();
  }

  function toggleWorkingDay(day: number) {
    setScheduleForm((prev) => ({
      ...prev,
      workingDays: prev.workingDays.includes(day)
        ? prev.workingDays.filter((d) => d !== day)
        : [...prev.workingDays, day].sort(),
    }));
  }

  const effectivePrice = useMemo(() => {
    if (!settings) return 0;
    return computeEffectivePrice(Number(settings.basePrice || 0), rules);
  }, [settings, rules]);

  function renderModal() {
    if (!modal) return null;

    if (modal === 'service') {
      return (
        <>
          <div className={styles.modalBackdrop} onClick={() => setModal(null)} />
          <div className={styles.modal}>
            <h2>{editingId ? 'Editar camino' : 'Nuevo camino'}</h2>
            <div className={styles.formGroup}>
              <label>Nombre</label>
              <input className={styles.formInput} value={serviceForm.name}
                onChange={(e) => setServiceForm((f) => ({ ...f, name: e.target.value, slug: f.slug || slugify(e.target.value) }))} />
            </div>
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label>Slug (URL interna)</label>
                <input className={styles.formInput} value={serviceForm.slug}
                  onChange={(e) => setServiceForm((f) => ({ ...f, slug: e.target.value }))} />
              </div>
              <div className={styles.formGroup}>
                <label>Tipo</label>
                <input className={styles.formInput} value={serviceForm.serviceType}
                  onChange={(e) => setServiceForm((f) => ({ ...f, serviceType: e.target.value }))} placeholder="Reflexología holística" />
              </div>
            </div>
            <div className={styles.formGroup}>
              <label>Descripción corta</label>
              <textarea className={styles.formTextarea} rows={2} value={serviceForm.shortDescription}
                onChange={(e) => setServiceForm((f) => ({ ...f, shortDescription: e.target.value }))} />
            </div>
            <div className={styles.formGroup}>
              <label>Descripción larga (opcional)</label>
              <textarea className={styles.formTextarea} rows={3} value={serviceForm.longDescription}
                onChange={(e) => setServiceForm((f) => ({ ...f, longDescription: e.target.value }))} />
            </div>
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label>Duración (min)</label>
                <input className={styles.formInput} type="number" value={serviceForm.durationMinutes}
                  onChange={(e) => setServiceForm((f) => ({ ...f, durationMinutes: Number(e.target.value) }))} />
              </div>
              <div className={styles.formGroup}>
                <label>Orden</label>
                <input className={styles.formInput} type="number" value={serviceForm.sortOrder}
                  onChange={(e) => setServiceForm((f) => ({ ...f, sortOrder: Number(e.target.value) }))} />
              </div>
            </div>
            <div className={styles.formGroup}>
              <label>Resumen para el bot</label>
              <textarea className={styles.formTextarea} rows={2} value={serviceForm.botSummary}
                onChange={(e) => setServiceForm((f) => ({ ...f, botSummary: e.target.value }))} />
            </div>
            <div className={styles.formGroup}>
              <label>Texto de recomendación</label>
              <textarea className={styles.formTextarea} rows={2} value={serviceForm.botRecommendationText}
                onChange={(e) => setServiceForm((f) => ({ ...f, botRecommendationText: e.target.value }))} />
            </div>
            <div className={styles.formGroup}>
              <label>Recomendado cuando (una línea por ítem)</label>
              <textarea className={styles.formTextarea} rows={3} value={serviceForm.recommendedWhen}
                onChange={(e) => setServiceForm((f) => ({ ...f, recommendedWhen: e.target.value }))} />
            </div>
            <div className={styles.checkboxGroup}>
              <input type="checkbox" id="svcActive" checked={serviceForm.isActive}
                onChange={(e) => setServiceForm((f) => ({ ...f, isActive: e.target.checked }))} />
              <label htmlFor="svcActive">Activo en el bot</label>
            </div>
            <div className={styles.formActions}>
              <button type="button" className={styles.cancelBtn} onClick={() => setModal(null)}>Cancelar</button>
              <button type="button" className={styles.saveBtn} onClick={saveService} disabled={saving}>
                <Save size={14} /> Guardar
              </button>
            </div>
          </div>
        </>
      );
    }

    if (modal === 'slot') {
      return (
        <>
          <div className={styles.modalBackdrop} onClick={() => setModal(null)} />
          <div className={styles.modal}>
            <h2>{editingId ? 'Editar horario' : 'Nuevo horario'}</h2>
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label>Hora (HH:MM)</label>
                <input className={styles.formInput} value={slotForm.time}
                  onChange={(e) => setSlotForm((f) => ({ ...f, time: e.target.value }))} placeholder="16:30" />
              </div>
              <div className={styles.formGroup}>
                <label>Duración (min)</label>
                <input className={styles.formInput} type="number" value={slotForm.durationMinutes}
                  onChange={(e) => setSlotForm((f) => ({ ...f, durationMinutes: Number(e.target.value) }))} />
              </div>
            </div>
            <div className={styles.checkboxGroup}>
              <input type="checkbox" id="slotActive" checked={slotForm.isActive}
                onChange={(e) => setSlotForm((f) => ({ ...f, isActive: e.target.checked }))} />
              <label htmlFor="slotActive">Disponible para reservar</label>
            </div>
            <div className={styles.formActions}>
              <button type="button" className={styles.cancelBtn} onClick={() => setModal(null)}>Cancelar</button>
              {editingId && (
                <button type="button" className={`${styles.iconBtn} ${styles.iconBtnDanger}`} onClick={() => { setModal(null); deleteSlot(editingId); }}>
                  <Trash2 size={14} /> Eliminar
                </button>
              )}
              <button type="button" className={styles.saveBtn} onClick={saveSlot} disabled={saving}>
                <Save size={14} /> Guardar
              </button>
            </div>
          </div>
        </>
      );
    }

    if (modal === 'rule') {
      return (
        <>
          <div className={styles.modalBackdrop} onClick={() => setModal(null)} />
          <div className={styles.modal}>
            <h2>{editingId ? 'Editar promo' : 'Nueva promo'}</h2>
            <div className={styles.formGroup}>
              <label>Nombre</label>
              <input className={styles.formInput} value={ruleForm.label}
                onChange={(e) => setRuleForm((f) => ({ ...f, label: e.target.value }))} placeholder="Promo lanzamiento 25% off" />
            </div>
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label>Tipo</label>
                <select className={styles.formInput} value={ruleForm.ruleType}
                  onChange={(e) => setRuleForm((f) => ({ ...f, ruleType: e.target.value as any }))}>
                  <option value="percentage_discount">% descuento</option>
                  <option value="fixed_price">Precio fijo</option>
                </select>
              </div>
              <div className={styles.formGroup}>
                <label>Valor</label>
                <input className={styles.formInput} type="number" value={ruleForm.value}
                  onChange={(e) => setRuleForm((f) => ({ ...f, value: Number(e.target.value) }))} />
              </div>
            </div>
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label>Válida desde</label>
                <input className={styles.formInput} type="date" value={ruleForm.validFrom}
                  onChange={(e) => setRuleForm((f) => ({ ...f, validFrom: e.target.value }))} />
              </div>
              <div className={styles.formGroup}>
                <label>Válida hasta</label>
                <input className={styles.formInput} type="date" value={ruleForm.validUntil}
                  onChange={(e) => setRuleForm((f) => ({ ...f, validUntil: e.target.value }))} />
              </div>
            </div>
            <div className={styles.checkboxGroup}>
              <input type="checkbox" id="ruleActive" checked={ruleForm.isActive}
                onChange={(e) => setRuleForm((f) => ({ ...f, isActive: e.target.checked }))} />
              <label htmlFor="ruleActive">Activa</label>
            </div>
            <div className={styles.formActions}>
              <button type="button" className={styles.cancelBtn} onClick={() => setModal(null)}>Cancelar</button>
              {editingId && (
                <button type="button" className={`${styles.iconBtn} ${styles.iconBtnDanger}`} onClick={() => { setModal(null); deleteRule(editingId); }}>
                  <Trash2 size={14} /> Eliminar
                </button>
              )}
              <button type="button" className={styles.saveBtn} onClick={saveRule} disabled={saving}>
                <Save size={14} /> Guardar
              </button>
            </div>
          </div>
        </>
      );
    }

    return null;
  }

  function renderContent() {
    if (loading) {
      return <div className={styles.emptyState}>Cargando configuración...</div>;
    }
    if (!settings) {
      return (
        <div className={styles.emptyState}>
          <CalendarClock size={36} style={{ opacity: 0.35 }} />
          <p>No hay configuración de turnera para este tenant</p>
        </div>
      );
    }

    switch (tab) {
      case 'servicios':
        return (
          <>
            <div className={styles.sectionHeader}>
              <div>
                <h2 className={styles.sectionTitle}>Caminos / servicios</h2>
                <p className={styles.sectionHint} style={{ marginBottom: 0 }}>
                  Editá los caminos que el bot ofrece en WhatsApp.
                </p>
              </div>
              <button type="button" className={styles.addBtn} onClick={() => openServiceModal()}>
                <Plus size={14} /> Nuevo camino
              </button>
            </div>
            {services.length === 0 ? (
              <div className={styles.emptyState}>
                <Leaf size={32} style={{ opacity: 0.35 }} />
                <p>No hay servicios — creá el primero</p>
              </div>
            ) : (
              services.map((s) => (
                <div key={s.id} className={styles.card}>
                  <div className={styles.cardHeader}>
                    <div>
                      <div className={styles.cardTitle}>{s.name}</div>
                      <div className={styles.cardSubtitle}>{s.shortDescription}</div>
                    </div>
                    <div className={styles.cardActions}>
                      <button type="button" className={styles.iconBtn} onClick={() => toggleServiceActive(s)} title={s.isActive ? 'Desactivar' : 'Activar'}>
                        <Power size={14} />
                      </button>
                      <button type="button" className={styles.iconBtn} onClick={() => openServiceModal(s)}>
                        <Edit2 size={14} />
                      </button>
                      <button type="button" className={`${styles.iconBtn} ${styles.iconBtnDanger}`} onClick={() => deleteService(s.id)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                    <span className={`${styles.badge} ${s.isActive ? styles.badgeActive : styles.badgeInactive}`}>
                      {s.isActive ? 'Activo' : 'Inactivo'}
                    </span>
                    {s.serviceType && (
                      <span className={styles.badge} style={{ background: 'rgba(139, 92, 246, 0.1)', color: '#a78bfa' }}>{s.serviceType}</span>
                    )}
                    <span className={styles.badge} style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-text-muted)' }}>
                      {s.durationMinutes} min
                    </span>
                  </div>
                </div>
              ))
            )}
          </>
        );

      case 'horarios':
        return (
          <>
            <div className={styles.sectionHeader}>
              <div>
                <h2 className={styles.sectionTitle}>Horarios y disponibilidad</h2>
                <p className={styles.sectionHint} style={{ marginBottom: 0 }}>
                  Configurá duración, días hábiles y slots ofrecidos al cliente.
                </p>
              </div>
              <button type="button" className={styles.addBtn} onClick={() => openSlotModal()}>
                <Plus size={14} /> Nuevo horario
              </button>
            </div>

            <div className={styles.toggleRow}>
              <div>
                <div className={styles.toggleLabel}>Turnera activa</div>
                <div className={styles.toggleHint}>Si está desactivada, el bot no ofrece reservas</div>
              </div>
              <input
                type="checkbox"
                checked={settings.bookingEnabled}
                onChange={(e) => saveSettings({ bookingEnabled: e.target.checked })}
                style={{ accentColor: '#8b5cf6', width: 18, height: 18 }}
              />
            </div>

            <div className={styles.settingsGrid}>
              <div className={styles.formGroup}>
                <label>Duración sesión (min)</label>
                <input className={styles.formInput} type="number" value={scheduleForm.sessionDurationMinutes}
                  onChange={(e) => setScheduleForm((f) => ({ ...f, sessionDurationMinutes: Number(e.target.value) }))} />
              </div>
              <div className={styles.formGroup}>
                <label>Margen entre sesiones (min)</label>
                <input className={styles.formInput} type="number" value={scheduleForm.bufferMinutes}
                  onChange={(e) => setScheduleForm((f) => ({ ...f, bufferMinutes: Number(e.target.value) }))} />
              </div>
              <div className={styles.formGroup}>
                <label>Intervalo entre slots (min)</label>
                <input className={styles.formInput} type="number" value={scheduleForm.slotIntervalMinutes}
                  onChange={(e) => setScheduleForm((f) => ({ ...f, slotIntervalMinutes: Number(e.target.value) }))} />
              </div>
              <div className={styles.formGroup}>
                <label>Vencimiento link pago (min)</label>
                <input className={styles.formInput} type="number" value={scheduleForm.paymentLinkExpirationMinutes}
                  onChange={(e) => setScheduleForm((f) => ({ ...f, paymentLinkExpirationMinutes: Number(e.target.value) }))} />
              </div>
            </div>

            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
              Días hábiles
            </label>
            <div className={styles.dayGrid}>
              {WEEK_DAYS.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  className={`${styles.dayChip} ${scheduleForm.workingDays.includes(d.value) ? styles.dayChipActive : ''}`}
                  onClick={() => toggleWorkingDay(d.value)}
                >
                  {d.label}
                </button>
              ))}
            </div>

            <button type="button" className={styles.saveBtn} onClick={saveSchedule} disabled={saving} style={{ marginBottom: 24 }}>
              <Save size={14} /> Guardar configuración de horarios
            </button>

            <div className={styles.slotsGrid}>
              {slots.map((sl) => (
                <div
                  key={sl.id}
                  className={`${styles.slotCard} ${styles.slotCardClickable} ${!sl.isActive ? styles.slotCardInactive : ''}`}
                  onClick={() => openSlotModal(sl)}
                >
                  <div className={styles.slotTime}>{sl.time}</div>
                  <div className={styles.slotMeta}>{sl.isActive ? 'Disponible' : 'Inactivo'}</div>
                  <button
                    type="button"
                    className={styles.iconBtn}
                    style={{ marginTop: 8, fontSize: 11 }}
                    onClick={(e) => { e.stopPropagation(); toggleSlotActive(sl); }}
                  >
                    <Power size={12} />
                  </button>
                </div>
              ))}
            </div>
          </>
        );

      case 'bloqueos':
        return (
          <>
            <h2 className={styles.sectionTitle}>Bloqueos manuales</h2>
            <p className={styles.sectionHint}>
              Bloqueá fechas o horarios puntuales donde no se ofrecen turnos.
            </p>

            <div className={styles.inlineForm}>
              <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                <label>Fecha</label>
                <input className={styles.formInput} type="date" value={blockForm.date}
                  onChange={(e) => setBlockForm((f) => ({ ...f, date: e.target.value }))} />
              </div>
              <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                <label>Hora (vacío = todo el día)</label>
                <input className={styles.formInput} value={blockForm.time} placeholder="18:00"
                  onChange={(e) => setBlockForm((f) => ({ ...f, time: e.target.value }))} />
              </div>
              <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                <label>Motivo</label>
                <input className={styles.formInput} value={blockForm.reason} placeholder="Feriado, vacaciones..."
                  onChange={(e) => setBlockForm((f) => ({ ...f, reason: e.target.value }))} />
              </div>
              <button type="button" className={styles.addBtn} onClick={addBlock} disabled={saving}>
                <Plus size={14} /> Agregar
              </button>
            </div>

            {blocks.length === 0 ? (
              <div className={styles.emptyState}>
                <CalendarX size={32} style={{ opacity: 0.35 }} />
                <p>Sin bloqueos activos</p>
              </div>
            ) : (
              blocks.map((b) => (
                <div key={b.id} className={styles.card}>
                  <div className={styles.cardHeader}>
                    <div>
                      <div className={styles.cardTitle}>
                        {b.date?.slice(0, 10)} {b.time ? `· ${b.time}` : '· Todo el día'}
                      </div>
                      <div className={styles.cardSubtitle}>{b.reason || 'Bloqueado manualmente'}</div>
                    </div>
                    <button type="button" className={`${styles.iconBtn} ${styles.iconBtnDanger}`} onClick={() => deleteBlock(b.id)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </>
        );

      case 'pagos':
        return (
          <>
            <h2 className={styles.sectionTitle}>Precios y pagos</h2>
            <p className={styles.sectionHint}>
              Los cambios impactan los montos de Mercado Pago en tiempo real para nuevos turnos.
            </p>

            <div className={styles.formGroup}>
              <label>Precio base (ARS)</label>
              <input className={styles.formInput} type="number" value={Number(settings.basePrice || 0)}
                onChange={(e) => setSettings((s: any) => ({ ...s, basePrice: Number(e.target.value) }))}
                onBlur={(e) => saveSettings({ basePrice: Number(e.target.value) })} />
            </div>

            <div className={styles.formGroup}>
              <label>Seña (%)</label>
              <input className={styles.formInput} type="number" value={settings.depositPercentage}
                onChange={(e) => setSettings((s: any) => ({ ...s, depositPercentage: Number(e.target.value) }))}
                onBlur={(e) => saveSettings({ depositPercentage: Number(e.target.value) })} />
            </div>

            <div className={styles.toggleRow}>
              <div>
                <div className={styles.toggleLabel}>Permitir pago 100%</div>
                <div className={styles.toggleHint}>El cliente puede abonar el total en lugar de la seña</div>
              </div>
              <input type="checkbox" checked={settings.allowFullPayment}
                onChange={(e) => saveSettings({ allowFullPayment: e.target.checked })}
                style={{ accentColor: '#8b5cf6', width: 18, height: 18 }} />
            </div>

            <div className={styles.toggleRow}>
              <div>
                <div className={styles.toggleLabel}>Seña no reembolsable</div>
                <div className={styles.toggleHint}>Se informa en el resumen antes del pago</div>
              </div>
              <input type="checkbox" checked={!settings.depositRefundable}
                onChange={(e) => saveSettings({ depositRefundable: !e.target.checked })}
                style={{ accentColor: '#8b5cf6', width: 18, height: 18 }} />
            </div>

            <div className={styles.toggleRow}>
              <div>
                <div className={styles.toggleLabel}>Cancelación por WhatsApp</div>
                <div className={styles.toggleHint}>
                  Si está desactivada, el cliente se deriva al contacto humano configurado en Bot/IA
                </div>
              </div>
              <input type="checkbox" checked={settings.cancelEnabled !== false}
                onChange={(e) => saveSettings({ cancelEnabled: e.target.checked })}
                style={{ accentColor: '#8b5cf6', width: 18, height: 18 }} />
            </div>

            <div className={styles.formGroup}>
              <label>Política de cancelación (texto corto)</label>
              <textarea className={styles.formTextarea} rows={2} value={policyText}
                onChange={(e) => setPolicyText(e.target.value)} onBlur={savePolicy} />
            </div>

            <div className={styles.sectionHeader} style={{ marginTop: 24 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)' }}>Reglas promocionales</h3>
              <button type="button" className={styles.addBtn} onClick={() => openRuleModal()}>
                <Plus size={14} /> Nueva promo
              </button>
            </div>

            {rules.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Sin promos — el precio base aplica siempre</p>
            ) : (
              rules.map((r) => (
                <div key={r.id} className={styles.card}>
                  <div className={styles.cardHeader}>
                    <div>
                      <div className={styles.cardTitle}>{r.label}</div>
                      <div className={styles.cardSubtitle}>
                        {r.ruleType === 'percentage_discount' ? `${r.value}% de descuento` : `Precio fijo $${Number(r.value).toLocaleString('es-AR')}`}
                        {r.validFrom && ` · desde ${r.validFrom.slice(0, 10)}`}
                        {r.validUntil && ` · hasta ${r.validUntil.slice(0, 10)}`}
                      </div>
                    </div>
                    <div className={styles.cardActions}>
                      <button type="button" className={styles.iconBtn} onClick={() => toggleRuleActive(r)}>
                        <Power size={14} />
                      </button>
                      <button type="button" className={styles.iconBtn} onClick={() => openRuleModal(r)}>
                        <Edit2 size={14} />
                      </button>
                      <button type="button" className={`${styles.iconBtn} ${styles.iconBtnDanger}`} onClick={() => deleteRule(r.id)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <span className={`${styles.badge} ${r.isActive ? styles.badgePromo : styles.badgeInactive}`} style={{ marginTop: 10 }}>
                    {r.isActive ? 'Vigente' : 'Inactiva'}
                  </span>
                </div>
              ))
            )}

            <div className={styles.pricePreview}>
              <div className={styles.pricePreviewLabel}>Precio efectivo hoy</div>
              <div className={styles.pricePreviewValue}>${effectivePrice.toLocaleString('es-AR')}</div>
              <div className={styles.pricePreviewNote}>
                Base ${Number(settings.basePrice || 0).toLocaleString('es-AR')}
                {effectivePrice < Number(settings.basePrice || 0) && ' · promo aplicada'}
              </div>
            </div>
          </>
        );

      case 'avisos':
        return (
          <>
            <h2 className={styles.sectionTitle}>Avisos de turnos confirmados</h2>
            <p className={styles.sectionHint}>
              Cuando un cliente confirma un turno por el chatbot (WhatsApp + Mercado Pago), se envía un email al equipo.
              Los turnos cargados manualmente desde el panel no disparan este aviso.
            </p>
            {!hasResend && (
              <div className={styles.infoBanner}>
                Primero configurá la integración <strong>Resend</strong> en Integraciones (API key y email remitente con dominio verificado).
              </div>
            )}
            <div className={styles.toggleRow}>
              <div>
                <div className={styles.toggleLabel}>Enviar email al confirmar turno por chatbot</div>
                <div className={styles.toggleHint}>Requiere Resend activo en Integraciones</div>
              </div>
              <input
                type="checkbox"
                checked={!!settings.confirmNotifyEnabled}
                onChange={(e) => saveSettings({ confirmNotifyEnabled: e.target.checked })}
                style={{ accentColor: '#8b5cf6', width: 18, height: 18 }}
              />
            </div>
            <div className={styles.formGroup}>
              <label>Email del equipo (destinatario)</label>
              <input
                className={styles.formInput}
                type="email"
                value={notifyEmail}
                onChange={(e) => setNotifyEmail(e.target.value)}
                onBlur={() => saveSettings({ confirmNotifyEmail: notifyEmail.trim() || null })}
                placeholder="admin@tunegocio.com"
                disabled={!settings.confirmNotifyEnabled}
              />
              <p className={styles.sectionHint} style={{ marginTop: 8, marginBottom: 0 }}>
                Incluye nombre, WhatsApp, camino, fecha, horario, pago, notas del cliente y si es primera vez.
              </p>
            </div>
          </>
        );

      case 'mensajes':
        return (
          <>
            <h2 className={styles.sectionTitle}>Mensajes del bot</h2>
            <p className={styles.sectionHint}>
              Plantillas del flujo de turnera. Variables: {'{{service}}'}, {'{{slot}}'}, {'{{price}}'}, {'{{deposit}}'}, {'{{duration}}'}.
              La bienvenida principal se usa solo en el menú madre; &quot;Retomar flujo&quot; se usa con *volver*.
            </p>
            {Object.keys(MESSAGE_LABELS).map((key) => (
              <div key={key} className={styles.formGroup}>
                <label>{MESSAGE_LABELS[key]}</label>
                <textarea
                  className={styles.formTextarea}
                  defaultValue={(settings.messagesJson || {})[key] || ''}
                  onBlur={(e) => saveSettings({
                    messagesJson: { ...(settings.messagesJson || {}), [key]: e.target.value },
                  })}
                />
              </div>
            ))}
          </>
        );

      default:
        return null;
    }
  }

  return (
    <>
      {renderContent()}
      {renderModal()}
    </>
  );
}
