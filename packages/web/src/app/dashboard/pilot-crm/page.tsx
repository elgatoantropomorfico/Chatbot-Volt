'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Cloud, Plus, Trash2, ChevronDown, ChevronRight, GripVertical, Save, X } from 'lucide-react';
import styles from '../offers/page.module.css';

interface FieldOption {
  value: string;
  label?: string;
}

interface PilotField {
  id: string;
  localKey: string;
  pilotField: string;
  label: string;
  fieldType: string;
  isRequired: boolean;
  isActive: boolean;
  sortOrder: number;
  defaultValue: string | null;
  includeInNotes: boolean;
  optionsJson: FieldOption[];
  description: string | null;
}

const FIELD_TYPES = [
  { value: 'text', label: 'Texto' },
  { value: 'phone', label: 'Teléfono' },
  { value: 'select', label: 'Selección' },
  { value: 'boolean', label: 'Sí/No' },
  { value: 'textarea', label: 'Texto largo' },
];

const EMPTY_FIELD = {
  localKey: '',
  pilotField: '',
  label: '',
  fieldType: 'text',
  isRequired: false,
  isActive: true,
  sortOrder: 0,
  defaultValue: '',
  includeInNotes: false,
  description: '',
};

export default function PilotCrmPage() {
  const [fields, setFields] = useState<PilotField[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingField, setEditingField] = useState<PilotField | null>(null);
  const [form, setForm] = useState(EMPTY_FIELD);
  const [options, setOptions] = useState<FieldOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [tenantId, setTenantId] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const me = await api.getMe();
        if (me.user.tenantId) setTenantId(me.user.tenantId);
      } catch {}
    })();
  }, []);

  useEffect(() => { loadFields(); }, []);

  async function loadFields() {
    setLoading(true);
    try {
      const data = await api.getPilotFields();
      setFields(data.fields || []);
    } catch (err) {
      console.error('Error loading pilot fields:', err);
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditingField(null);
    setForm({ ...EMPTY_FIELD, sortOrder: fields.length });
    setOptions([]);
    setShowModal(true);
  }

  function openEdit(field: PilotField) {
    setEditingField(field);
    setForm({
      localKey: field.localKey,
      pilotField: field.pilotField,
      label: field.label,
      fieldType: field.fieldType,
      isRequired: field.isRequired,
      isActive: field.isActive,
      sortOrder: field.sortOrder,
      defaultValue: field.defaultValue || '',
      includeInNotes: field.includeInNotes,
      description: field.description || '',
    });
    setOptions(field.optionsJson || []);
    setShowModal(true);
  }

  async function handleSave() {
    if (!tenantId) return;
    setSaving(true);
    try {
      const payload = {
        tenantId,
        localKey: form.localKey,
        pilotField: form.pilotField,
        label: form.label,
        fieldType: form.fieldType,
        isRequired: form.isRequired,
        isActive: form.isActive,
        sortOrder: form.sortOrder,
        defaultValue: form.defaultValue || null,
        includeInNotes: form.includeInNotes,
        optionsJson: options,
        description: form.description || null,
      };
      if (editingField) {
        await api.updatePilotField(editingField.id, payload);
      } else {
        await api.createPilotField(payload);
      }
      setShowModal(false);
      await loadFields();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este campo?')) return;
    try {
      await api.deletePilotField(id);
      await loadFields();
    } catch (err: any) {
      alert(err.message);
    }
  }

  const requiredCount = fields.filter((f) => f.isRequired && f.isActive && f.localKey !== 'phone').length;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>
          <Cloud size={22} style={{ verticalAlign: 'middle', marginRight: 8, color: '#3b82f6' }} />
          Pilot CRM — Campos
        </h1>
        <button className={styles.addBtn} onClick={openCreate}>
          <Plus size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
          Nuevo campo
        </button>
      </div>

      <div style={{ marginBottom: 16, padding: '12px 16px', background: 'rgba(59, 130, 246, 0.08)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(59, 130, 246, 0.2)', fontSize: '13px' }}>
        <strong>{requiredCount}</strong> campos obligatorios · Credenciales API en Railway (PILOT_*)
      </div>

      {loading ? (
        <div className={styles.emptyState}>Cargando...</div>
      ) : fields.length === 0 ? (
        <div className={styles.emptyState}>
          <Cloud size={32} style={{ color: '#3b82f6' }} />
          <p>No hay campos configurados</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {fields.map((field) => {
            const expanded = expandedId === field.id;
            const opts = field.optionsJson || [];
            return (
              <div key={field.id} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', cursor: 'pointer', gap: '12px' }} onClick={() => setExpandedId(expanded ? null : field.id)}>
                  <GripVertical size={14} style={{ color: 'var(--color-text-muted)' }} />
                  {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <div style={{ flex: 1 }}>
                    <span style={{ fontWeight: 600, fontSize: '14px' }}>{field.label}</span>
                    <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontFamily: 'monospace', marginLeft: 8 }}>
                      {field.localKey} → {field.pilotField}
                    </span>
                  </div>
                  {field.isRequired && (
                    <span style={{ padding: '2px 8px', fontSize: '10px', borderRadius: 'var(--radius-sm)', background: 'rgba(251, 113, 133, 0.1)', color: '#fb7185', fontWeight: 600 }}>Requerido</span>
                  )}
                </div>
                {expanded && (
                  <div style={{ padding: '0 16px 14px', borderTop: '1px solid var(--color-border)' }}>
                    {field.description && <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: 10 }}>{field.description}</p>}
                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                      <button className={styles.editBtn} onClick={(e) => { e.stopPropagation(); openEdit(field); }}>Editar</button>
                      <button className={styles.deleteBtn} onClick={(e) => { e.stopPropagation(); handleDelete(field.id); }}>Eliminar</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <>
          <div className={styles.modalBackdrop} onClick={() => setShowModal(false)} />
          <div className={styles.modal} style={{ width: '520px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ fontSize: 18, fontWeight: 600 }}>{editingField ? 'Editar campo' : 'Nuevo campo'}</h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label>Etiqueta</label>
                <input className={styles.formInput} value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} />
              </div>
              <div className={styles.formGroup}>
                <label>Clave local</label>
                <input className={styles.formInput} value={form.localKey} onChange={(e) => setForm((f) => ({ ...f, localKey: e.target.value }))} disabled={!!editingField} />
              </div>
            </div>
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label>Campo Pilot</label>
                <input className={styles.formInput} value={form.pilotField} onChange={(e) => setForm((f) => ({ ...f, pilotField: e.target.value }))} placeholder="pilot_firstname" />
              </div>
              <div className={styles.formGroup}>
                <label>Tipo</label>
                <select className={styles.formInput} value={form.fieldType} onChange={(e) => setForm((f) => ({ ...f, fieldType: e.target.value }))}>
                  {FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
            </div>
            <div className={styles.formGroup}>
              <label>Descripción / hint</label>
              <input className={styles.formInput} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div className={styles.checkboxGroup}>
              <label><input type="checkbox" checked={form.isRequired} onChange={(e) => setForm((f) => ({ ...f, isRequired: e.target.checked }))} /> Obligatorio</label>
              <label><input type="checkbox" checked={form.includeInNotes} onChange={(e) => setForm((f) => ({ ...f, includeInNotes: e.target.checked }))} /> Incluir en notas</label>
            </div>
            <button className={styles.addBtn} onClick={handleSave} disabled={saving || !form.label || !form.localKey || !form.pilotField} style={{ marginTop: 16 }}>
              <Save size={14} /> {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
