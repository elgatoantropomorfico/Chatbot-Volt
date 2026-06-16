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
  Cloud,
  Mail,
} from 'lucide-react';
import { VoltDrawer } from '@/components/ui/VoltDrawer';
import { VoltModal } from '@/components/ui/VoltModal';

interface WooConfig {
  baseUrl: string;
  consumerKey: string;
  consumerSecret: string;
  maxSearchResults: number;
  enableProductSearch: boolean;
  enableOrderLookup: boolean;
  enableCart: boolean;
  exitShopOnCheckout: boolean;
  checkoutMode: 'wa_human' | 'mercadopago';
  checkoutPhone: string;
}

interface MercadoPagoConfig {
  accessToken: string;
  publicKey: string;
}

const defaultMpConfig: MercadoPagoConfig = {
  accessToken: '',
  publicKey: '',
};

interface ResendConfig {
  apiKey: string;
  fromEmail: string;
  fromName: string;
}

const defaultResendConfig: ResendConfig = {
  apiKey: '',
  fromEmail: '',
  fromName: '',
};

interface ZohoConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  moduleApiName: string;
  dedupeField: string;
  fieldMapping: Record<string, string>;
  fixedValues: Record<string, string>;
}

const defaultWooConfig: WooConfig = {
  baseUrl: '',
  consumerKey: '',
  consumerSecret: '',
  maxSearchResults: 10,
  enableProductSearch: true,
  enableOrderLookup: true,
  enableCart: true,
  exitShopOnCheckout: true,
  checkoutMode: 'wa_human',
  checkoutPhone: '',
};

const defaultZohoConfig: ZohoConfig = {
  clientId: '',
  clientSecret: '',
  refreshToken: '',
  moduleApiName: 'Contacts',
  dedupeField: 'Mobile',
  fieldMapping: {},
  fixedValues: {},
};

