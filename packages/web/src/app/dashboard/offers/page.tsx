'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Cloud, Plus, Trash2, ChevronDown, ChevronRight, GripVertical, Save, X } from 'lucide-react';
import styles from './page.module.css';

interface FieldOption {
  value: string;
  label?: string;
  aliases?: string[];
  slug?: string;
  keywords?: string[];
  description?: string;
}

interface ZohoField {
  id: string;
  localKey: string;
  zohoField: string;
  label: string;
  fieldType: string;
  isRequired: boolean;
  isActive: boolean;
  sortOrder: number;
  fixedValue: string | null;
  optionsJson: FieldOption[];
  description: string | null;
}

const FIELD_TYPES = [
  { value: 'single_line', label: 'Linea unica' },
  { value: 'multi_line', label: 'Multilinea' },
  { value: 'email', label: 'Correo electronico' },
  { value: 'phone', label: 'Telefono' },
  { value: 'picklist', label: 'Lista de seleccion' },
  { value: 'multi_select', label: 'Seleccion multiple' },
  { value: 'date', label: 'Fecha' },
  { value: 'datetime', label: 'Fecha/hora' },
  { value: 'number', label: 'Numero' },
  { value: 'decimal', label: 'Decimal' },
  { value: 'currency', label: 'Moneda' },
  { value: 'percent', label: 'Porcentaje' },
  { value: 'url', label: 'URL' },
  { value: 'checkbox', label: 'Casilla' },
];

const EMPTY_FIELD = {
  localKey: '',
  zohoField: '',
  label: '',
  fieldType: 'single_line',
  isRequired: false,
  isActive: true,
  sortOrder: 0,
  fixedValue: '',
  description: '',
};

