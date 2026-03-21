'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Package, Plus } from 'lucide-react';
import styles from './page.module.css';

interface Offer {
  id: string;
  name: string;
  slug: string;
  zohoPicklistValue: string;
  synonymsJson: string[] | null;
  keywordsJson: string[] | null;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
}

const EMPTY_FORM = {
  name: '',
  slug: '',
  zohoPicklistValue: '',
  synonyms: '',
  keywords: '',
  description: '',
  isActive: true,
  sortOrder: 0,
};

export default function OffersPage() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadOffers();
  }, []);

  async function loadOffers() {
    setLoading(true);
    try {
      const data = await api.getOffers();
      setOffers(data.offers || []);
    } catch (err) {
      console.error('Error loading offers:', err);
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  }

  function openEdit(offer: Offer) {
    setEditingId(offer.id);
    setForm({
      name: offer.name,
      slug: offer.slug,
      zohoPicklistValue: offer.zohoPicklistValue,
      synonyms: (offer.synonymsJson || []).join(', '),
      keywords: (offer.keywordsJson || []).join(', '),
      description: offer.description || '',
      isActive: offer.isActive,
      sortOrder: offer.sortOrder,
    });
    setShowModal(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        slug: form.slug,
        zohoPicklistValue: form.zohoPicklistValue,
        synonymsJson: form.synonyms ? form.synonyms.split(',').map((s) => s.trim()).filter(Boolean) : [],
        keywordsJson: form.keywords ? form.keywords.split(',').map((s) => s.trim()).filter(Boolean) : [],
        description: form.description || undefined,
        isActive: form.isActive,
        sortOrder: form.sortOrder,
      };

      if (editingId) {
        await api.updateOffer(editingId, payload);
      } else {
        await api.createOffer(payload);
      }

      setShowModal(false);
      await loadOffers();
    } catch (err) {
      console.error('Error saving offer:', err);
      alert('Error al guardar la oferta');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar esta oferta?')) return;
    try {
      await api.deleteOffer(id);
      await loadOffers();
    } catch (err) {
      console.error('Error deleting offer:', err);
    }
  }

  function autoSlug(name: string) {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>Ofertas académicas</h1>
        <button className={styles.addBtn} onClick={openCreate}>
          <Plus size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
          Nueva oferta
        </button>
      </div>

      {loading ? (
        <div className={styles.emptyState}>Cargando...</div>
      ) : offers.length === 0 ? (
        <div className={styles.emptyState}>
          <Package size={32} />
          <p>No hay ofertas configuradas</p>
        </div>
      ) : (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Slug</th>
                <th>Valor Zoho</th>
                <th>Estado</th>
                <th>Orden</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {offers.map((offer) => (
                <tr key={offer.id}>
                  <td>{offer.name}</td>
                  <td style={{ color: 'var(--color-text-muted)', fontFamily: 'monospace', fontSize: '12px' }}>{offer.slug}</td>
                  <td>{offer.zohoPicklistValue}</td>
                  <td>
                    <span className={`${styles.activeBadge} ${offer.isActive ? styles.badgeActive : styles.badgeInactive}`}>
                      {offer.isActive ? 'Activa' : 'Inactiva'}
                    </span>
                  </td>
                  <td>{offer.sortOrder}</td>
                  <td>
                    <div className={styles.actions}>
                      <button className={styles.editBtn} onClick={() => openEdit(offer)}>Editar</button>
                      <button className={styles.deleteBtn} onClick={() => handleDelete(offer.id)}>Eliminar</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <>
          <div className={styles.modalBackdrop} onClick={() => setShowModal(false)} />
          <div className={styles.modal}>
            <h2>{editingId ? 'Editar oferta' : 'Nueva oferta'}</h2>

            <div className={styles.formGroup}>
              <label>Nombre</label>
              <input
                className={styles.formInput}
                value={form.name}
                onChange={(e) => {
                  const name = e.target.value;
                  setForm((f) => ({
                    ...f,
                    name,
                    ...(!editingId ? { slug: autoSlug(name), zohoPicklistValue: name } : {}),
                  }));
                }}
                placeholder="Ej: Licenciatura en Administración"
              />
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label>Slug</label>
                <input
                  className={styles.formInput}
                  value={form.slug}
                  onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                  placeholder="licenciatura-administracion"
                />
              </div>
              <div className={styles.formGroup}>
                <label>Valor Zoho (Picklist)</label>
                <input
                  className={styles.formInput}
                  value={form.zohoPicklistValue}
                  onChange={(e) => setForm((f) => ({ ...f, zohoPicklistValue: e.target.value }))}
                  placeholder="Lic. Administración"
                />
              </div>
            </div>

            <div className={styles.formGroup}>
              <label>Sinónimos (separados por coma)</label>
              <input
                className={styles.formInput}
                value={form.synonyms}
                onChange={(e) => setForm((f) => ({ ...f, synonyms: e.target.value }))}
                placeholder="admin, administración de empresas, lic admin"
              />
            </div>

            <div className={styles.formGroup}>
              <label>Keywords (separadas por coma)</label>
              <input
                className={styles.formInput}
                value={form.keywords}
                onChange={(e) => setForm((f) => ({ ...f, keywords: e.target.value }))}
                placeholder="administración, empresas, negocios"
              />
            </div>

            <div className={styles.formGroup}>
              <label>Descripción (opcional)</label>
              <input
                className={styles.formInput}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Breve descripción de la oferta"
              />
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label>Orden</label>
                <input
                  className={styles.formInput}
                  type="number"
                  value={form.sortOrder}
                  onChange={(e) => setForm((f) => ({ ...f, sortOrder: parseInt(e.target.value) || 0 }))}
                />
              </div>
              <div className={styles.checkboxGroup}>
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                  id="isActive"
                />
                <label htmlFor="isActive">Activa</label>
              </div>
            </div>

            <div className={styles.formActions}>
              <button className={styles.cancelBtn} onClick={() => setShowModal(false)}>Cancelar</button>
              <button
                className={styles.saveBtn}
                onClick={handleSave}
                disabled={saving || !form.name || !form.slug || !form.zohoPicklistValue}
              >
                {saving ? 'Guardando...' : editingId ? 'Actualizar' : 'Crear'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
