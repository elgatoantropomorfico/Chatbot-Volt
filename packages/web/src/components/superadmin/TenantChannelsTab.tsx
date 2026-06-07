'use client';

import { useState } from 'react';
import { Phone, Plus, Save, Trash2, Pencil, X, Check } from 'lucide-react';
import { api } from '@/lib/api';
import { primaryBtnStyle, dangerBtnStyle, inputStyle, labelStyle, iconBtnStyle } from './styles';
import { InlineFeedback } from './FeedbackBanner';
import type { Channel, Feedback, TenantSummary } from './types';

interface Props {
  tenant: TenantSummary;
  onRefresh: () => Promise<void>;
  onFeedback: (feedback: Feedback) => void;
}

const emptyForm = { phoneNumberId: '', wabaId: '', displayPhone: '' };

export function TenantChannelsTab({ tenant, onRefresh, onFeedback }: Props) {
  const channels = tenant.channels || [];
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [localMsg, setLocalMsg] = useState<Feedback | null>(null);

  const activeCount = channels.filter((c) => c.isActive).length;

  function startEdit(ch: Channel) {
    setEditingId(ch.id);
    setEditForm({
      phoneNumberId: ch.phoneNumberId,
      wabaId: ch.wabaId,
      displayPhone: ch.displayPhone || '',
    });
    setShowNew(false);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(emptyForm);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newForm.phoneNumberId || !newForm.wabaId) return;
    setCreating(true);
    setLocalMsg(null);
    try {
      await api.createChannel({ tenantId: tenant.id, ...newForm });
      setNewForm(emptyForm);
      setShowNew(false);
      await onRefresh();
      onFeedback({ type: 'ok', text: 'Canal creado correctamente' });
    } catch (err: any) {
      setLocalMsg({ type: 'err', text: err.message || 'Error al crear el canal' });
    } finally {
      setCreating(false);
    }
  }

  async function handleSaveEdit(channelId: string) {
    setSavingId(channelId);
    setLocalMsg(null);
    try {
      await api.updateChannel(channelId, editForm);
      cancelEdit();
      await onRefresh();
      onFeedback({ type: 'ok', text: 'Canal actualizado' });
    } catch (err: any) {
      setLocalMsg({ type: 'err', text: err.message || 'Error al actualizar' });
    } finally {
      setSavingId(null);
    }
  }

  async function handleToggle(ch: Channel) {
    setTogglingId(ch.id);
    setLocalMsg(null);
    try {
      await api.updateChannel(ch.id, { isActive: !ch.isActive });
      await onRefresh();
      onFeedback({
        type: 'ok',
        text: ch.isActive ? 'Canal desactivado' : 'Canal activado',
      });
    } catch (err: any) {
      setLocalMsg({ type: 'err', text: err.message || 'Error al cambiar estado' });
    } finally {
      setTogglingId(null);
    }
  }

  async function handleDelete(ch: Channel) {
    const label = ch.displayPhone || ch.phoneNumberId;
    if (
      !confirm(
        `¿Eliminar el canal de WhatsApp "${label}"?\n\n` +
          'Se borrarán también todas las conversaciones y mensajes de este canal. Esta acción no se puede deshacer.',
      )
    ) {
      return;
    }
    setDeletingId(ch.id);
    setLocalMsg(null);
    try {
      const res = await api.deleteChannel(ch.id);
      if (editingId === ch.id) cancelEdit();
      await onRefresh();
      const extra = res.conversationsRemoved != null ? ` (${res.conversationsRemoved} conversaciones)` : '';
      onFeedback({ type: 'ok', text: `Canal eliminado${extra}` });
    } catch (err: any) {
      setLocalMsg({ type: 'err', text: err.message || 'Error al eliminar' });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px',
      }}>
        <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
          {channels.length} canal{channels.length !== 1 ? 'es' : ''}
          {channels.length > 0 && ` · ${activeCount} activo${activeCount !== 1 ? 's' : ''}`}
        </div>
        <button
          onClick={() => { setShowNew(!showNew); cancelEdit(); }}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px', fontSize: '12px',
            background: 'linear-gradient(135deg, #7c3aed, #8b5cf6)', color: 'white', border: 'none',
            borderRadius: 'var(--radius-sm)', fontWeight: 600, cursor: 'pointer',
          }}
        >
          <Plus size={14} /> Nuevo canal
        </button>
      </div>

      {localMsg && <InlineFeedback feedback={localMsg} />}

      {showNew && (
        <form onSubmit={handleCreate} style={{
          padding: '16px', background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: '12px',
        }}>
          <div style={{ fontSize: '13px', fontWeight: 600 }}>Nuevo canal de WhatsApp</div>
          <div>
            <label style={labelStyle}>Phone Number ID (Meta)</label>
            <input value={newForm.phoneNumberId} onChange={(e) => setNewForm({ ...newForm, phoneNumberId: e.target.value })} style={inputStyle} placeholder="Ej: 1050917248094220" required />
          </div>
          <div>
            <label style={labelStyle}>WABA ID</label>
            <input value={newForm.wabaId} onChange={(e) => setNewForm({ ...newForm, wabaId: e.target.value })} style={inputStyle} placeholder="Ej: 758213103745093" required />
          </div>
          <div>
            <label style={labelStyle}>Teléfono visible</label>
            <input value={newForm.displayPhone} onChange={(e) => setNewForm({ ...newForm, displayPhone: e.target.value })} style={inputStyle} placeholder="Ej: +54 9 11 1234-5678" />
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="submit" disabled={creating} style={{ ...primaryBtnStyle, padding: '9px 18px', fontSize: '12px' }}>
              <Save size={14} /> {creating ? 'Creando...' : 'Crear canal'}
            </button>
            <button type="button" onClick={() => { setShowNew(false); setNewForm(emptyForm); }} style={{
              padding: '9px 14px', background: 'transparent', border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)', color: 'var(--color-text-muted)', cursor: 'pointer',
            }}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {channels.length === 0 && !showNew ? (
        <div style={{
          textAlign: 'center', padding: '36px 20px', color: 'var(--color-text-muted)', fontSize: '13px',
          background: 'rgba(245, 158, 11, 0.06)', border: '1px solid rgba(245, 158, 11, 0.2)',
          borderRadius: 'var(--radius-sm)',
        }}>
          <Phone size={28} style={{ marginBottom: '10px', opacity: 0.6, color: '#f59e0b' }} />
          <p>Sin canales de WhatsApp configurados</p>
          <p style={{ fontSize: '12px', marginTop: '6px' }}>Creá uno para conectar este tenant con Meta.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {channels.map((ch) => (
            <div key={ch.id} style={{
              padding: '14px 16px', background: 'var(--color-bg-secondary)',
              borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)',
            }}>
              {editingId === ch.id ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div>
                    <label style={labelStyle}>Phone Number ID</label>
                    <input value={editForm.phoneNumberId} onChange={(e) => setEditForm({ ...editForm, phoneNumberId: e.target.value })} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>WABA ID</label>
                    <input value={editForm.wabaId} onChange={(e) => setEditForm({ ...editForm, wabaId: e.target.value })} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Teléfono visible</label>
                    <input value={editForm.displayPhone} onChange={(e) => setEditForm({ ...editForm, displayPhone: e.target.value })} style={inputStyle} />
                  </div>
                  <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                    <button onClick={() => handleSaveEdit(ch.id)} disabled={savingId === ch.id} style={{ ...iconBtnStyle, color: 'var(--color-success)' }} title="Guardar">
                      <Check size={16} />
                    </button>
                    <button onClick={cancelEdit} style={{ ...iconBtnStyle, color: 'var(--color-danger)' }} title="Cancelar">
                      <X size={16} />
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                      <Phone size={15} style={{ color: ch.isActive ? '#34d399' : 'var(--color-text-muted)' }} />
                      <span style={{ fontSize: '14px', fontWeight: 600 }}>
                        {ch.displayPhone || 'Sin teléfono visible'}
                      </span>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11px', fontWeight: 500,
                        padding: '2px 8px', borderRadius: '10px',
                        background: ch.isActive ? 'rgba(52, 211, 153, 0.1)' : 'rgba(148, 163, 184, 0.1)',
                        color: ch.isActive ? '#34d399' : 'var(--color-text-muted)',
                      }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'currentColor' }} />
                        {ch.isActive ? 'Activo' : 'Inactivo'}
                      </span>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', lineHeight: 1.6 }}>
                      <div>Phone ID: {ch.phoneNumberId}</div>
                      <div>WABA ID: {ch.wabaId}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                    <button
                      onClick={() => handleToggle(ch)}
                      disabled={togglingId === ch.id}
                      title={ch.isActive ? 'Desactivar' : 'Activar'}
                      style={{
                        padding: '5px 10px', background: 'transparent', border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-sm)', color: 'var(--color-text-secondary)',
                        fontSize: '11px', cursor: 'pointer', fontWeight: 500, whiteSpace: 'nowrap',
                      }}
                    >
                      {togglingId === ch.id ? '...' : ch.isActive ? 'Desactivar' : 'Activar'}
                    </button>
                    <button onClick={() => startEdit(ch)} style={{ ...iconBtnStyle, color: 'var(--color-primary)' }} title="Editar">
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(ch)}
                      disabled={deletingId === ch.id}
                      style={{ ...iconBtnStyle, color: '#fb7185' }}
                      title="Eliminar"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
