'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

type Tab = 'servicios' | 'horarios' | 'bloqueos' | 'pagos' | 'mensajes';

const tabStyle = (active: boolean): React.CSSProperties => ({
  padding: '8px 14px', borderRadius: 6, border: '1px solid var(--color-border)',
  background: active ? 'var(--color-primary)' : 'var(--color-bg-secondary)',
  color: active ? '#fff' : 'inherit', cursor: 'pointer', fontSize: 13,
});

export default function TurneraConfigPage() {
  const [tab, setTab] = useState<Tab>('servicios');
  const [settings, setSettings] = useState<any>(null);
  const [services, setServices] = useState<any[]>([]);
  const [slots, setSlots] = useState<any[]>([]);
  const [blocks, setBlocks] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
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
  }

  async function saveSettings(patch: any) {
    setSaving(true);
    setMsg('');
    try {
      const res = await api.updateBookingSettings(patch);
      setSettings(res.settings);
      setMsg('Guardado');
    } catch (e: any) {
      setMsg(e.message || 'Error');
    } finally {
      setSaving(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 10px', borderRadius: 6,
    border: '1px solid var(--color-border)', background: 'var(--color-bg-secondary)', marginBottom: 8,
  };

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <h1 style={{ marginBottom: 4 }}>Configuración de turnera</h1>
      <p style={{ color: 'var(--color-text-muted)', fontSize: 14, marginBottom: 20 }}>
        Cambios acá impactan el bot y los montos de Mercado Pago en tiempo real.
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        {(['servicios', 'horarios', 'bloqueos', 'pagos', 'mensajes'] as Tab[]).map((t) => (
          <button key={t} style={tabStyle(tab === t)} onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {msg && <p style={{ color: 'var(--color-success)', fontSize: 13, marginBottom: 12 }}>{msg}</p>}

      {tab === 'servicios' && (
        <div>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 12 }}>
            Caminos / servicios disponibles para reservar.
          </p>
          {services.map((s) => (
            <div key={s.id} style={{ padding: 12, border: '1px solid var(--color-border)', borderRadius: 8, marginBottom: 8 }}>
              <strong>{s.name}</strong>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{s.shortDescription}</div>
              <div style={{ fontSize: 11, marginTop: 4 }}>{s.isActive ? '✓ Activo' : 'Inactivo'} · {s.durationMinutes} min</div>
            </div>
          ))}
        </div>
      )}

      {tab === 'horarios' && settings && (
        <div>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 12 }}>
            Cada sesión dura {settings.sessionDurationMinutes} min. Margen entre sesiones: {settings.bufferMinutes} min.
            Días: Lun–Vie.
          </p>
          {slots.map((sl) => (
            <div key={sl.id} style={{ padding: 10, border: '1px solid var(--color-border)', borderRadius: 6, marginBottom: 6 }}>
              {sl.time} {sl.isActive ? '' : '(inactivo)'}
            </div>
          ))}
        </div>
      )}

      {tab === 'bloqueos' && (
        <div>
          {blocks.length === 0 ? <p>Sin bloqueos manuales</p> : blocks.map((b) => (
            <div key={b.id} style={{ padding: 10, border: '1px solid var(--color-border)', borderRadius: 6, marginBottom: 6 }}>
              {b.date?.slice(0, 10)} {b.time || '(todo el día)'} — {b.reason || 'Bloqueado'}
            </div>
          ))}
        </div>
      )}

      {tab === 'pagos' && settings && (
        <div>
          <label style={{ fontSize: 12, fontWeight: 600 }}>Precio base (ARS)</label>
          <input style={inputStyle} type="number" defaultValue={Number(settings.basePrice || 0)}
            onBlur={(e) => saveSettings({ basePrice: Number(e.target.value) })} />
          <label style={{ fontSize: 12, fontWeight: 600 }}>Seña (%)</label>
          <input style={inputStyle} type="number" defaultValue={settings.depositPercentage}
            onBlur={(e) => saveSettings({ depositPercentage: Number(e.target.value) })} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 12 }}>
            <input type="checkbox" defaultChecked={settings.allowFullPayment}
              onChange={(e) => saveSettings({ allowFullPayment: e.target.checked })} />
            Permitir pago 100%
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 12 }}>
            <input type="checkbox" defaultChecked={!settings.depositRefundable}
              onChange={(e) => saveSettings({ depositRefundable: !e.target.checked })} />
            Seña no reembolsable
          </label>
          <h3 style={{ fontSize: 14, marginTop: 16 }}>Reglas promocionales</h3>
          {rules.map((r) => (
            <div key={r.id} style={{ fontSize: 13, padding: 8, background: 'var(--color-bg-secondary)', borderRadius: 6, marginBottom: 6 }}>
              {r.label}: {r.ruleType === 'percentage_discount' ? `${r.value}% off` : `$${r.value}`}
              {r.validUntil && ` · hasta ${r.validUntil.slice(0, 10)}`}
            </div>
          ))}
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 12 }}>
            Precio efectivo hoy con promo activa: ${Math.round(Number(settings.basePrice || 0) * 0.75).toLocaleString('es-AR')} (si 25% off vigente)
          </p>
        </div>
      )}

      {tab === 'mensajes' && settings && (
        <div>
          {['welcome', 'payment_summary', 'payment_pending', 'confirmation', 'human_handoff', 'fallback'].map((key) => (
            <div key={key} style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase' }}>{key}</label>
              <textarea
                style={{ ...inputStyle, minHeight: 100, fontFamily: 'inherit' }}
                defaultValue={(settings.messagesJson || {})[key] || ''}
                onBlur={(e) => saveSettings({
                  messagesJson: { ...(settings.messagesJson || {}), [key]: e.target.value },
                })}
              />
            </div>
          ))}
        </div>
      )}

      {saving && <p style={{ fontSize: 12 }}>Guardando...</p>}
    </div>
  );
}
