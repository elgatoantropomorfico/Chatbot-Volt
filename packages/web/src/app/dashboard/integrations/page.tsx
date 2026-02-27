'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import {
  Plug,
  Plus,
  ShoppingCart,
  Search,
  Package,
  MessageSquare,
  Phone,
  Save,
  X,
  Settings2,
  ExternalLink,
  CreditCard,
} from 'lucide-react';

interface WooConfig {
  baseUrl: string;
  consumerKey: string;
  consumerSecret: string;
  maxSearchResults: number;
  enableProductSearch: boolean;
  enableOrderLookup: boolean;
  enableCart: boolean;
  checkoutMode: 'wa_human' | 'mercadopago';
  checkoutPhone: string;
}

const defaultConfig: WooConfig = {
  baseUrl: '',
  consumerKey: '',
  consumerSecret: '',
  maxSearchResults: 10,
  enableProductSearch: true,
  enableOrderLookup: true,
  enableCart: true,
  checkoutMode: 'wa_human',
  checkoutPhone: '',
};

export default function IntegrationsPage() {
  const { user, isSuperAdmin, isTenantAdmin } = useAuth();
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [config, setConfig] = useState<WooConfig>({ ...defaultConfig });
  const [createForm, setCreateForm] = useState({ tenantId: '', type: 'woocommerce' });
  const [saveMsg, setSaveMsg] = useState('');

  const loadIntegrations = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getIntegrations();
      setIntegrations(data.integrations);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    loadIntegrations();
    if (isSuperAdmin) {
      api.getTenants().then(d => setTenants(d.tenants)).catch(console.error);
    }
  }, [loadIntegrations, isSuperAdmin]);

  function openEdit(integration: any) {
    const c = integration.config || {};
    setConfig({
      baseUrl: c.baseUrl || '',
      consumerKey: c.consumerKey || '',
      consumerSecret: c.consumerSecret || '',
      maxSearchResults: c.maxSearchResults ?? 10,
      enableProductSearch: c.enableProductSearch !== false,
      enableOrderLookup: c.enableOrderLookup !== false,
      enableCart: c.enableCart !== false,
      checkoutMode: c.checkoutMode || 'wa_human',
      checkoutPhone: c.checkoutPhone || '',
    });
    setEditingId(integration.id);
    setShowCreate(false);
    setSaveMsg('');
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.createIntegration({
        tenantId: isTenantAdmin ? user?.tenantId : createForm.tenantId,
        type: createForm.type,
        config: { ...config },
      });
      setShowCreate(false);
      setConfig({ ...defaultConfig });
      await loadIntegrations();
    } catch (err: any) { alert(err.message); }
    finally { setSaving(false); }
  }

  async function handleSave() {
    if (!editingId) return;
    setSaving(true);
    setSaveMsg('');
    try {
      await api.updateIntegration(editingId, { config: { ...config } });
      setSaveMsg('Guardado correctamente');
      await loadIntegrations();
      setTimeout(() => setSaveMsg(''), 3000);
    } catch (err: any) { setSaveMsg('Error: ' + err.message); }
    finally { setSaving(false); }
  }

  async function toggleStatus(id: string, currentStatus: string) {
    try {
      await api.updateIntegration(id, { status: currentStatus === 'active' ? 'inactive' : 'active' });
      await loadIntegrations();
    } catch (err: any) { alert(err.message); }
  }

  if (!isSuperAdmin && !isTenantAdmin) return <p style={{ color: 'var(--color-text-muted)' }}>Acceso denegado</p>;

  const statusColors: Record<string, string> = { active: '#34d399', inactive: 'var(--color-text-muted)' };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px', background: 'var(--color-bg-secondary)',
    border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
    color: 'var(--color-text)', fontSize: '14px', outline: 'none', transition: 'all 0.15s',
  };
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '12px', color: 'var(--color-text-muted)',
    marginBottom: '6px', fontWeight: 600, letterSpacing: '0.01em',
  };
  const sectionStyle: React.CSSProperties = {
    background: 'var(--color-surface)', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-lg)', padding: '24px', marginBottom: '16px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.3), 0 0 1px rgba(139, 92, 246, 0.15)',
    position: 'relative', overflow: 'hidden',
  };
  const sectionTitleStyle: React.CSSProperties = {
    fontSize: '15px', fontWeight: 700, marginBottom: '18px',
    display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--color-text)',
    letterSpacing: '-0.01em',
  };
  const toggleWrapStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 0', borderBottom: '1px solid rgba(139, 92, 246, 0.06)',
  };

  function renderConfigForm(isCreate: boolean) {
    return (
      <>
        {/* Credentials Section */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>
            <ExternalLink size={18} style={{ color: 'var(--color-primary)' }} />
            Conexion WooCommerce
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px' }}>
            <div>
              <label style={labelStyle}>URL de la tienda</label>
              <input
                value={config.baseUrl}
                onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })}
                required={isCreate}
                placeholder="https://tu-tienda.com"
                style={inputStyle}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={labelStyle}>Consumer Key</label>
                <input
                  value={config.consumerKey}
                  onChange={(e) => setConfig({ ...config, consumerKey: e.target.value })}
                  required={isCreate}
                  placeholder="ck_..."
                  style={{ ...inputStyle, fontFamily: 'var(--font-mono)', fontSize: '13px' }}
                />
              </div>
              <div>
                <label style={labelStyle}>Consumer Secret</label>
                <input
                  type="password"
                  value={config.consumerSecret}
                  onChange={(e) => setConfig({ ...config, consumerSecret: e.target.value })}
                  required={isCreate}
                  placeholder="cs_..."
                  style={{ ...inputStyle, fontFamily: 'var(--font-mono)', fontSize: '13px' }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Features Section */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>
            <Settings2 size={18} style={{ color: 'var(--color-info)' }} />
            Funcionalidades
          </div>

          <div style={toggleWrapStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Search size={16} style={{ color: 'var(--color-text-muted)' }} />
              <div>
                <div style={{ fontSize: '14px', fontWeight: 500 }}>Busqueda de productos</div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                  Permite al bot buscar productos en el catalogo de WooCommerce
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setConfig({ ...config, enableProductSearch: !config.enableProductSearch })}
              style={{
                width: '44px', height: '24px', borderRadius: '12px', border: 'none', cursor: 'pointer',
                background: config.enableProductSearch ? 'var(--color-success)' : 'var(--color-border)',
                position: 'relative', transition: 'background 0.2s',
              }}
            >
              <span style={{
                position: 'absolute', top: '2px', width: '20px', height: '20px', borderRadius: '50%',
                background: 'white', transition: 'left 0.2s',
                left: config.enableProductSearch ? '22px' : '2px',
              }} />
            </button>
          </div>

          <div style={toggleWrapStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Package size={16} style={{ color: 'var(--color-text-muted)' }} />
              <div>
                <div style={{ fontSize: '14px', fontWeight: 500 }}>Consulta de pedidos</div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                  Permite al cliente consultar el estado de sus pedidos
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setConfig({ ...config, enableOrderLookup: !config.enableOrderLookup })}
              style={{
                width: '44px', height: '24px', borderRadius: '12px', border: 'none', cursor: 'pointer',
                background: config.enableOrderLookup ? 'var(--color-success)' : 'var(--color-border)',
                position: 'relative', transition: 'background 0.2s',
              }}
            >
              <span style={{
                position: 'absolute', top: '2px', width: '20px', height: '20px', borderRadius: '50%',
                background: 'white', transition: 'left 0.2s',
                left: config.enableOrderLookup ? '22px' : '2px',
              }} />
            </button>
          </div>

          <div style={toggleWrapStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <ShoppingCart size={16} style={{ color: 'var(--color-text-muted)' }} />
              <div>
                <div style={{ fontSize: '14px', fontWeight: 500 }}>Carrito de compras</div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                  Permite armar un carrito y finalizar la compra
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setConfig({ ...config, enableCart: !config.enableCart })}
              style={{
                width: '44px', height: '24px', borderRadius: '12px', border: 'none', cursor: 'pointer',
                background: config.enableCart ? 'var(--color-success)' : 'var(--color-border)',
                position: 'relative', transition: 'background 0.2s',
              }}
            >
              <span style={{
                position: 'absolute', top: '2px', width: '20px', height: '20px', borderRadius: '50%',
                background: 'white', transition: 'left 0.2s',
                left: config.enableCart ? '22px' : '2px',
              }} />
            </button>
          </div>

          <div style={{ ...toggleWrapStyle, borderBottom: 'none' }}>
            <div>
              <label style={labelStyle}>Resultados maximos por busqueda</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <input
                  type="range"
                  min={1}
                  max={20}
                  value={config.maxSearchResults}
                  onChange={(e) => setConfig({ ...config, maxSearchResults: parseInt(e.target.value) })}
                  style={{ flex: 1, accentColor: 'var(--color-primary)' }}
                />
                <span style={{
                  minWidth: '32px', textAlign: 'center', fontSize: '16px', fontWeight: 600,
                  color: 'var(--color-primary)',
                }}>
                  {config.maxSearchResults}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Checkout Section */}
        {config.enableCart && (
          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>
              <CreditCard size={18} style={{ color: 'var(--color-warning)' }} />
              Checkout (Cierre de compra)
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>Modo de checkout</label>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setConfig({ ...config, checkoutMode: 'wa_human' })}
                  style={{
                    flex: 1, padding: '14px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                    border: config.checkoutMode === 'wa_human'
                      ? '2px solid var(--color-primary)'
                      : '1px solid var(--color-border)',
                    background: config.checkoutMode === 'wa_human'
                      ? 'var(--color-primary-light)'
                      : 'var(--color-bg-secondary)',
                    color: 'var(--color-text)', textAlign: 'left' as const,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <MessageSquare size={16} style={{ color: 'var(--color-success)' }} />
                    <span style={{ fontWeight: 600, fontSize: '14px' }}>Contacto humano (WhatsApp)</span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                    Envia un link wa.me con el resumen del pedido a un numero de WhatsApp
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setConfig({ ...config, checkoutMode: 'mercadopago' })}
                  style={{
                    flex: 1, padding: '14px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                    border: config.checkoutMode === 'mercadopago'
                      ? '2px solid var(--color-primary)'
                      : '1px solid var(--color-border)',
                    background: config.checkoutMode === 'mercadopago'
                      ? 'var(--color-primary-light)'
                      : 'var(--color-bg-secondary)',
                    color: 'var(--color-text)', textAlign: 'left' as const,
                    opacity: 0.5,
                  }}
                  disabled
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <CreditCard size={16} style={{ color: 'var(--color-info)' }} />
                    <span style={{ fontWeight: 600, fontSize: '14px' }}>MercadoPago</span>
                    <span style={{
                      fontSize: '10px', padding: '2px 6px', borderRadius: 'var(--radius-sm)',
                      background: 'var(--color-warning-light)', color: 'var(--color-warning)',
                      fontWeight: 600,
                    }}>PROXIMAMENTE</span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                    Genera un link de pago de MercadoPago con el carrito
                  </div>
                </button>
              </div>
            </div>

            {config.checkoutMode === 'wa_human' && (
              <div>
                <label style={labelStyle}>
                  <Phone size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
                  Numero de WhatsApp para recibir pedidos
                </label>
                <input
                  value={config.checkoutPhone}
                  onChange={(e) => setConfig({ ...config, checkoutPhone: e.target.value })}
                  placeholder="5491112345678 (con codigo de pais, sin +)"
                  style={inputStyle}
                />
                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                  Cuando el cliente finaliza la compra, recibe un link wa.me con el resumen del pedido hacia este numero.
                </div>
              </div>
            )}
          </div>
        )}
      </>
    );
  }

  return (
    <div style={{ maxWidth: '800px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '26px', fontWeight: 700, letterSpacing: '-0.02em', background: 'linear-gradient(135deg, var(--color-text), var(--color-text-secondary))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Integraciones</h1>
        {!showCreate && !editingId && (
          <button
            onClick={() => { setShowCreate(true); setEditingId(null); setConfig({ ...defaultConfig }); }}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 18px',
              background: 'linear-gradient(135deg, #7c3aed, #8b5cf6)', color: 'white', border: 'none',
              borderRadius: 'var(--radius-sm)', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(139, 92, 246, 0.3)', transition: 'all 0.15s',
            }}
          >
            <Plus size={16} /> Nueva integracion
          </button>
        )}
      </div>

      {/* Create Form */}
      {showCreate && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 600 }}>Nueva integracion WooCommerce</h2>
            <button onClick={() => setShowCreate(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer' }}>
              <X size={20} />
            </button>
          </div>

          <form onSubmit={handleCreate}>
            {isSuperAdmin && (
              <div style={{ ...sectionStyle, marginBottom: '16px' }}>
                <label style={labelStyle}>Tenant</label>
                <select
                  value={createForm.tenantId}
                  onChange={(e) => setCreateForm({ ...createForm, tenantId: e.target.value })}
                  required
                  style={inputStyle}
                >
                  <option value="">Seleccionar tenant...</option>
                  {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            )}

            {renderConfigForm(true)}

            <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
              <button
                type="submit"
                disabled={saving}
                style={{
                  padding: '10px 24px', background: 'linear-gradient(135deg, #7c3aed, #8b5cf6)', color: 'white',
                  border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '14px',
                  fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.5 : 1,
                  display: 'flex', alignItems: 'center', gap: '8px',
                  boxShadow: '0 2px 8px rgba(139, 92, 246, 0.3)', transition: 'all 0.15s',
                }}
              >
                <Save size={16} /> {saving ? 'Creando...' : 'Crear integracion'}
              </button>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                style={{
                  padding: '10px 18px', background: 'transparent',
                  border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
                  color: 'var(--color-text-secondary)', fontSize: '14px', cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Panel */}
      {editingId && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 600 }}>Configurar WooCommerce</h2>
            <button onClick={() => setEditingId(null)} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer' }}>
              <X size={20} />
            </button>
          </div>

          {renderConfigForm(false)}

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px' }}>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                padding: '10px 24px', background: 'linear-gradient(135deg, #7c3aed, #8b5cf6)', color: 'white',
                border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '14px',
                fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.5 : 1,
                display: 'flex', alignItems: 'center', gap: '8px',
                boxShadow: '0 2px 8px rgba(139, 92, 246, 0.3)', transition: 'all 0.15s',
              }}
            >
              <Save size={16} /> {saving ? 'Guardando...' : 'Guardar cambios'}
            </button>
            <button
              onClick={() => setEditingId(null)}
              style={{
                padding: '10px 18px', background: 'transparent',
                border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
                color: 'var(--color-text-secondary)', fontSize: '14px', cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              Volver
            </button>
            {saveMsg && (
              <span style={{
                fontSize: '13px', fontWeight: 500,
                color: saveMsg.startsWith('Error') ? 'var(--color-danger)' : 'var(--color-success)',
              }}>
                {saveMsg}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Integration List */}
      {!showCreate && !editingId && (
        <>
          {loading ? <p style={{ color: 'var(--color-text-muted)', padding: '40px', textAlign: 'center' }}>Cargando...</p> : integrations.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--color-text-muted)' }}>
              <Plug size={40} style={{ marginBottom: '12px', opacity: 0.4 }} />
              <p style={{ fontSize: '16px', marginBottom: '4px' }}>No hay integraciones configuradas</p>
              <p style={{ fontSize: '13px' }}>Crea una integracion con WooCommerce para conectar tu tienda</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {integrations.map((i) => (
                <div
                  key={i.id}
                  style={{
                    ...sectionStyle, marginBottom: 0, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    transition: 'all 0.2s',
                  }}
                  onClick={() => openEdit(i)}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.2)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.4), 0 0 12px rgba(139, 92, 246, 0.1)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3), 0 0 1px rgba(139, 92, 246, 0.15)'; }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{
                      width: '42px', height: '42px', borderRadius: 'var(--radius-md)',
                      background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(232, 121, 249, 0.08))', display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                      border: '1px solid rgba(139, 92, 246, 0.12)',
                    }}>
                      <ShoppingCart size={20} style={{ color: '#a78bfa' }} />
                    </div>
                    <div>
                      <div style={{ fontSize: '15px', fontWeight: 600 }}>WooCommerce</div>
                      <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                        {(i.config as any)?.baseUrl || 'Sin URL configurada'}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {(i.config as any)?.enableProductSearch !== false && (
                        <span title="Busqueda de productos" style={{ padding: '3px 8px', fontSize: '11px', borderRadius: 'var(--radius-sm)', background: 'var(--color-success-light)', color: 'var(--color-success)' }}>Productos</span>
                      )}
                      {(i.config as any)?.enableCart !== false && (
                        <span title="Carrito" style={{ padding: '3px 8px', fontSize: '11px', borderRadius: 'var(--radius-sm)', background: 'var(--color-info-light)', color: 'var(--color-info)' }}>Carrito</span>
                      )}
                      {(i.config as any)?.enableOrderLookup !== false && (
                        <span title="Pedidos" style={{ padding: '3px 8px', fontSize: '11px', borderRadius: 'var(--radius-sm)', background: 'var(--color-warning-light)', color: 'var(--color-warning)' }}>Pedidos</span>
                      )}
                    </div>

                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: '6px',
                      fontSize: '13px', color: statusColors[i.status], fontWeight: 500,
                    }}>
                      <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: statusColors[i.status], boxShadow: i.status === 'active' ? '0 0 6px rgba(52, 211, 153, 0.4)' : 'none' }} />
                      {i.status === 'active' ? 'Activa' : 'Inactiva'}
                    </span>

                    <button
                      onClick={(e) => { e.stopPropagation(); toggleStatus(i.id, i.status); }}
                      style={{
                        padding: '5px 12px', background: 'transparent',
                        border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
                        color: 'var(--color-text-secondary)', fontSize: '12px', cursor: 'pointer',
                        fontWeight: 500, transition: 'all 0.15s',
                      }}
                    >
                      {i.status === 'active' ? 'Desactivar' : 'Activar'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