export default function IntegrationsPage() {
  const { user, isSuperAdmin, isTenantAdmin } = useAuth();
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [config, setConfig] = useState<WooConfig>({ ...defaultWooConfig });
  const [zohoConfig, setZohoConfig] = useState<ZohoConfig>({ ...defaultZohoConfig });
  const [mpConfig, setMpConfig] = useState<MercadoPagoConfig>({ ...defaultMpConfig });
  const [resendConfig, setResendConfig] = useState<ResendConfig>({ ...defaultResendConfig });
  const [createForm, setCreateForm] = useState({ tenantId: '', type: 'woocommerce' });
  const [editType, setEditType] = useState<string>('woocommerce');
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
    setEditType(integration.type);
    if (integration.type === 'zoho_crm') {
      setZohoConfig({
        clientId: c.clientId || '',
        clientSecret: c.clientSecret || '',
        refreshToken: c.refreshToken || '',
        moduleApiName: c.moduleApiName || 'Contacts',
        dedupeField: c.dedupeField || 'Mobile',
        fieldMapping: c.fieldMapping || {},
        fixedValues: c.fixedValues || {},
      });
    } else if (integration.type === 'mercadopago') {
      setMpConfig({
        accessToken: c.accessToken || '',
        publicKey: c.publicKey || '',
      });
    } else if (integration.type === 'resend') {
      setResendConfig({
        apiKey: c.apiKey || '',
        fromEmail: c.fromEmail || '',
        fromName: c.fromName || '',
      });
    } else if (integration.type !== 'pilot_crm') {
      setConfig({
        baseUrl: c.baseUrl || '',
        consumerKey: c.consumerKey || '',
        consumerSecret: c.consumerSecret || '',
        maxSearchResults: c.maxSearchResults ?? 10,
        enableProductSearch: c.enableProductSearch !== false,
        enableOrderLookup: c.enableOrderLookup !== false,
        enableCart: c.enableCart !== false,
        exitShopOnCheckout: c.exitShopOnCheckout !== false,
        checkoutMode: c.checkoutMode || 'wa_human',
        checkoutPhone: c.checkoutPhone || '',
      });
    }
    setEditingId(integration.id);
    setShowCreate(false);
    setSaveMsg('');
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const cfgPayload = createForm.type === 'zoho_crm' ? { ...zohoConfig }
        : createForm.type === 'pilot_crm' ? { serverConfigured: true }
        : createForm.type === 'mercadopago' ? { ...mpConfig }
        : createForm.type === 'resend' ? { ...resendConfig }
        : { ...config };
      await api.createIntegration({
        tenantId: isTenantAdmin ? user?.tenantId : createForm.tenantId,
        type: createForm.type,
        config: cfgPayload,
      });
      setShowCreate(false);
      setConfig({ ...defaultWooConfig });
      setZohoConfig({ ...defaultZohoConfig });
      setMpConfig({ ...defaultMpConfig });
      setResendConfig({ ...defaultResendConfig });
      await loadIntegrations();
    } catch (err: any) { alert(err.message); }
    finally { setSaving(false); }
  }

  async function handleSave() {
    if (!editingId) return;
    setSaving(true);
    setSaveMsg('');
    try {
      const cfgPayload = editType === 'zoho_crm' ? { ...zohoConfig }
        : editType === 'pilot_crm' ? { serverConfigured: true }
        : editType === 'mercadopago' ? { ...mpConfig }
        : editType === 'resend' ? { ...resendConfig }
        : { ...config };
      await api.updateIntegration(editingId, { config: cfgPayload });
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
    background: 'var(--elevated-surface)',
    border: '1px solid var(--elevated-border)',
    borderRadius: '18px',
    padding: '20px 22px',
    marginBottom: '16px',
    backdropFilter: 'blur(16px)',
    boxShadow: 'var(--shadow-card)',
    position: 'relative',
    overflow: 'hidden',
  };
  const sectionTitleStyle: React.CSSProperties = {
    fontSize: '15px', fontWeight: 700, marginBottom: '18px',
    display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--color-text)',
    letterSpacing: '-0.01em',
  };
  const toggleWrapStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 0', borderBottom: '1px solid var(--divider)',
  };

  function renderResendConfigForm() {
    return (
      <div style={{ ...sectionStyle, marginBottom: '16px' }}>
        <label style={labelStyle}>API Key</label>
        <input
          type="password"
          value={resendConfig.apiKey}
          onChange={(e) => setResendConfig({ ...resendConfig, apiKey: e.target.value })}
          placeholder="re_..."
          required
          style={inputStyle}
        />
        <label style={{ ...labelStyle, marginTop: '12px' }}>Email remitente</label>
        <input
          type="email"
          value={resendConfig.fromEmail}
          onChange={(e) => setResendConfig({ ...resendConfig, fromEmail: e.target.value })}
          placeholder="turnos@tudominio.com"
          required
          style={inputStyle}
        />
        <label style={{ ...labelStyle, marginTop: '12px' }}>Nombre remitente (opcional)</label>
        <input
          value={resendConfig.fromName}
          onChange={(e) => setResendConfig({ ...resendConfig, fromName: e.target.value })}
          placeholder="El Gabinete Holístico"
          style={inputStyle}
        />
        <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '12px', lineHeight: 1.5 }}>
          El dominio del email remitente debe estar verificado en{' '}
          <a href="https://resend.com/domains" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary)' }}>
            Resend
          </a>
          . El destinatario de avisos de turnos se configura en Bot/IA → Turnos.
        </p>
      </div>
    );
  }

  function renderMpConfigForm() {
    return (
      <div style={{ ...sectionStyle, marginBottom: '16px' }}>
        <label style={labelStyle}>Access Token</label>
        <input
          type="password"
          value={mpConfig.accessToken}
          onChange={(e) => setMpConfig({ ...mpConfig, accessToken: e.target.value })}
          placeholder="APP_USR-..."
          required
          style={inputStyle}
        />
        <label style={{ ...labelStyle, marginTop: '12px' }}>Public Key (opcional)</label>
        <input
          value={mpConfig.publicKey}
          onChange={(e) => setMpConfig({ ...mpConfig, publicKey: e.target.value })}
          placeholder="APP_USR-..."
          style={inputStyle}
        />
        <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '12px', lineHeight: 1.5 }}>
          No hace falta configurar webhook en Mercado Pago Developers: cada link de pago incluye automáticamente
          la <code style={{ fontSize: '11px' }}>notification_url</code> del backend para confirmar el turno.
          Solo necesitás el Access Token productivo acá.
        </p>
      </div>
    );
  }

  function renderZohoConfigForm() {
    return (
      <>
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>
            <Cloud size={18} style={{ color: '#f59e0b' }} />
            Credenciales Zoho CRM
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px' }}>
            <div>
              <label style={labelStyle}>Client ID</label>
              <input
                value={zohoConfig.clientId}
                onChange={(e) => setZohoConfig({ ...zohoConfig, clientId: e.target.value })}
                placeholder="1000.XXXXXXXXXXXXXXX"
                style={{ ...inputStyle, fontFamily: 'var(--font-mono)', fontSize: '13px' }}
              />
            </div>
            <div>
              <label style={labelStyle}>Client Secret</label>
              <input
                type="password"
                value={zohoConfig.clientSecret}
                onChange={(e) => setZohoConfig({ ...zohoConfig, clientSecret: e.target.value })}
                placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                style={{ ...inputStyle, fontFamily: 'var(--font-mono)', fontSize: '13px' }}
              />
            </div>
            <div>
              <label style={labelStyle}>Refresh Token</label>
              <input
                type="password"
                value={zohoConfig.refreshToken}
                onChange={(e) => setZohoConfig({ ...zohoConfig, refreshToken: e.target.value })}
                placeholder="1000.xxxxxxxx.xxxxxxxx"
                style={{ ...inputStyle, fontFamily: 'var(--font-mono)', fontSize: '13px' }}
              />
            </div>
          </div>
        </div>

        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>
            <Settings2 size={18} style={{ color: 'var(--color-info)' }} />
            Configuracion del modulo
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={labelStyle}>Modulo API Name</label>
              <input
                value={zohoConfig.moduleApiName}
                onChange={(e) => setZohoConfig({ ...zohoConfig, moduleApiName: e.target.value })}
                placeholder="Contacts"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Campo de deduplicacion</label>
              <input
                value={zohoConfig.dedupeField}
                onChange={(e) => setZohoConfig({ ...zohoConfig, dedupeField: e.target.value })}
                placeholder="Mobile"
                style={inputStyle}
              />
            </div>
          </div>
          <div style={{ marginTop: '12px', padding: '12px', background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
            <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>
              El mapeo de campos y valores fijos se configuran automaticamente.
              Los campos del cliente (nombre, email, DNI, oferta, modalidad, periodo) se extraen de la conversacion por IA.
            </div>
          </div>
        </div>
      </>
    );
  }

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

            {/* Exit shopping mode on checkout */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', padding: '12px', background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 500 }}>Salir del modo compra al finalizar</div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                  Cuando el cliente completa el checkout, se desactiva automáticamente el modo compra y vuelve al chat normal.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setConfig({ ...config, exitShopOnCheckout: !config.exitShopOnCheckout })}
                style={{
                  width: '44px', height: '24px', borderRadius: '12px', border: 'none', cursor: 'pointer',
                  background: config.exitShopOnCheckout ? 'var(--color-success)' : 'var(--color-border)',
                  position: 'relative', transition: 'background 0.2s', flexShrink: 0, marginLeft: '12px',
                }}
              >
                <span style={{
                  position: 'absolute', top: '2px', width: '20px', height: '20px', borderRadius: '50%',
                  background: 'white', transition: 'left 0.2s',
                  left: config.exitShopOnCheckout ? '22px' : '2px',
                }} />
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="volt-config-wrapper-list">
      <div className="volt-page-header">
        <div>
          <h1 className="volt-page-title">Integraciones</h1>
          <p className="volt-page-sub">Conectá WooCommerce, CRM, Mercado Pago y más con tu asistente.</p>
        </div>
        {!showCreate && !editingId && (
          <button
            type="button"
            onClick={() => { setShowCreate(true); setEditingId(null); setConfig({ ...defaultWooConfig }); setZohoConfig({ ...defaultZohoConfig }); setMpConfig({ ...defaultMpConfig }); setCreateForm({ tenantId: '', type: 'woocommerce' }); }}
            className="volt-btn-primary"
          >
            <Plus size={16} /> Nueva integración
          </button>
        )}
      </div>

      <VoltModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Nueva integración"
        subtitle="Elegí el tipo y configurá la conexión con tu servicio."
        width={620}
      >
        <div className="volt-config-page">
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

            <div style={{ ...sectionStyle, marginBottom: '16px' }}>
              <label style={labelStyle}>Tipo de integracion</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                <button type="button" onClick={() => setCreateForm({ ...createForm, type: 'woocommerce' })} style={{ flex: '1 1 45%', minWidth: '140px', padding: '14px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', border: createForm.type === 'woocommerce' ? '2px solid var(--color-primary)' : '1px solid var(--color-border)', background: createForm.type === 'woocommerce' ? 'var(--color-primary-light)' : 'var(--color-bg-secondary)', color: 'var(--color-text)', textAlign: 'left' as const }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <ShoppingCart size={16} style={{ color: '#a78bfa' }} />
                    <span style={{ fontWeight: 600, fontSize: '14px' }}>WooCommerce</span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>E-commerce, productos, carrito</div>
                </button>
                <button type="button" onClick={() => setCreateForm({ ...createForm, type: 'zoho_crm' })} style={{ flex: '1 1 45%', minWidth: '140px', padding: '14px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', border: createForm.type === 'zoho_crm' ? '2px solid #f59e0b' : '1px solid var(--color-border)', background: createForm.type === 'zoho_crm' ? 'rgba(245, 158, 11, 0.08)' : 'var(--color-bg-secondary)', color: 'var(--color-text)', textAlign: 'left' as const }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <Cloud size={16} style={{ color: '#f59e0b' }} />
                    <span style={{ fontWeight: 600, fontSize: '14px' }}>Zoho CRM</span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Captura de clientes, sync automatico</div>
                </button>
                <button type="button" onClick={() => setCreateForm({ ...createForm, type: 'pilot_crm' })} style={{ flex: '1 1 45%', minWidth: '140px', padding: '14px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', border: createForm.type === 'pilot_crm' ? '2px solid #3b82f6' : '1px solid var(--color-border)', background: createForm.type === 'pilot_crm' ? 'rgba(59, 130, 246, 0.08)' : 'var(--color-bg-secondary)', color: 'var(--color-text)', textAlign: 'left' as const }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <Cloud size={16} style={{ color: '#3b82f6' }} />
                    <span style={{ fontWeight: 600, fontSize: '14px' }}>Pilot CRM</span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Concesionarias, sync Pilot Solution</div>
                </button>
                <button type="button" onClick={() => setCreateForm({ ...createForm, type: 'mercadopago' })} style={{ flex: '1 1 45%', minWidth: '140px', padding: '14px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', border: createForm.type === 'mercadopago' ? '2px solid #00b1ea' : '1px solid var(--color-border)', background: createForm.type === 'mercadopago' ? 'rgba(0, 177, 234, 0.08)' : 'var(--color-bg-secondary)', color: 'var(--color-text)', textAlign: 'left' as const }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <CreditCard size={16} style={{ color: '#00b1ea' }} />
                    <span style={{ fontWeight: 600, fontSize: '14px' }}>Mercado Pago</span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Señas y pagos de turnera</div>
                </button>
                <button type="button" onClick={() => setCreateForm({ ...createForm, type: 'resend' })} style={{ flex: '1 1 45%', minWidth: '140px', padding: '14px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', border: createForm.type === 'resend' ? '2px solid #6366f1' : '1px solid var(--color-border)', background: createForm.type === 'resend' ? 'rgba(99, 102, 241, 0.08)' : 'var(--color-bg-secondary)', color: 'var(--color-text)', textAlign: 'left' as const }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <Mail size={16} style={{ color: '#6366f1' }} />
                    <span style={{ fontWeight: 600, fontSize: '14px' }}>Resend</span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Emails de confirmación de turnos</div>
                </button>
              </div>
            </div>

            {createForm.type === 'zoho_crm' ? renderZohoConfigForm()
              : createForm.type === 'pilot_crm' ? (
                <div style={{ padding: '16px', background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-md)', marginBottom: '16px', fontSize: '14px', color: 'var(--color-text-secondary)' }}>
                  Las credenciales de Pilot (appkey, suborigen, etc.) se configuran en las variables de entorno del servidor Railway. Activá esta integración y configurá los campos en <strong>Pilot CRM</strong>.
                </div>
              ) : createForm.type === 'mercadopago' ? renderMpConfigForm()
              : createForm.type === 'resend' ? renderResendConfigForm()
              : renderConfigForm(true)}

            <div style={{ display: 'flex', gap: '10px', marginTop: '8px', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setShowCreate(false)} className="volt-btn-ghost">
                Cancelar
              </button>
              <button type="submit" disabled={saving} className="volt-btn-primary">
                <Save size={16} /> {saving ? 'Creando...' : 'Crear integración'}
              </button>
            </div>
          </form>
        </div>
      </VoltModal>

      <VoltDrawer open={!!editingId} onClose={() => setEditingId(null)} width={560}>
        <div className="volt-config-page">
          <div className="volt-page-header" style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0 }}>
              Configurar {editType === 'zoho_crm' ? 'Zoho CRM' : editType === 'pilot_crm' ? 'Pilot CRM' : editType === 'mercadopago' ? 'Mercado Pago' : editType === 'resend' ? 'Resend' : 'WooCommerce'}
            </h2>
            <button type="button" onClick={() => setEditingId(null)} className="volt-btn-ghost" style={{ padding: '6px 10px' }}>
              <X size={18} />
            </button>
          </div>

          {editType === 'zoho_crm' ? renderZohoConfigForm()
            : editType === 'pilot_crm' ? (
              <div className="volt-panel" style={{ marginBottom: 16 }}>
                <div className="volt-panel-body" style={{ fontSize: '14px', color: 'var(--color-text-secondary)' }}>
                  Credenciales Pilot configuradas en el servidor. Gestioná campos de captura en el menú <strong>Pilot CRM</strong>.
                </div>
              </div>
            ) : editType === 'mercadopago' ? renderMpConfigForm()
            : editType === 'resend' ? renderResendConfigForm()
            : renderConfigForm(false)}

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px', flexWrap: 'wrap' }}>
            <button type="button" onClick={handleSave} disabled={saving} className="volt-btn-primary">
              <Save size={16} /> {saving ? 'Guardando...' : 'Guardar cambios'}
            </button>
            <button type="button" onClick={() => setEditingId(null)} className="volt-btn-ghost">
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
      </VoltDrawer>

      {loading ? (
        <p className="volt-empty">Cargando...</p>
      ) : integrations.length === 0 ? (
        <div className="volt-empty volt-panel">
          <Plug size={40} style={{ marginBottom: '12px', opacity: 0.4 }} />
          <p style={{ fontSize: '16px', marginBottom: '4px' }}>No hay integraciones configuradas</p>
          <p style={{ fontSize: '13px' }}>Creá una integración para conectar tu servicio</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {integrations.map((i) => (
            <div
              key={i.id}
              className="volt-integration-card"
              onClick={() => openEdit(i)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') openEdit(i); }}
            >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div className="volt-integration-icon" style={{
                      background: i.type === 'zoho_crm'
                        ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(251, 191, 36, 0.08))'
                        : i.type === 'pilot_crm'
                          ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(96, 165, 250, 0.08))'
                          : i.type === 'mercadopago'
                            ? 'linear-gradient(135deg, rgba(0, 177, 234, 0.15), rgba(56, 189, 248, 0.08))'
                          : i.type === 'resend'
                            ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(129, 140, 248, 0.08))'
                          : 'linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(232, 121, 249, 0.08))',
                      display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                      border: i.type === 'zoho_crm' ? '1px solid rgba(245, 158, 11, 0.12)'
                        : i.type === 'pilot_crm' ? '1px solid rgba(59, 130, 246, 0.12)'
                        : i.type === 'mercadopago' ? '1px solid rgba(0, 177, 234, 0.12)'
                        : i.type === 'resend' ? '1px solid rgba(99, 102, 241, 0.12)'
                        : '1px solid rgba(139, 92, 246, 0.12)',
                    }}>
                      {i.type === 'zoho_crm' ? <Cloud size={20} style={{ color: '#f59e0b' }} />
                        : i.type === 'pilot_crm' ? <Cloud size={20} style={{ color: '#3b82f6' }} />
                        : i.type === 'mercadopago' ? <CreditCard size={20} style={{ color: '#00b1ea' }} />
                        : i.type === 'resend' ? <Mail size={20} style={{ color: '#6366f1' }} />
                        : <ShoppingCart size={20} style={{ color: '#a78bfa' }} />}
                    </div>
                    <div>
                      <div style={{ fontSize: '15px', fontWeight: 600 }}>
                        {i.type === 'zoho_crm' ? 'Zoho CRM' : i.type === 'pilot_crm' ? 'Pilot CRM' : i.type === 'mercadopago' ? 'Mercado Pago' : i.type === 'resend' ? 'Resend' : 'WooCommerce'}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                        {i.type === 'zoho_crm'
                          ? `Modulo: ${(i.config as any)?.moduleApiName || 'Contacts'}`
                          : i.type === 'pilot_crm'
                            ? 'Credenciales en servidor Railway'
                            : i.type === 'mercadopago'
                              ? ((i.config as any)?.accessToken ? 'Token configurado' : 'Sin token')
                            : i.type === 'resend'
                              ? ((i.config as any)?.fromEmail || 'Sin remitente')
                            : ((i.config as any)?.baseUrl || 'Sin URL configurada')}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {i.type === 'zoho_crm' ? (
                        <>
                          <span style={{ padding: '3px 8px', fontSize: '11px', borderRadius: 'var(--radius-sm)', background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}>Clientes</span>
                          <span style={{ padding: '3px 8px', fontSize: '11px', borderRadius: 'var(--radius-sm)', background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}>Auto-sync</span>
                        </>
                      ) : i.type === 'mercadopago' ? (
                        <span style={{ padding: '3px 8px', fontSize: '11px', borderRadius: 'var(--radius-sm)', background: 'rgba(0, 177, 234, 0.1)', color: '#00b1ea' }}>Turnera</span>
                      ) : i.type === 'resend' ? (
                        <span style={{ padding: '3px 8px', fontSize: '11px', borderRadius: 'var(--radius-sm)', background: 'rgba(99, 102, 241, 0.1)', color: '#6366f1' }}>Turnera</span>
                      ) : i.type === 'pilot_crm' ? null : (
                        <>
                          {(i.config as any)?.enableProductSearch !== false && (
                            <span title="Busqueda de productos" style={{ padding: '3px 8px', fontSize: '11px', borderRadius: 'var(--radius-sm)', background: 'var(--color-success-light)', color: 'var(--color-success)' }}>Productos</span>
                          )}
                          {(i.config as any)?.enableCart !== false && (
                            <span title="Carrito" style={{ padding: '3px 8px', fontSize: '11px', borderRadius: 'var(--radius-sm)', background: 'var(--color-info-light)', color: 'var(--color-info)' }}>Carrito</span>
                          )}
                          {(i.config as any)?.enableOrderLookup !== false && (
                            <span title="Pedidos" style={{ padding: '3px 8px', fontSize: '11px', borderRadius: 'var(--radius-sm)', background: 'var(--color-warning-light)', color: 'var(--color-warning)' }}>Pedidos</span>
                          )}
                        </>
                      )}
                    </div>

                    <span className={`volt-status-pill ${i.status === 'active' ? 'volt-status-active' : 'volt-status-inactive'}`}>
                      {i.status === 'active' ? 'Activa' : 'Inactiva'}
                    </span>

                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); toggleStatus(i.id, i.status); }}
                      className="volt-btn-ghost"
                      style={{ padding: '5px 12px', fontSize: '12px' }}
                    >
                      {i.status === 'active' ? 'Desactivar' : 'Activar'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
    </div>
  );
}
