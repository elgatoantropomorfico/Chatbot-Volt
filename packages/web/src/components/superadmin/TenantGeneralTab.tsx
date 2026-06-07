'use client';

import { useEffect, useState } from 'react';
import { Save, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { primaryBtnStyle, dangerBtnStyle, inputStyle, labelStyle } from './styles';
import type { Feedback, TenantSummary } from './types';

interface Props {
  tenant: TenantSummary;
  onRefresh: () => Promise<void>;
  onDeleted: () => Promise<void>;
  onFeedback: (feedback: Feedback) => void;
}

export function TenantGeneralTab({ tenant, onRefresh, onDeleted, onFeedback }: Props) {
  const [name, setName] = useState(tenant.name);
  const [status, setStatus] = useState(tenant.status);
  const [timezone, setTimezone] = useState(tenant.timezone || 'America/Argentina/Buenos_Aires');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setName(tenant.name);
    setStatus(tenant.status);
    setTimezone(tenant.timezone || 'America/Argentina/Buenos_Aires');
  }, [tenant]);

  async function handleSave() {
    setSaving(true);
    try {
      await api.updateTenant(tenant.id, { name, status, timezone });
      await onRefresh();
      onFeedback({ type: 'ok', text: 'Tenant actualizado correctamente' });
    } catch (err: any) {
      onFeedback({ type: 'err', text: err.message || 'Error al guardar' });
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteTenant() {
    const counts = tenant._count || {};
    if (
      !confirm(
        `¿Eliminar el tenant "${tenant.name}"?\n\n` +
          'Se borrará permanentemente:\n' +
          `• ${counts.users ?? 0} usuario(s)\n` +
          `• ${tenant.channels?.length ?? counts.channels ?? 0} canal(es) de WhatsApp\n` +
          `• ${counts.leads ?? 0} lead(s) y sus fotos\n` +
          `• ${counts.conversations ?? 0} conversación(es)\n` +
          '• Integraciones, configuración del bot, campos y ofertas\n\n' +
          'Esta acción no se puede deshacer.',
      )
    ) {
      return;
    }
    setDeleting(true);
    try {
      await api.deleteTenant(tenant.id);
      await onDeleted();
      onFeedback({ type: 'ok', text: `Tenant "${tenant.name}" eliminado` });
    } catch (err: any) {
      onFeedback({ type: 'err', text: err.message || 'Error al eliminar el tenant' });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div>
        <label style={labelStyle}>Nombre</label>
        <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
        <div>
          <label style={labelStyle}>Estado</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={inputStyle}>
            <option value="active">Activo</option>
            <option value="inactive">Inactivo</option>
            <option value="suspended">Suspendido</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>Timezone</label>
          <input value={timezone} onChange={(e) => setTimezone(e.target.value)} style={inputStyle} />
        </div>
      </div>
      <div style={{
        display: 'flex', gap: '10px', fontSize: '12px', color: 'var(--color-text-muted)',
        padding: '12px', background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-sm)',
      }}>
        <div><strong>Leads:</strong> {tenant._count?.leads || 0}</div>
        <div>·</div>
        <div><strong>Conversaciones:</strong> {tenant._count?.conversations || 0}</div>
        <div>·</div>
        <div><strong>Usuarios:</strong> {tenant._count?.users || 0}</div>
        <div>·</div>
        <div><strong>Canales:</strong> {tenant.channels?.length ?? tenant._count?.channels ?? 0}</div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={handleSave} disabled={saving} style={primaryBtnStyle}>
          <Save size={14} /> {saving ? 'Guardando...' : 'Guardar'}
        </button>
      </div>

      <div style={{
        marginTop: '8px', padding: '16px', borderRadius: 'var(--radius-sm)',
        border: '1px solid rgba(251, 113, 133, 0.25)', background: 'rgba(251, 113, 133, 0.06)',
      }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: '#fb7185', marginBottom: '6px' }}>Zona peligrosa</div>
        <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '12px', lineHeight: 1.5 }}>
          Elimina el tenant completo con todos sus usuarios, canales, leads, conversaciones y configuraciones.
        </p>
        <button type="button" onClick={handleDeleteTenant} disabled={deleting} style={dangerBtnStyle}>
          <Trash2 size={14} /> {deleting ? 'Eliminando...' : 'Eliminar tenant'}
        </button>
      </div>
    </div>
  );
}
