'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { Bot, Save } from 'lucide-react';

export default function BotSettingsPage() {
  const { user, isSuperAdmin, isTenantAdmin } = useAuth();
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tenants, setTenants] = useState<any[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState('');

  useEffect(() => {
    if (isSuperAdmin) {
      loadTenants();
    } else if (user?.tenantId) {
      setSelectedTenantId(user.tenantId);
      loadSettings(user.tenantId);
    }
  }, [user]);

  async function loadTenants() {
    try {
      const data = await api.getTenants();
      setTenants(data.tenants);
      if (data.tenants.length > 0) {
        setSelectedTenantId(data.tenants[0].id);
        await loadSettings(data.tenants[0].id);
      }
    } catch (err) { console.error(err); }
  }

  async function loadSettings(tenantId: string) {
    setLoading(true);
    try {
      const data = await api.getBotSettings(tenantId);
      setSettings(data.settings);
    } catch (err) {
      setSettings(null);
    } finally { setLoading(false); }
  }

  async function handleSave() {
    if (!selectedTenantId || !settings) return;
    setSaving(true);
    try {
      await api.updateBotSettings(selectedTenantId, {
        systemPrompt: settings.systemPrompt,
        model: settings.model,
        temperature: settings.temperature,
        maxContextMessages: settings.maxContextMessages,
        handoffEnabled: settings.handoffEnabled,
        handoffPhoneE164: settings.handoffPhoneE164,
        handoffMessageTemplate: settings.handoffMessageTemplate,
        handoffTriggersJson: settings.handoffTriggersJson,
      });
      alert('Configuración guardada');
    } catch (err: any) { alert(err.message); }
    finally { setSaving(false); }
  }

  function updateField(field: string, value: any) {
    setSettings((prev: any) => ({ ...prev, [field]: value }));
  }

  if (!isSuperAdmin && !isTenantAdmin) return <p style={{ color: 'var(--color-text-muted)' }}>Acceso denegado</p>;

  const inputStyle = { width: '100%', padding: '8px 12px', background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text)', fontSize: '14px', outline: 'none' };
  const labelStyle = { display: 'block' as const, fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '4px', fontWeight: 500 as const };
  const sectionStyle = { background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '20px', marginBottom: '16px' };

  return (
    <div style={{ maxWidth: '720px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700 }}>Configuración del Bot</h1>
        <button onClick={handleSave} disabled={saving || !settings} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: 'var(--color-primary)', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '13px', fontWeight: 500, opacity: saving ? 0.6 : 1 }}>
          <Save size={16} /> {saving ? 'Guardando...' : 'Guardar'}
        </button>
      </div>

      {isSuperAdmin && tenants.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <label style={labelStyle}>Tenant</label>
          <select value={selectedTenantId} onChange={(e) => { setSelectedTenantId(e.target.value); loadSettings(e.target.value); }} style={inputStyle}>
            {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      )}

      {loading ? <p>Cargando...</p> : !settings ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-muted)' }}>
          <Bot size={32} /><p>No hay configuración para este tenant</p>
        </div>
      ) : (
        <>
          <div style={sectionStyle}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '16px' }}>Motor IA</h3>
            <div style={{ marginBottom: '12px' }}>
              <label style={labelStyle}>System Prompt</label>
              <textarea value={settings.systemPrompt} onChange={(e) => updateField('systemPrompt', e.target.value)} rows={6} style={{ ...inputStyle, resize: 'vertical' as const, minHeight: '120px' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
              <div>
                <label style={labelStyle}>Modelo</label>
                <select value={settings.model} onChange={(e) => updateField('model', e.target.value)} style={inputStyle}>
                  <option value="gpt-4o-mini">gpt-4o-mini</option>
                  <option value="gpt-4o">gpt-4o</option>
                  <option value="gpt-4-turbo">gpt-4-turbo</option>
                  <option value="gpt-3.5-turbo">gpt-3.5-turbo</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Temperatura</label>
                <input type="number" value={settings.temperature} onChange={(e) => updateField('temperature', parseFloat(e.target.value))} min={0} max={2} step={0.1} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Contexto (msgs)</label>
                <input type="number" value={settings.maxContextMessages} onChange={(e) => updateField('maxContextMessages', parseInt(e.target.value))} min={1} max={50} style={inputStyle} />
              </div>
            </div>
          </div>

          <div style={sectionStyle}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '16px' }}>Derivación a humano</h3>
            <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <label style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>Habilitado</label>
              <input type="checkbox" checked={settings.handoffEnabled} onChange={(e) => updateField('handoffEnabled', e.target.checked)} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <div>
                <label style={labelStyle}>Teléfono humano (E.164)</label>
                <input value={settings.handoffPhoneE164 || ''} onChange={(e) => updateField('handoffPhoneE164', e.target.value)} placeholder="5491100000000" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Keywords (separadas por coma)</label>
                <input
                  value={(settings.handoffTriggersJson?.keywords || []).join(', ')}
                  onChange={(e) => updateField('handoffTriggersJson', { ...settings.handoffTriggersJson, keywords: e.target.value.split(',').map((k: string) => k.trim()).filter(Boolean) })}
                  placeholder="humano, asesor, reclamo"
                  style={inputStyle}
                />
              </div>
            </div>
            <div>
              <label style={labelStyle}>Plantilla de mensaje</label>
              <textarea value={settings.handoffMessageTemplate || ''} onChange={(e) => updateField('handoffMessageTemplate', e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' as const }} placeholder="Te derivo con un asesor: {{wa_me_link}}" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
