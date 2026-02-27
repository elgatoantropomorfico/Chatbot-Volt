'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Users } from 'lucide-react';
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

  useEffect(() => {
    loadLeads();
  }, [page, stage]);

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

      {/* Detail panel */}
      {selectedLead && (
        <div className={styles.detailPanel}>
          <div className={styles.detailHeader}>
            <h2>{selectedLead.name || selectedLead.phone}</h2>
            <p>{selectedLead.phone}</p>
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
        </div>
      )}
    </div>
  );
}
