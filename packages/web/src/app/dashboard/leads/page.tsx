'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Users, X, RefreshCw, Trash2, Camera, FileText, Plus, Edit2, Check, ClipboardList } from 'lucide-react';
import styles from './page.module.css';

const STAGES = ['', 'nuevo', 'contactado', 'interesado', 'venta', 'perdido'];
const STAGE_LABELS: Record<string, string> = {
  '': 'Todos',
  nuevo: 'Nuevo',
  contactado: 'Contactado',
  interesado: 'Interesado',
  venta: 'Venta',
  perdido: 'Perdido',
};

function getStageBadgeClass(stage: string) {
  const map: Record<string, string> = {
    nuevo: styles.stageNuevo,
    contactado: styles.stageContactado,
    interesado: styles.stageInteresado,
    venta: styles.stageVenta,
    perdido: styles.stagePerdido,
  };
  return map[stage] || '';
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [stage, setStage] = useState('');
  const [search, setSearch] = useState('');
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [noteText, setNoteText] = useState('');
  const [loading, setLoading] = useState(true);
  const [hasZoho, setHasZoho] = useState(false);
  const [hasPilot, setHasPilot] = useState(false);
  const [zohoFields, setZohoFields] = useState<any[]>([]);
  const [pilotFields, setPilotFields] = useState<any[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [pilotSyncing, setPilotSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [pilotSyncMsg, setPilotSyncMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [leadFieldConfigs, setLeadFieldConfigs] = useState<any[]>([]);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  useEffect(() => {
    loadLeads();
  }, [page, stage]);

  useEffect(() => {
    (async () => {
      try {
        const { integrations } = await api.getIntegrations();
        const zoho = integrations.find((i: any) => i.type === 'zoho_crm' && i.status === 'active');
        setHasZoho(!!zoho);
        if (zoho) {
          const { fields } = await api.getZohoFields();
          setZohoFields((fields || []).filter((f: any) => f.isActive && !f.localKey.startsWith('_fixed_') && f.localKey !== 'phone'));
        }
        const pilot = integrations.find((i: any) => i.type === 'pilot_crm' && i.status === 'active');
        setHasPilot(!!pilot);
        if (pilot) {
          const { fields } = await api.getPilotFields();
          setPilotFields((fields || []).filter((f: any) => f.isActive && f.localKey !== 'phone'));
        }
      } catch {}
      try {
        const { fields } = await api.getLeadFieldConfigs();
        setLeadFieldConfigs((fields || []).filter((f: any) => f.isActive));
      } catch {}
    })();
  }, []);

  async function loadLeads() {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), limit: '15' };
      if (stage) params.stage = stage;
      if (search) params.search = search;
      const data = await api.getLeads(params);
      setLeads(data.leads);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch (err) {
      console.error('Error loading leads:', err);
    } finally {
      setLoading(false);
    }
  }

  async function selectLead(id: string) {
    // Show panel instantly with list data
    const fromList = leads.find((l) => l.id === id);
    if (fromList) setSelectedLead(fromList);
    // Then enrich with full detail (notes, conversations, etc.)
    try {
      const data = await api.getLead(id);
      setSelectedLead(data.lead);
    } catch (err) {
      console.error('Error loading lead:', err);
    }
  }

  async function updateStage(leadId: string, newStage: string) {
    try {
      await api.updateLead(leadId, { stage: newStage });
      await selectLead(leadId);
      await loadLeads();
    } catch (err) {
      console.error('Error updating lead:', err);
    }
  }

  async function addNote() {
    if (!selectedLead || !noteText.trim()) return;
    try {
      await api.addLeadNote(selectedLead.id, noteText.trim());
      setNoteText('');
      await selectLead(selectedLead.id);
    } catch (err) {
      console.error('Error adding note:', err);
    }
  }

  function handleSearch() {
    setPage(1);
    loadLeads();
  }

  async function syncToZoho() {
    if (!selectedLead) return;
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await api.syncLeadToZoho(selectedLead.id);
      setSyncMsg({ type: 'ok', text: res.message });
      await selectLead(selectedLead.id);
    } catch (err: any) {
      setSyncMsg({ type: 'err', text: err.message || 'Error al sincronizar' });
    } finally {
      setSyncing(false);
    }
  }

  async function syncToPilot() {
    if (!selectedLead) return;
    setPilotSyncing(true);
    setPilotSyncMsg(null);
    try {
      const res = await api.syncLeadToPilot(selectedLead.id);
      setPilotSyncMsg({ type: 'ok', text: res.message });
      await selectLead(selectedLead.id);
    } catch (err: any) {
      setPilotSyncMsg({ type: 'err', text: err.message || 'Error al sincronizar' });
    } finally {
      setPilotSyncing(false);
    }
  }

  function getPilotVal(lead: any, key: string) {
    const colMap: Record<string, string> = { fname: 'firstName', lname: 'lastName', product: 'offerInterest' };
    if (colMap[key]) return lead[colMap[key]] || '';
    return (lead.customData as any)?.[key] || '';
  }

  async function savePilotField(key: string, value: string) {
    if (!selectedLead) return;
    const colMap: Record<string, string> = { fname: 'firstName', lname: 'lastName', product: 'offerInterest' };
    try {
      if (colMap[key]) {
        const patch: any = { [colMap[key]]: value || null };
        await api.updateLead(selectedLead.id, patch);
        setSelectedLead({ ...selectedLead, [colMap[key]]: value || null });
      } else {
        const customData = { ...(selectedLead.customData || {}), [key]: value || null };
        await api.updateLead(selectedLead.id, { customData });
        setSelectedLead({ ...selectedLead, customData });
      }
    } catch (err) {
      console.error('Error saving pilot field:', err);
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.listPanel}>
        <div className={styles.header}>
          <h1>Leads</h1>
          <span style={{ color: 'var(--color-text-muted)', fontSize: '14px' }}>{total} leads</span>
        </div>

        <div className={styles.searchBar}>
          <input
            className={styles.searchInput}
            placeholder="Buscar por nombre o teléfono..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
        </div>

        <div className={styles.stageFilters}>
          {STAGES.map((s) => (
            <button
              key={s}
              className={`${styles.stageBtn} ${stage === s ? styles.stageBtnActive : ''}`}
              onClick={() => { setStage(s); setPage(1); }}
            >
              {STAGE_LABELS[s]}
            </button>
          ))}
        </div>

        {loading ? (
          <div className={styles.emptyState}>Cargando...</div>
        ) : leads.length === 0 ? (
          <div className={styles.emptyState}>
            <Users size={32} />
            <p>No se encontraron leads</p>
          </div>
        ) : (
          <>
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Teléfono</th>
                    <th>Stage</th>
                    <th>Agente</th>
                    <th>Último msg</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead) => (
                    <tr key={lead.id} onClick={() => selectLead(lead.id)}>
                      <td>{lead.name || '—'}</td>
                      <td>{lead.phone}</td>
                      <td>
                        <span className={`${styles.stageBadge} ${getStageBadgeClass(lead.stage)}`}>
                          {STAGE_LABELS[lead.stage] || lead.stage}
                        </span>
                      </td>
                      <td>{lead.assignedUser?.email || '—'}</td>
                      <td>
                        {lead.lastMessageAt
                          ? new Date(lead.lastMessageAt).toLocaleDateString('es-AR')
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className={styles.pagination}>
              <button className={styles.pageBtn} disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Anterior
              </button>
              <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)', padding: '6px' }}>
                {page} / {totalPages}
              </span>
              <button className={styles.pageBtn} disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                Siguiente
              </button>
            </div>
          </>
        )}
      </div>

      {/* Detail panel overlay */}
      {selectedLead && (
        <>
          <div className={styles.detailBackdrop} onClick={() => setSelectedLead(null)} />
          <div className={styles.detailPanel}>
            <div className={styles.detailHeader}>
              <div>
                <h2>{selectedLead.name || selectedLead.phone}</h2>
                <p>{selectedLead.phone}</p>
              </div>
              <button className={styles.detailCloseBtn} onClick={() => setSelectedLead(null)}>
                <X size={18} />
              </button>
            </div>

          <div className={styles.detailSection}>
            <h3>Información</h3>
            <div className={styles.detailField}>
              <span>Stage</span>
              <select
                value={selectedLead.stage}
                onChange={(e) => updateStage(selectedLead.id, e.target.value)}
                style={{
                  background: 'var(--color-bg-secondary)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--color-text)',
                  padding: '2px 8px',
                  fontSize: '12px',
                }}
              >
                {STAGES.filter(Boolean).map((s) => (
                  <option key={s} value={s}>{STAGE_LABELS[s]}</option>
                ))}
              </select>
            </div>
            <div className={styles.detailField}>
              <span>Agente</span>
              <span>{selectedLead.assignedUser?.email || 'Sin asignar'}</span>
            </div>
            <div className={styles.detailField}>
              <span>Canal</span>
              <span>{selectedLead.channel?.displayPhone || '—'}</span>
            </div>
            <div className={styles.detailField}>
              <span>Conversaciones</span>
              <span>{selectedLead.conversations?.length || 0}</span>
            </div>
            <div className={styles.detailField}>
              <span>Creado</span>
              <span>{new Date(selectedLead.createdAt).toLocaleDateString('es-AR')}</span>
            </div>
          </div>

          {/* Lead-scoped data (DNI, obra social marked as scope=lead, etc.) */}
          {leadFieldConfigs.length > 0 && (() => {
            const tenantConfigs = leadFieldConfigs.filter(
              (f: any) => f.tenantId === selectedLead.tenantId && (f.scope || 'request') === 'lead'
            );
            if (tenantConfigs.length === 0) return null;
            const customData = (typeof selectedLead.customData === 'string' ? JSON.parse(selectedLead.customData) : selectedLead.customData) || {};
            const textFields = tenantConfigs.filter((f: any) => f.fieldType !== 'photo' && f.fieldType !== 'multi_photo');
            const getFieldValue = (fieldKey: string): string | null => {
              const cd = customData[fieldKey];
              if (cd != null && cd !== '') return String(cd);
              const std = (selectedLead as any)[fieldKey];
              if (std != null && std !== '') return String(std);
              return null;
            };
            const filled = textFields.filter((f: any) => getFieldValue(f.fieldKey) != null).length;
            return (
              <div className={styles.detailSection}>
                <h3 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><FileText size={12} /> Datos del lead</span>
                  <span style={{ fontSize: '10px', fontWeight: 500, color: filled === textFields.length ? 'var(--color-success)' : 'var(--color-warning)', textTransform: 'none', letterSpacing: 0 }}>
                    {filled}/{textFields.length} campos
                  </span>
                </h3>
                {textFields.map((f: any) => {
                  const value = getFieldValue(f.fieldKey);
                  return (
                    <div key={f.fieldKey} className={styles.detailField}>
                      <span>{f.label}</span>
                      {value ? (
                        <span className={styles.customDataValue}>{value}</span>
                      ) : (
                        <span className={styles.customDataEmpty}>Sin dato</span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* Solicitudes (turnos / presupuestos) */}
          <LeadRequestsPanel
            lead={selectedLead}
            fieldConfigs={leadFieldConfigs.filter((f: any) => f.tenantId === selectedLead.tenantId)}
            onChange={() => selectLead(selectedLead.id)}
            onPhotoClick={(url) => setPhotoPreview(url)}
          />

          {/* Legacy photos that were never associated to a request (pre-migration leftovers) */}
          {selectedLead.photos && selectedLead.photos.filter((p: any) => !p.requestId).length > 0 && (
            <div className={styles.detailSection}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <Camera size={12} /> Fotos sin solicitud
              </h3>
              <div className={styles.photoGrid}>
                {selectedLead.photos.filter((p: any) => !p.requestId).map((photo: any) => {
                  const fieldConfig = leadFieldConfigs.find((f: any) => f.fieldKey === photo.fieldKey);
                  return (
                    <div key={photo.id} className={styles.photoThumb} onClick={() => setPhotoPreview(photo.url)}>
                      <img src={photo.url} alt={photo.caption || photo.fieldKey} loading="lazy" />
                      <div className={styles.photoFieldLabel}>
                        {fieldConfig?.label || photo.fieldKey}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {hasZoho && (() => {
            const editableFields = zohoFields.filter((f: any) => f.localKey !== 'phone');
            const allFields = zohoFields;
            const getVal = (key: string) => (selectedLead as any)[key] || '';
            const filled = allFields.filter((f: any) => f.localKey !== 'phone' && getVal(f.localKey)).length;
            const total = editableFields.length;

            const inputStyle: React.CSSProperties = {
              width: '100%', padding: '4px 8px', fontSize: '12px',
              background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)', color: 'var(--color-text)', outline: 'none',
            };
            const selectStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer' };

            async function saveField(key: string, value: string) {
              try {
                const patch: any = { [key]: value || null };
                await api.updateLead(selectedLead.id, patch);
                setSelectedLead({ ...selectedLead, [key]: value || null });
              } catch (err) {
                console.error('Error saving field:', err);
              }
            }

            return (
              <div className={styles.detailSection}>
                <h3 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Zoho CRM</span>
                  <span style={{ fontSize: '10px', fontWeight: 500, color: filled === total ? 'var(--color-success)' : 'var(--color-warning)', textTransform: 'none', letterSpacing: 0 }}>
                    {filled}/{total} campos
                  </span>
                </h3>
                {editableFields.map((f: any) => {
                  const opts = (f.optionsJson || []) as any[];
                  const isPicklist = (f.fieldType === 'picklist' || f.fieldType === 'multi_select') && opts.length > 0;
                  const val = getVal(f.localKey);

                  return (
                    <div key={f.localKey} style={{ marginBottom: '8px' }}>
                      <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '3px' }}>
                        {f.label}
                        {f.isRequired && <span style={{ color: '#fb7185', marginLeft: 3 }}>*</span>}
                      </div>
                      {isPicklist ? (
                        <select
                          style={selectStyle}
                          value={val}
                          onChange={(e) => saveField(f.localKey, e.target.value)}
                        >
                          <option value="">— Seleccionar —</option>
                          {opts.map((opt: any, i: number) => (
                            <option key={i} value={f.localKey === 'offerInterest' && opt.slug ? opt.slug : opt.value}>
                              {opt.value}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          style={inputStyle}
                          type={f.fieldType === 'email' ? 'email' : f.fieldType === 'number' || f.fieldType === 'decimal' ? 'number' : 'text'}
                          defaultValue={val}
                          placeholder={`Ingresar ${f.label.toLowerCase()}...`}
                          onBlur={(e) => { if (e.target.value !== val) saveField(f.localKey, e.target.value); }}
                          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                        />
                      )}
                    </div>
                  );
                })}
                <div className={styles.detailField} style={{ marginTop: '6px' }}>
                  <span>Sync</span>
                  <span style={{
                    color: selectedLead.zohoSyncStatus === 'synced' ? 'var(--color-success)'
                      : selectedLead.zohoSyncStatus === 'error' ? 'var(--color-danger)'
                      : 'var(--color-warning)',
                    fontWeight: 600, fontSize: '12px',
                  }}>
                    {selectedLead.zohoSyncStatus === 'synced' ? '✓ Sincronizado'
                      : selectedLead.zohoSyncStatus === 'error' ? '✗ Error'
                      : '⏳ Pendiente'}
                  </span>
                </div>
                {selectedLead.zohoLastError && (
                  <div style={{ fontSize: '11px', color: 'var(--color-danger)', marginTop: 4, wordBreak: 'break-all' }}>
                    {selectedLead.zohoLastError}
                  </div>
                )}
                {selectedLead.zohoLastSyncAt && (
                  <div className={styles.detailField}>
                    <span>Último sync</span>
                    <span>{new Date(selectedLead.zohoLastSyncAt).toLocaleString('es-AR')}</span>
                  </div>
                )}
                <button
                  className={styles.noteBtn}
                  onClick={syncToZoho}
                  disabled={syncing}
                  style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <RefreshCw size={13} className={syncing ? 'spin' : ''} />
                  {syncing ? 'Sincronizando...' : 'Actualizar en Zoho'}
                </button>
                {syncMsg && (
                  <div style={{
                    marginTop: 8,
                    fontSize: '12px',
                    color: syncMsg.type === 'ok' ? 'var(--color-success)' : 'var(--color-danger)',
                  }}>
                    {syncMsg.text}
                  </div>
                )}
              </div>
            );
          })()}

          {hasPilot && (() => {
            const editableFields = pilotFields.filter((f: any) => f.localKey !== 'phone');
            const filled = editableFields.filter((f: any) => getPilotVal(selectedLead, f.localKey)).length;
            const total = editableFields.filter((f: any) => f.isRequired).length;

            const inputStyle: React.CSSProperties = {
              width: '100%', padding: '4px 8px', fontSize: '12px',
              background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)', color: 'var(--color-text)', outline: 'none',
            };
            const selectStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer' };

            return (
              <div className={styles.detailSection}>
                <h3 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Pilot CRM</span>
                  <span style={{ fontSize: '10px', fontWeight: 500, color: filled >= total ? 'var(--color-success)' : 'var(--color-warning)', textTransform: 'none', letterSpacing: 0 }}>
                    {filled}/{editableFields.length} campos
                  </span>
                </h3>
                {editableFields.map((f: any) => {
                  const opts = (f.optionsJson || []) as any[];
                  const isSelect = f.fieldType === 'select' && opts.length > 0;
                  const val = getPilotVal(selectedLead, f.localKey);

                  return (
                    <div key={f.localKey} style={{ marginBottom: '8px' }}>
                      <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '3px' }}>
                        {f.label}
                        {f.isRequired && <span style={{ color: '#fb7185', marginLeft: 3 }}>*</span>}
                      </div>
                      {isSelect ? (
                        <select
                          style={selectStyle}
                          value={val}
                          onChange={(e) => savePilotField(f.localKey, e.target.value)}
                        >
                          <option value="">— Seleccionar —</option>
                          {opts.map((opt: any, i: number) => (
                            <option key={i} value={opt.value}>{opt.label || opt.value}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          style={inputStyle}
                          type="text"
                          defaultValue={val}
                          placeholder={`Ingresar ${f.label.toLowerCase()}...`}
                          onBlur={(e) => { if (e.target.value !== val) savePilotField(f.localKey, e.target.value); }}
                          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                        />
                      )}
                    </div>
                  );
                })}
                {selectedLead.pilotContactId && (
                  <div className={styles.detailField}>
                    <span>ID Pilot</span>
                    <span>{selectedLead.pilotContactId}</span>
                  </div>
                )}
                <div className={styles.detailField} style={{ marginTop: '6px' }}>
                  <span>Sync</span>
                  <span style={{
                    color: selectedLead.pilotSyncStatus === 'synced' ? 'var(--color-success)'
                      : selectedLead.pilotSyncStatus === 'error' ? 'var(--color-danger)'
                      : selectedLead.pilotSyncStatus === 'needs_update' ? 'var(--color-warning)'
                      : 'var(--color-warning)',
                    fontWeight: 600, fontSize: '12px',
                  }}>
                    {selectedLead.pilotSyncStatus === 'synced' ? '✓ Sincronizado'
                      : selectedLead.pilotSyncStatus === 'error' ? '✗ Error'
                      : selectedLead.pilotSyncStatus === 'needs_update' ? '↻ Necesita actualización'
                      : '⏳ Pendiente'}
                  </span>
                </div>
                {selectedLead.pilotLastError && (
                  <div style={{ fontSize: '11px', color: 'var(--color-danger)', marginTop: 4, wordBreak: 'break-all' }}>
                    {selectedLead.pilotLastError}
                  </div>
                )}
                {selectedLead.pilotLastSyncAt && (
                  <div className={styles.detailField}>
                    <span>Último sync</span>
                    <span>{new Date(selectedLead.pilotLastSyncAt).toLocaleString('es-AR')}</span>
                  </div>
                )}
                <button
                  className={styles.noteBtn}
                  onClick={syncToPilot}
                  disabled={pilotSyncing}
                  style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <RefreshCw size={13} className={pilotSyncing ? 'spin' : ''} />
                  {pilotSyncing ? 'Sincronizando...' : 'Enviar a Pilot CRM'}
                </button>
                {pilotSyncMsg && (
                  <div style={{
                    marginTop: 8,
                    fontSize: '12px',
                    color: pilotSyncMsg.type === 'ok' ? 'var(--color-success)' : 'var(--color-danger)',
                  }}>
                    {pilotSyncMsg.text}
                  </div>
                )}
              </div>
            );
          })()}

          <div className={styles.detailSection}>
            <h3>Notas internas</h3>
            <textarea
              className={styles.noteInput}
              placeholder="Escribir nota..."
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
            />
            <button className={styles.noteBtn} onClick={addNote}>Agregar nota</button>

            {selectedLead.notes?.map((note: any) => (
              <div key={note.id} className={styles.noteItem}>
                <p>{note.content}</p>
                <span>{new Date(note.createdAt).toLocaleString('es-AR')}</span>
              </div>
            ))}
          </div>

          {/* Photo preview overlay */}
          {photoPreview && (
            <div className={styles.photoOverlay} onClick={() => setPhotoPreview(null)}>
              <img src={photoPreview} alt="Preview" />
            </div>
          )}

          <div className={styles.detailSection}>
            <button
              style={{
                width: '100%', padding: '8px', fontSize: '12px', fontWeight: 600,
                background: 'transparent', border: '1px solid var(--color-danger)',
                color: 'var(--color-danger)', borderRadius: 'var(--radius-sm)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
              onClick={async () => {
                if (!confirm(`¿Eliminar lead "${selectedLead.name || selectedLead.phone}"?\n\nSe eliminarán todas las conversaciones, mensajes y notas.`)) return;
                try {
                  await api.deleteLead(selectedLead.id);
                  setSelectedLead(null);
                  loadLeads();
                } catch (err) {
                  console.error('Error deleting lead:', err);
                  alert('Error al eliminar el lead');
                }
              }}
            >
              <Trash2 size={14} />
              Eliminar lead
            </button>
          </div>
        </div>
        </>
      )}
    </div>
  );
}

// ============================================================
// LeadRequestsPanel — list/edit/delete LeadRequests under a lead
// ============================================================
interface LeadRequestsPanelProps {
  lead: any;
  fieldConfigs: any[];
  onChange: () => void;
  onPhotoClick: (url: string) => void;
}

function LeadRequestsPanel({ lead, fieldConfigs, onChange, onPhotoClick }: LeadRequestsPanelProps) {
  const requests: any[] = lead.requests || [];
  const requestFields = fieldConfigs.filter((f: any) => (f.scope || 'request') === 'request');
  const textFields = requestFields.filter((f: any) => f.fieldType !== 'photo' && f.fieldType !== 'multi_photo');
  const photoFields = requestFields.filter((f: any) => f.fieldType === 'photo' || f.fieldType === 'multi_photo');

  if (fieldConfigs.length === 0 && requests.length === 0) return null;

  async function createRequest() {
    try {
      await api.createLeadRequest(lead.id);
      onChange();
    } catch (err) {
      console.error(err);
      alert('Error creando solicitud');
    }
  }

  async function deleteRequest(rid: string, label: string) {
    if (!confirm(`¿Eliminar la solicitud "${label}"?\nSe borrarán también sus fotos asociadas.`)) return;
    try {
      await api.deleteLeadRequest(lead.id, rid);
      onChange();
    } catch (err) {
      console.error(err);
      alert('Error eliminando solicitud');
    }
  }

  async function patchRequest(rid: string, patch: any) {
    try {
      await api.updateLeadRequest(lead.id, rid, patch);
      onChange();
    } catch (err) {
      console.error(err);
      alert('Error actualizando solicitud');
    }
  }

  return (
    <div className={styles.detailSection}>
      <h3 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <ClipboardList size={12} /> Solicitudes ({requests.length})
        </span>
        <button
          onClick={createRequest}
          title="Crear nueva solicitud"
          style={{
            display: 'flex', alignItems: 'center', gap: 4, fontSize: '10px', fontWeight: 500,
            padding: '4px 8px', borderRadius: 'var(--radius-sm)',
            background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.3)',
            color: 'var(--color-text)', cursor: 'pointer',
          }}
        >
          <Plus size={11} /> Nueva
        </button>
      </h3>

      {requests.length === 0 ? (
        <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', padding: '8px 0' }}>
          Todavía no hay solicitudes registradas.
        </div>
      ) : (
        requests.map((req: any, idx: number) => (
          <RequestCard
            key={req.id}
            request={req}
            indexFromEnd={requests.length - idx}
            textFields={textFields}
            photoFields={photoFields}
            onSaveData={(data) => patchRequest(req.id, { data })}
            onSaveLabel={(label) => patchRequest(req.id, { label })}
            onSaveStatus={(status) => patchRequest(req.id, { status })}
            onDelete={() => deleteRequest(req.id, req.label || `Solicitud #${requests.length - idx}`)}
            onPhotoClick={onPhotoClick}
          />
        ))
      )}
    </div>
  );
}

interface RequestCardProps {
  request: any;
  indexFromEnd: number;
  textFields: any[];
  photoFields: any[];
  onSaveData: (data: Record<string, any>) => void;
  onSaveLabel: (label: string) => void;
  onSaveStatus: (status: string) => void;
  onDelete: () => void;
  onPhotoClick: (url: string) => void;
}

function RequestCard({ request, indexFromEnd, textFields, photoFields, onSaveData, onSaveLabel, onSaveStatus, onDelete, onPhotoClick }: RequestCardProps) {
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState(false);
  const [draftLabel, setDraftLabel] = useState<string>(request.label || '');
  const data = (request.data as Record<string, any>) || {};
  const photos: any[] = request.photos || [];

  const statusColor: Record<string, string> = {
    in_progress: 'var(--color-warning)',
    completed: 'var(--color-success)',
    cancelled: 'var(--color-text-muted)',
  };
  const statusLabel: Record<string, string> = {
    in_progress: 'En progreso',
    completed: 'Completada',
    cancelled: 'Cancelada',
  };

  function fieldFilled(f: any) {
    if (f.fieldType === 'photo' || f.fieldType === 'multi_photo') {
      return photos.some((p) => p.fieldKey === f.fieldKey);
    }
    const v = data[f.fieldKey];
    return v !== undefined && v !== null && String(v).trim() !== '';
  }
  const allFields = [...textFields, ...photoFields];
  const filled = allFields.filter(fieldFilled).length;

  return (
    <div style={{
      padding: '10px', marginBottom: '8px', borderRadius: 'var(--radius-sm)',
      border: '1px solid var(--color-border)', background: 'rgba(255,255,255,0.02)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
          {editingLabel ? (
            <input
              autoFocus
              value={draftLabel}
              onChange={(e) => setDraftLabel(e.target.value)}
              onBlur={() => {
                setEditingLabel(false);
                if (draftLabel !== (request.label || '')) onSaveLabel(draftLabel);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') { setDraftLabel(request.label || ''); setEditingLabel(false); }
              }}
              style={{
                fontSize: '12px', fontWeight: 600, padding: '2px 6px',
                border: '1px solid var(--color-border)', borderRadius: 4,
                background: 'var(--color-bg-secondary)', color: 'var(--color-text)', flex: 1,
              }}
            />
          ) : (
            <span style={{ fontSize: '12px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {request.label || `Solicitud #${indexFromEnd}`}
            </span>
          )}
          <button
            onClick={() => { setDraftLabel(request.label || ''); setEditingLabel(true); }}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 0 }}
            title="Renombrar"
          >
            <Edit2 size={11} />
          </button>
        </div>
        <select
          value={request.status}
          onChange={(e) => onSaveStatus(e.target.value)}
          style={{
            fontSize: '10px', padding: '2px 6px', border: `1px solid ${statusColor[request.status]}`,
            borderRadius: 999, background: 'transparent', color: statusColor[request.status], cursor: 'pointer',
          }}
        >
          <option value="in_progress">{statusLabel.in_progress}</option>
          <option value="completed">{statusLabel.completed}</option>
          <option value="cancelled">{statusLabel.cancelled}</option>
        </select>
        <button
          onClick={onDelete}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-danger)', padding: 2 }}
          title="Eliminar solicitud"
        >
          <Trash2 size={12} />
        </button>
      </div>

      <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginBottom: 6 }}>
        {filled}/{allFields.length} campos · creada {new Date(request.createdAt).toLocaleDateString('es-AR')}
      </div>

      {textFields.map((f: any) => {
        const value = data[f.fieldKey];
        const isEditing = editingField === f.fieldKey;
        return (
          <div key={f.fieldKey} className={styles.detailField}>
            <span>{f.label}</span>
            {isEditing ? (
              <RequestFieldEditor
                field={f}
                initial={value || ''}
                onCommit={(v) => {
                  setEditingField(null);
                  if (v !== (value || '')) onSaveData({ [f.fieldKey]: v });
                }}
                onCancel={() => setEditingField(null)}
              />
            ) : (
              <span
                onClick={() => setEditingField(f.fieldKey)}
                style={{ cursor: 'pointer' }}
                className={value ? styles.customDataValue : styles.customDataEmpty}
                title="Click para editar"
              >
                {value || 'Sin dato'}
              </span>
            )}
          </div>
        );
      })}

      {photos.length > 0 && (
        <div className={styles.photoGrid} style={{ marginTop: 8 }}>
          {photos.map((photo: any) => {
            const cfg = photoFields.find((f: any) => f.fieldKey === photo.fieldKey);
            return (
              <div key={photo.id} className={styles.photoThumb} onClick={() => onPhotoClick(photo.url)}>
                <img src={photo.url} alt={photo.caption || photo.fieldKey} loading="lazy" />
                <div className={styles.photoFieldLabel}>{cfg?.label || photo.fieldKey}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RequestFieldEditor({ field, initial, onCommit, onCancel }: { field: any; initial: string; onCommit: (v: string) => void; onCancel: () => void }) {
  const [v, setV] = useState(initial);
  const inputStyle: React.CSSProperties = {
    fontSize: '12px', padding: '4px 6px', border: '1px solid var(--color-border)',
    borderRadius: 4, background: 'var(--color-bg-secondary)', color: 'var(--color-text)', flex: 1,
  };

  if (field.fieldType === 'picklist') {
    const opts = (field.optionsJson as any[]) || [];
    return (
      <span style={{ display: 'flex', gap: 4 }}>
        <select autoFocus value={v} onChange={(e) => setV(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
          <option value="">— vacío —</option>
          {opts.map((o: any) => (
            <option key={o.value} value={o.value}>{o.value}</option>
          ))}
        </select>
        <button onClick={() => onCommit(v)} style={{ background: 'transparent', border: 'none', color: 'var(--color-success)', cursor: 'pointer' }}><Check size={12} /></button>
        <button onClick={onCancel} style={{ background: 'transparent', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer' }}><X size={12} /></button>
      </span>
    );
  }
  return (
    <span style={{ display: 'flex', gap: 4 }}>
      <input
        autoFocus
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onCommit(v);
          if (e.key === 'Escape') onCancel();
        }}
        style={inputStyle}
      />
      <button onClick={() => onCommit(v)} style={{ background: 'transparent', border: 'none', color: 'var(--color-success)', cursor: 'pointer' }}><Check size={12} /></button>
      <button onClick={onCancel} style={{ background: 'transparent', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer' }}><X size={12} /></button>
    </span>
  );
}
