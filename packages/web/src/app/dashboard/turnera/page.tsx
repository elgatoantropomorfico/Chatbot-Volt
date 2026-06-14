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
  Info,
  Leaf,
} from 'lucide-react';
import styles from './page.module.css';

type Tab = 'servicios' | 'horarios' | 'bloqueos' | 'pagos' | 'mensajes';

const TABS: { id: Tab; label: string; icon: typeof Sparkles }[] = [
  { id: 'servicios', label: 'Caminos', icon: Sparkles },
  { id: 'horarios', label: 'Horarios', icon: Clock },
  { id: 'bloqueos', label: 'Bloqueos', icon: CalendarX },
  { id: 'pagos', label: 'Pagos', icon: CreditCard },
  { id: 'mensajes', label: 'Mensajes', icon: MessageSquare },
];

const MESSAGE_LABELS: Record<string, string> = {
  welcome: 'Bienvenida',
  payment_summary: 'Resumen de pago',
  payment_pending: 'Link de pago enviado',
  confirmation: 'Confirmación post-pago',
  human_handoff: 'Derivación a humano',
  fallback: 'Respuesta fallback',
};

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

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

export default function TurneraConfigPage() {
  const [tab, setTab] = useState<Tab>('servicios');
  const [settings, setSettings] = useState<any>(null);
  const [services, setServices] = useState<any[]>([]);
  const [slots, setSlots] = useState<any[]>([]);
  const [blocks, setBlocks] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [s, sv, sl, bl, rl] = await Promise.all([
        api.getBookingSettings(),
        api.getBookingServices(),
        api.getBookingSlots(),
        api.getBookingBlocks(),
        api.getBookingPriceRules(),
      ]);
      setSettings(s.settings);
      setServices(sv.services || []);
      setSlots(sl.slots || []);
      setBlocks(bl.blocks || []);
      setRules(rl.rules || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings(patch: any) {
    setSaving(true);
    setMsg('');
    try {
      const res = await api.updateBookingSettings(patch);
      setSettings(res.settings);
      setMsg('Guardado');
      setTimeout(() => setMsg(''), 2500);
    } catch (e: any) {
      setMsg(e.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  const effectivePrice = useMemo(() => {
    if (!settings) return 0;
    return computeEffectivePrice(Number(settings.basePrice || 0), rules);
  }, [settings, rules]);

  const workingDays = useMemo(() => {
    const days = (settings?.workingDaysJson as number[]) || [1, 2, 3, 4, 5];
    return days.map((d) => DAY_NAMES[d] || d).join(' · ');
  }, [settings]);

  const activeTab = TABS.find((t) => t.id === tab)!;

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
            <h2 className={styles.sectionTitle}>Caminos / servicios</h2>
            <p className={styles.sectionHint}>
              Los caminos que el bot ofrece en WhatsApp. Cada uno tiene duración de {settings.sessionDurationMinutes} minutos.
            </p>
            {services.length === 0 ? (
              <div className={styles.emptyState}>
                <Leaf size={32} style={{ opacity: 0.35 }} />
                <p>No hay servicios configurados</p>
              </div>
            ) : (
              services.map((s) => (
                <div key={s.id} className={styles.card}>
                  <div className={styles.cardHeader}>
                    <div>
                      <div className={styles.cardTitle}>{s.name}</div>
                      <div className={styles.cardSubtitle}>{s.shortDescription}</div>
                    </div>
                    <span className={`${styles.badge} ${s.isActive ? styles.badgeActive : styles.badgeInactive}`}>
                      {s.isActive ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                    <span className={styles.badge} style={{ background: 'rgba(139, 92, 246, 0.1)', color: '#a78bfa' }}>
                      {s.serviceType}
                    </span>
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
            <h2 className={styles.sectionTitle}>Horarios y disponibilidad</h2>
            <p className={styles.sectionHint}>
              Sesión de {settings.sessionDurationMinutes} min con {settings.bufferMinutes} min de margen entre turnos.
              Días hábiles: {workingDays}.
            </p>
            <div className={styles.infoBanner}>
              <Info size={16} style={{ flexShrink: 0, color: '#a78bfa', marginTop: 2 }} />
              <span>
                Intervalo entre slots: <strong>{settings.slotIntervalMinutes} min</strong>.
                Los links de pago vencen a los <strong>{settings.paymentLinkExpirationMinutes} min</strong>.
              </span>
            </div>
            <div className={styles.slotsGrid}>
              {slots.map((sl) => (
                <div key={sl.id} className={styles.slotCard} style={{ opacity: sl.isActive ? 1 : 0.5 }}>
                  <div className={styles.slotTime}>{sl.time}</div>
                  <div className={styles.slotMeta}>
                    {sl.isActive ? 'Disponible' : 'Inactivo'}
                  </div>
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
              Fechas u horarios bloqueados donde no se ofrecen turnos al cliente.
            </p>
            {blocks.length === 0 ? (
              <div className={styles.emptyState}>
                <CalendarX size={32} style={{ opacity: 0.35 }} />
                <p>Sin bloqueos — todos los horarios configurados están abiertos</p>
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
              <input
                className={styles.formInput}
                type="number"
                key={`base-${settings.basePrice}`}
                defaultValue={Number(settings.basePrice || 0)}
                onBlur={(e) => saveSettings({ basePrice: Number(e.target.value) })}
              />
            </div>

            <div className={styles.formGroup}>
              <label>Seña (%)</label>
              <input
                className={styles.formInput}
                type="number"
                key={`dep-${settings.depositPercentage}`}
                defaultValue={settings.depositPercentage}
                onBlur={(e) => saveSettings({ depositPercentage: Number(e.target.value) })}
              />
            </div>

            <div className={styles.toggleRow}>
              <div>
                <div className={styles.toggleLabel}>Permitir pago 100%</div>
                <div className={styles.toggleHint}>El cliente puede abonar el total en lugar de la seña</div>
              </div>
              <input
                type="checkbox"
                defaultChecked={settings.allowFullPayment}
                onChange={(e) => saveSettings({ allowFullPayment: e.target.checked })}
                style={{ accentColor: '#8b5cf6', width: 18, height: 18 }}
              />
            </div>

            <div className={styles.toggleRow}>
              <div>
                <div className={styles.toggleLabel}>Seña no reembolsable</div>
                <div className={styles.toggleHint}>Se informa en el resumen antes del pago</div>
              </div>
              <input
                type="checkbox"
                defaultChecked={!settings.depositRefundable}
                onChange={(e) => saveSettings({ depositRefundable: !e.target.checked })}
                style={{ accentColor: '#8b5cf6', width: 18, height: 18 }}
              />
            </div>

            <h3 style={{ fontSize: 14, fontWeight: 600, margin: '24px 0 12px', color: 'var(--color-text)' }}>
              Reglas promocionales
            </h3>
            {rules.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Sin promos activas</p>
            ) : (
              rules.map((r) => (
                <div key={r.id} className={styles.card}>
                  <div className={styles.cardHeader}>
                    <div>
                      <div className={styles.cardTitle}>{r.label}</div>
                      <div className={styles.cardSubtitle}>
                        {r.ruleType === 'percentage_discount' ? `${r.value}% de descuento` : `Precio fijo $${Number(r.value).toLocaleString('es-AR')}`}
                        {r.validUntil && ` · hasta ${r.validUntil.slice(0, 10)}`}
                      </div>
                    </div>
                    <span className={`${styles.badge} ${r.isActive ? styles.badgePromo : styles.badgeInactive}`}>
                      {r.isActive ? 'Vigente' : 'Inactiva'}
                    </span>
                  </div>
                </div>
              ))
            )}

            <div className={styles.pricePreview}>
              <div className={styles.pricePreviewLabel}>Precio efectivo hoy</div>
              <div className={styles.pricePreviewValue}>
                ${effectivePrice.toLocaleString('es-AR')}
              </div>
              <div className={styles.pricePreviewNote}>
                Base ${Number(settings.basePrice || 0).toLocaleString('es-AR')}
                {effectivePrice < Number(settings.basePrice || 0) && ' · promo aplicada'}
              </div>
            </div>
          </>
        );

      case 'mensajes':
        return (
          <>
            <h2 className={styles.sectionTitle}>Mensajes del bot</h2>
            <p className={styles.sectionHint}>
              Plantillas que usa el flujo de turnera en WhatsApp. Variables: {'{{service}}'}, {'{{slot}}'}, {'{{price}}'}, {'{{deposit}}'}, {'{{duration}}'}.
            </p>
            {Object.keys(MESSAGE_LABELS).map((key) => (
              <div key={key} className={styles.formGroup}>
                <label>{MESSAGE_LABELS[key]}</label>
                <textarea
                  className={styles.formTextarea}
                  key={`${key}-${JSON.stringify(settings.messagesJson?.[key])}`}
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
    <div className={styles.wrapper}>
      <div className={styles.mobileHeader}>
        <h1>Configuración de turnera</h1>
      </div>

      <div className={styles.shell}>
        <aside className={styles.sidebar}>
          <div className={styles.sidebarTitle}>Turnera</div>
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                className={`${styles.tabBtn} ${tab === t.id ? styles.tabBtnActive : ''}`}
                onClick={() => setTab(t.id)}
              >
                <Icon size={15} />
                {t.label}
              </button>
            );
          })}
        </aside>

        <div className={styles.content}>
          <div className={styles.contentHeader}>
            <h1>
              <CalendarClock size={18} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 8, color: '#a78bfa' }} />
              {activeTab.label}
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {msg && <span className={styles.saveMsg}>{msg}</span>}
              {saving && <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Guardando...</span>}
            </div>
          </div>
          <div className={styles.contentBody}>
            {renderContent()}
          </div>
        </div>
      </div>
    </div>
  );
}