export default function ZohoFieldsPage() {
  const [fields, setFields] = useState<ZohoField[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingField, setEditingField] = useState<ZohoField | null>(null);
  const [form, setForm] = useState(EMPTY_FIELD);
  const [options, setOptions] = useState<FieldOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [tenantId, setTenantId] = useState<string>('');

  useEffect(() => {
    (async () => {
      try {
        const me = await api.getMe();
        if (me.user.tenantId) setTenantId(me.user.tenantId);
      } catch {}
    })();
  }, []);

  useEffect(() => {
    loadFields();
  }, []);

  async function loadFields() {
    setLoading(true);
    try {
      const data = await api.getZohoFields();
      setFields(data.fields || []);
    } catch (err) {
      console.error('Error loading zoho fields:', err);
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

  function openEdit(field: ZohoField) {
    setEditingField(field);
    setForm({
      localKey: field.localKey,
      zohoField: field.zohoField,
      label: field.label,
      fieldType: field.fieldType,
      isRequired: field.isRequired,
      isActive: field.isActive,
      sortOrder: field.sortOrder,
      fixedValue: field.fixedValue || '',
      description: field.description || '',
    });
    setOptions(field.optionsJson || []);
    setShowModal(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const payload: any = {
        localKey: form.localKey,
        zohoField: form.zohoField,
        label: form.label,
        fieldType: form.fieldType,
        isRequired: form.isRequired,
        isActive: form.isActive,
        sortOrder: form.sortOrder,
        fixedValue: form.fixedValue || null,
        description: form.description || null,
        optionsJson: options,
      };

      if (editingField) {
        await api.updateZohoField(editingField.id, payload);
      } else {
        payload.tenantId = tenantId;
        await api.createZohoField(payload);
      }

      setShowModal(false);
      await loadFields();
    } catch (err) {
      console.error('Error saving field:', err);
      alert('Error al guardar el campo');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este campo?')) return;
    try {
      await api.deleteZohoField(id);
      await loadFields();
    } catch (err) {
      console.error('Error deleting field:', err);
    }
  }

  function addOption() {
    setOptions([...options, { value: '', aliases: [], slug: '', keywords: [], description: '' }]);
  }

  function updateOption(idx: number, patch: Partial<FieldOption>) {
    setOptions(options.map((o, i) => i === idx ? { ...o, ...patch } : o));
  }

  function removeOption(idx: number) {
    setOptions(options.filter((_, i) => i !== idx));
  }

  function typeBadgeColor(type: string) {
    if (type === 'picklist' || type === 'multi_select') return '#f59e0b';
    if (type === 'email') return '#3b82f6';
    if (type === 'phone') return '#10b981';
    if (type === 'date' || type === 'datetime') return '#8b5cf6';
    if (type === 'number' || type === 'decimal' || type === 'currency') return '#06b6d4';
    return 'var(--color-text-muted)';
  }

  const isPicklist = form.fieldType === 'picklist' || form.fieldType === 'multi_select';

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>
          <Cloud size={22} style={{ verticalAlign: 'middle', marginRight: 8, color: '#f59e0b' }} />
          Zoho CRM — Campos
        </h1>
        <button className={styles.addBtn} onClick={openCreate}>
          <Plus size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
          Nuevo campo
        </button>
      </div>

      {loading ? (
        <div className={styles.emptyState}>Cargando...</div>
      ) : fields.length === 0 ? (
        <div className={styles.emptyState}>
          <Cloud size={32} style={{ color: '#f59e0b' }} />
          <p>No hay campos configurados</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {fields.map((field) => {
            const expanded = expandedId === field.id;
            const opts = (field.optionsJson || []) as FieldOption[];
            const hasOptions = opts.length > 0;
            const isFixed = field.fixedValue !== null && field.fixedValue !== '';
            return (
              <div
                key={field.id}
                style={{
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  overflow: 'hidden',
                  transition: 'all 0.15s',
                }}
              >
                {/* Header row */}
                <div
                  style={{
                    display: 'flex', alignItems: 'center', padding: '12px 16px', cursor: 'pointer',
                    gap: '12px',
                  }}
                  onClick={() => setExpandedId(expanded ? null : field.id)}
                >
                  <GripVertical size={14} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
                  {expanded ? <ChevronDown size={14} style={{ flexShrink: 0 }} /> : <ChevronRight size={14} style={{ flexShrink: 0 }} />}

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600, fontSize: '14px' }}>{field.label}</span>
                      <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontFamily: 'monospace' }}>
                        {field.localKey} → {field.zohoField}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                    {isFixed && (
                      <span style={{ padding: '2px 8px', fontSize: '10px', borderRadius: 'var(--radius-sm)', background: 'rgba(139, 92, 246, 0.1)', color: '#a78bfa', fontWeight: 600 }}>
                        FIJO
                      </span>
                    )}
                    <span style={{
                      padding: '2px 8px', fontSize: '10px', borderRadius: 'var(--radius-sm)',
                      background: `${typeBadgeColor(field.fieldType)}15`,
                      color: typeBadgeColor(field.fieldType),
                      fontWeight: 600,
                    }}>
                      {FIELD_TYPES.find(t => t.value === field.fieldType)?.label || field.fieldType}
                    </span>
                    {hasOptions && (
                      <span style={{ padding: '2px 8px', fontSize: '10px', borderRadius: 'var(--radius-sm)', background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', fontWeight: 600 }}>
                        {opts.length} opciones
                      </span>
                    )}
                    {field.isRequired && (
                      <span style={{ padding: '2px 8px', fontSize: '10px', borderRadius: 'var(--radius-sm)', background: 'rgba(251, 113, 133, 0.1)', color: '#fb7185', fontWeight: 600 }}>
                        Requerido
                      </span>
                    )}
                    {!field.isActive && (
                      <span style={{ padding: '2px 8px', fontSize: '10px', borderRadius: 'var(--radius-sm)', background: 'var(--color-danger-light)', color: 'var(--color-danger)', fontWeight: 600 }}>
                        Inactivo
                      </span>
                    )}
                  </div>
                </div>

                {/* Expanded detail */}
                {expanded && (
                  <div style={{ padding: '0 16px 14px', borderTop: '1px solid var(--color-border)' }}>
                    {field.description && (
                      <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', margin: '10px 0 0', fontStyle: 'italic' }}>{field.description}</p>
                    )}
                    {isFixed && (
                      <div style={{ fontSize: '12px', margin: '10px 0 0' }}>
                        <strong>Valor fijo:</strong> <code style={{ background: 'var(--color-bg-secondary)', padding: '2px 6px', borderRadius: '3px' }}>{field.fixedValue}</code>
                      </div>
                    )}

                    {hasOptions && (
                      <div style={{ marginTop: '10px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Opciones de Zoho</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {opts.map((opt, i) => (
                            <div key={i} style={{
                              display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px',
                              background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-sm)', fontSize: '12px',
                            }}>
                              <span style={{ fontWeight: 600, minWidth: '100px' }}>{opt.value}</span>
                              {opt.aliases && opt.aliases.length > 0 && (
                                <span style={{ color: 'var(--color-text-muted)' }}>
                                  aliases: {opt.aliases.join(', ')}
                                </span>
                              )}
                              {opt.slug && (
                                <span style={{ color: 'var(--color-text-muted)', fontFamily: 'monospace' }}>
                                  slug: {opt.slug}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
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

      {/* Modal for create/edit */}
      {showModal && (
        <>
          <div className={styles.modalBackdrop} onClick={() => setShowModal(false)} />
          <div className={styles.modal} style={{ width: '560px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ margin: 0 }}>{editingField ? 'Editar campo' : 'Nuevo campo'}</h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            {/* Label + Local Key */}
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label>Etiqueta</label>
                <input className={styles.formInput} value={form.label} onChange={(e) => setForm(f => ({ ...f, label: e.target.value }))} placeholder="Ej: Programa" />
              </div>
              <div className={styles.formGroup}>
                <label>Clave local (Lead)</label>
                <input className={styles.formInput} value={form.localKey} onChange={(e) => setForm(f => ({ ...f, localKey: e.target.value }))} placeholder="Ej: offerInterest" disabled={!!editingField} />
              </div>
            </div>

            {/* Zoho field name + Type */}
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label>Campo Zoho (API)</label>
                <input className={styles.formInput} value={form.zohoField} onChange={(e) => setForm(f => ({ ...f, zohoField: e.target.value }))} placeholder="Ej: Programa" />
              </div>
              <div className={styles.formGroup}>
                <label>Tipo de campo</label>
                <select
                  className={styles.formInput}
                  value={form.fieldType}
                  onChange={(e) => setForm(f => ({ ...f, fieldType: e.target.value }))}
                >
                  {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
            </div>

            {/* Fixed value */}
            <div className={styles.formGroup}>
              <label>Valor fijo (opcional, si se setea se envia siempre este valor)</label>
              <input className={styles.formInput} value={form.fixedValue} onChange={(e) => setForm(f => ({ ...f, fixedValue: e.target.value }))} placeholder="Dejar vacio si se extrae de la conversacion" />
            </div>

            {/* Description */}
            <div className={styles.formGroup}>
              <label>Descripcion (opcional)</label>
              <input className={styles.formInput} value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Nota interna sobre este campo" />
            </div>

            {/* Flags */}
            <div style={{ display: 'flex', gap: '20px', marginBottom: '14px' }}>
              <div className={styles.checkboxGroup}>
                <input type="checkbox" checked={form.isRequired} onChange={(e) => setForm(f => ({ ...f, isRequired: e.target.checked }))} id="fReq" />
                <label htmlFor="fReq">Requerido para sync</label>
              </div>
              <div className={styles.checkboxGroup}>
                <input type="checkbox" checked={form.isActive} onChange={(e) => setForm(f => ({ ...f, isActive: e.target.checked }))} id="fAct" />
                <label htmlFor="fAct">Activo</label>
              </div>
              <div className={styles.formGroup} style={{ marginBottom: 0, width: '80px' }}>
                <label>Orden</label>
                <input className={styles.formInput} type="number" value={form.sortOrder} onChange={(e) => setForm(f => ({ ...f, sortOrder: parseInt(e.target.value) || 0 }))} />
              </div>
            </div>

            {/* Picklist options */}
            {isPicklist && (
              <div style={{ marginBottom: '14px', padding: '12px', background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Opciones del Picklist</span>
                  <button onClick={addOption} style={{ fontSize: '12px', padding: '4px 10px', background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.2)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontWeight: 600 }}>
                    <Plus size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />Agregar
                  </button>
                </div>

                {options.length === 0 ? (
                  <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', textAlign: 'center', padding: '10px' }}>Sin opciones. Agrega valores del picklist de Zoho.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {options.map((opt, idx) => (
                      <div key={idx} style={{ padding: '10px', background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '6px', alignItems: 'center' }}>
                          <input
                            className={styles.formInput}
                            style={{ flex: 1 }}
                            value={opt.value}
                            onChange={(e) => updateOption(idx, { value: e.target.value })}
                            placeholder="Valor Zoho (exacto)"
                          />
                          <button onClick={() => removeOption(idx)} style={{ background: 'none', border: 'none', color: 'var(--color-danger)', cursor: 'pointer', padding: '4px' }}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <input
                            className={styles.formInput}
                            style={{ flex: 1, fontSize: '12px' }}
                            value={(opt.aliases || []).join(', ')}
                            onChange={(e) => updateOption(idx, { aliases: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                            placeholder="Aliases (coma separados): hibrida, híbrida, semipresencial"
                          />
                        </div>
                        {/* Extra fields for offer-type picklists */}
                        {form.localKey === 'offerInterest' && (
                          <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                            <input
                              className={styles.formInput}
                              style={{ width: '140px', fontSize: '12px' }}
                              value={opt.slug || ''}
                              onChange={(e) => updateOption(idx, { slug: e.target.value })}
                              placeholder="Slug"
                            />
                            <input
                              className={styles.formInput}
                              style={{ flex: 1, fontSize: '12px' }}
                              value={(opt.keywords || []).join(', ')}
                              onChange={(e) => updateOption(idx, { keywords: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                              placeholder="Keywords (coma separados)"
                            />
                            <input
                              className={styles.formInput}
                              style={{ flex: 1, fontSize: '12px' }}
                              value={opt.description || ''}
                              onChange={(e) => updateOption(idx, { description: e.target.value })}
                              placeholder="Descripcion"
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className={styles.formActions}>
              <button className={styles.cancelBtn} onClick={() => setShowModal(false)}>Cancelar</button>
              <button
                className={styles.saveBtn}
                onClick={handleSave}
                disabled={saving || !form.label || !form.localKey || !form.zohoField}
              >
                <Save size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                {saving ? 'Guardando...' : editingField ? 'Actualizar' : 'Crear'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
