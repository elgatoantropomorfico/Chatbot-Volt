'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Users, X, RefreshCw, Trash2 } from 'lucide-react';
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
  const [zohoFields, setZohoFields] = useState<any[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

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

          {/* Zoho CRM section — editable fields from ZohoFieldConfig */}
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

          <div className={styles.detailSection}>
            <button
              style={{
                width: '100%', padding: '8px', fontSize: '12px', fontWeight: 600,
                background: 'transparent', border: '1px solid var(--color-danger)',
                color: 'var(--color-danger)', borderRadius: 'var(--radius-sm)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
              onClick={async () => {
                if (!confirm(`¿Eliminar lead "${selectedLead.name || selectedLead.phone}"?\n\nSe eliminarán todas las conversaciones, mensajes y notas.${selectedLead.zohoContactId ? '\nTambién se eliminará el contacto en Zoho CRM.' : ''}`)) return;
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
