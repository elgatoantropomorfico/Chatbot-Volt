'use client';

import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { useState, useEffect } from 'react';
import { 
  MessageSquare, Users, Clock, TrendingUp, ShoppingCart, Phone, Bot,
  Building2, Plus, X, Hash, Plug, UserCircle, ChevronRight, Edit3, Trash2, Check, Save,
} from 'lucide-react';
import styles from './layout.module.css';

// ════════════════════════════════════════════
// SUPER ADMIN PANEL — Tenant Management
// ════════════════════════════════════════════

function SuperAdminPanel() {
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTenant, setSelectedTenant] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<'general' | 'channel' | 'users'>('general');
  const [showNewTenant, setShowNewTenant] = useState(false);
  const [newTenantName, setNewTenantName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => { loadTenants(); }, []);

  async function loadTenants() {
    setLoading(true);
    try {
      const data = await api.getTenants();
      setTenants(data.tenants);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  async function handleCreateTenant(e: React.FormEvent) {
    e.preventDefault();
    if (!newTenantName.trim()) return;
    setCreating(true);
    try {
      await api.createTenant({ name: newTenantName.trim() });
      setNewTenantName('');
      setShowNewTenant(false);
      await loadTenants();
    } catch (err: any) { alert(err.message); }
    finally { setCreating(false); }
  }

  async function openTenantDetail(tenant: any) {
    try {
      const data = await api.getTenant(tenant.id);
      setSelectedTenant(data.tenant);
      setActiveTab('general');
    } catch (err) { console.error(err); }
  }

  if (loading) {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h1 style={{ fontSize: '26px', fontWeight: 700, letterSpacing: '-0.02em' }}>Tenants</h1>
            <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '4px' }}>Gestión de cuentas y configuración</p>
          </div>
        </div>
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--color-text-muted)' }}>Cargando...</div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: 700, letterSpacing: '-0.02em' }}>Tenants</h1>
          <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '4px' }}>{tenants.length} cuenta{tenants.length !== 1 ? 's' : ''} registrada{tenants.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => setShowNewTenant(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 18px',
            background: 'linear-gradient(135deg, #7c3aed, #8b5cf6)', color: 'white', border: 'none',
            borderRadius: 'var(--radius-sm)', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(139, 92, 246, 0.3)',
          }}
        >
          <Plus size={16} /> Nuevo tenant
        </button>
      </div>

      {/* New Tenant Form */}
      {showNewTenant && (
        <form onSubmit={handleCreateTenant} style={{
          display: 'flex', gap: '12px', marginBottom: '20px', padding: '16px',
          background: 'var(--color-surface)', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)', alignItems: 'flex-end',
        }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '6px', fontWeight: 600 }}>Nombre del tenant</label>
            <input
              value={newTenantName}
              onChange={(e) => setNewTenantName(e.target.value)}
              placeholder="Ej: Mi Tienda"
              autoFocus
              style={{
                width: '100%', padding: '10px 14px', background: 'var(--color-bg-secondary)',
                border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
                color: 'var(--color-text)', fontSize: '14px', outline: 'none',
              }}
            />
          </div>
          <button type="submit" disabled={creating} style={{
            padding: '10px 20px', background: 'linear-gradient(135deg, #7c3aed, #8b5cf6)',
            color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '13px',
            fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
          }}>
            {creating ? 'Creando...' : 'Crear'}
          </button>
          <button type="button" onClick={() => { setShowNewTenant(false); setNewTenantName(''); }} style={{
            padding: '10px 14px', background: 'transparent', border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)', color: 'var(--color-text-muted)', cursor: 'pointer',
          }}>
            <X size={16} />
          </button>
        </form>
      )}

      {/* Tenant Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
        {tenants.map((tenant) => (
          <div
            key={tenant.id}
            onClick={() => openTenantDetail(tenant)}
            style={{
              padding: '20px', background: 'var(--color-surface)', border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-lg)', cursor: 'pointer', transition: 'all 0.2s',
              position: 'relative', overflow: 'hidden',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.4)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.transform = 'translateY(0)'; }}
          >
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: tenant.status === 'active' ? 'linear-gradient(90deg, #34d399, #10b981, transparent)' : 'linear-gradient(90deg, #f59e0b, #fbbf24, transparent)' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                  <Building2 size={18} style={{ color: 'var(--color-primary)' }} />
                  <span style={{ fontSize: '15px', fontWeight: 600 }}>{tenant.name}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11px', fontWeight: 500,
                    padding: '2px 8px', borderRadius: '10px',
                    background: tenant.status === 'active' ? 'rgba(52, 211, 153, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                    color: tenant.status === 'active' ? '#34d399' : '#f59e0b',
                  }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'currentColor' }} />
                    {tenant.status === 'active' ? 'Activo' : tenant.status}
                  </span>
                </div>
              </div>
              <ChevronRight size={18} style={{ color: 'var(--color-text-muted)' }} />
            </div>
            <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: 'var(--color-text-muted)' }}>
              <span><strong>{tenant._count?.users || 0}</strong> usuarios</span>
              <span><strong>{tenant._count?.channels || 0}</strong> canales</span>
              <span><strong>{tenant._count?.leads || 0}</strong> leads</span>
            </div>
          </div>
        ))}
      </div>

      {/* Tenant Detail Modal */}
      {selectedTenant && (
        <TenantDetailModal
          tenant={selectedTenant}
          onClose={() => setSelectedTenant(null)}
          onRefresh={async () => {
            await loadTenants();
            const data = await api.getTenant(selectedTenant.id);
            setSelectedTenant(data.tenant);
          }}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
        />
      )}
    </div>
  );
}

// ════════════════════════════════════════════
// TENANT DETAIL MODAL
// ════════════════════════════════════════════

function TenantDetailModal({ tenant, onClose, onRefresh, activeTab, setActiveTab }: {
  tenant: any;
  onClose: () => void;
  onRefresh: () => Promise<void>;
  activeTab: 'general' | 'channel' | 'users';
  setActiveTab: (tab: 'general' | 'channel' | 'users') => void;
}) {
  const overlayStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000,
    display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px',
  };
  const modalStyle: React.CSSProperties = {
    background: 'var(--color-bg)', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: '700px', maxHeight: '85vh',
    overflow: 'hidden', display: 'flex', flexDirection: 'column',
    boxShadow: '0 20px 60px rgba(0,0,0,0.5), 0 0 1px rgba(139,92,246,0.2)',
  };
  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '10px 20px', fontSize: '13px', fontWeight: active ? 600 : 400, cursor: 'pointer',
    color: active ? 'var(--color-primary)' : 'var(--color-text-muted)', background: 'transparent',
    border: 'none', borderBottom: active ? '2px solid var(--color-primary)' : '2px solid transparent',
    transition: 'all 0.15s',
  });
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px', background: 'var(--color-bg-secondary)',
    border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
    color: 'var(--color-text)', fontSize: '14px', outline: 'none',
  };
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '12px', color: 'var(--color-text-muted)',
    marginBottom: '6px', fontWeight: 600,
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '20px 24px', borderBottom: '1px solid var(--color-border)',
        }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '2px' }}>{tenant.name}</h2>
            <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>ID: {tenant.id}</span>
          </div>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer',
            padding: '6px', borderRadius: 'var(--radius-sm)',
          }}>
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)', paddingLeft: '12px' }}>
          <button style={tabStyle(activeTab === 'general')} onClick={() => setActiveTab('general')}>General</button>
          <button style={tabStyle(activeTab === 'channel')} onClick={() => setActiveTab('channel')}>Canal WhatsApp</button>
          <button style={tabStyle(activeTab === 'users')} onClick={() => setActiveTab('users')}>Usuarios</button>
        </div>

        {/* Tab Content */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          {activeTab === 'general' && (
            <TenantGeneralTab tenant={tenant} inputStyle={inputStyle} labelStyle={labelStyle} onRefresh={onRefresh} />
          )}
          {activeTab === 'channel' && (
            <TenantChannelTab tenant={tenant} inputStyle={inputStyle} labelStyle={labelStyle} onRefresh={onRefresh} />
          )}
          {activeTab === 'users' && (
            <TenantUsersTab tenant={tenant} inputStyle={inputStyle} labelStyle={labelStyle} onRefresh={onRefresh} />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── GENERAL TAB ───
function TenantGeneralTab({ tenant, inputStyle, labelStyle, onRefresh }: any) {
  const [name, setName] = useState(tenant.name);
  const [status, setStatus] = useState(tenant.status);
  const [timezone, setTimezone] = useState(tenant.timezone || 'America/Argentina/Buenos_Aires');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await api.updateTenant(tenant.id, { name, status, timezone });
      await onRefresh();
    } catch (err: any) { alert(err.message); }
    finally { setSaving(false); }
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
      <div style={{ display: 'flex', gap: '10px', fontSize: '12px', color: 'var(--color-text-muted)', padding: '12px', background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-sm)' }}>
        <div><strong>Leads:</strong> {tenant._count?.leads || 0}</div>
        <div>·</div>
        <div><strong>Conversaciones:</strong> {tenant._count?.conversations || 0}</div>
        <div>·</div>
        <div><strong>Usuarios:</strong> {tenant._count?.users || 0}</div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={handleSave} disabled={saving} style={{
          display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 22px',
          background: 'linear-gradient(135deg, #7c3aed, #8b5cf6)', color: 'white',
          border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
        }}>
          <Save size={14} /> {saving ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </div>
  );
}

// ─── CHANNEL TAB ───
function TenantChannelTab({ tenant, inputStyle, labelStyle, onRefresh }: any) {
  const channel = tenant.channels?.[0];
  const [phoneNumberId, setPhoneNumberId] = useState(channel?.phoneNumberId || '');
  const [wabaId, setWabaId] = useState(channel?.wabaId || '');
  const [displayPhone, setDisplayPhone] = useState(channel?.displayPhone || '');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  async function handleSave() {
    setSaving(true);
    setSaveMsg(null);
    try {
      if (channel) {
        await api.updateChannel(channel.id, { phoneNumberId, wabaId, displayPhone });
      } else {
        await api.createChannel({ tenantId: tenant.id, phoneNumberId, wabaId, displayPhone });
      }
      await onRefresh();
      setSaveMsg({ type: 'ok', text: '✅ Canal guardado correctamente' });
    } catch (err: any) {
      setSaveMsg({ type: 'err', text: `❌ Error: ${err.message}` });
    }
    finally { setSaving(false); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px',
        background: channel ? 'rgba(52, 211, 153, 0.08)' : 'rgba(245, 158, 11, 0.08)',
        border: `1px solid ${channel ? 'rgba(52, 211, 153, 0.2)' : 'rgba(245, 158, 11, 0.2)'}`,
        borderRadius: 'var(--radius-sm)', fontSize: '13px',
        color: channel ? '#34d399' : '#f59e0b',
      }}>
        <Phone size={16} />
        {channel ? 'Canal de WhatsApp configurado' : 'Sin canal de WhatsApp configurado'}
      </div>

      <div>
        <label style={labelStyle}>Phone Number ID (Meta)</label>
        <input value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)} style={inputStyle} placeholder="Ej: 1050917248094220" />
      </div>
      <div>
        <label style={labelStyle}>WABA ID (WhatsApp Business Account)</label>
        <input value={wabaId} onChange={(e) => setWabaId(e.target.value)} style={inputStyle} placeholder="Ej: 758213103745093" />
      </div>
      <div>
        <label style={labelStyle}>Teléfono visible</label>
        <input value={displayPhone} onChange={(e) => setDisplayPhone(e.target.value)} style={inputStyle} placeholder="Ej: +54 9 11 1234-5678" />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '12px' }}>
        {saveMsg && (
          <span style={{ fontSize: '13px', color: saveMsg.type === 'ok' ? '#34d399' : '#f87171' }}>{saveMsg.text}</span>
        )}
        <button onClick={handleSave} disabled={saving} style={{
          display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 22px',
          background: 'linear-gradient(135deg, #7c3aed, #8b5cf6)', color: 'white',
          border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
        }}>
          <Save size={14} /> {saving ? 'Guardando...' : channel ? 'Actualizar canal' : 'Crear canal'}
        </button>
      </div>
    </div>
  );
}

// ─── USERS TAB ───
function TenantUsersTab({ tenant, inputStyle, labelStyle, onRefresh }: any) {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewUser, setShowNewUser] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', role: 'tenant_admin' });
  const [creating, setCreating] = useState(false);

  useEffect(() => { loadUsers(); }, []);

  async function loadUsers() {
    setLoading(true);
    try {
      const data = await api.getUsers();
      const tenantUsers = data.users.filter((u: any) => u.tenantId === tenant.id);
      setUsers(tenantUsers);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    if (!form.email || !form.password) return;
    setCreating(true);
    try {
      await api.createUser({ ...form, tenantId: tenant.id });
      setForm({ email: '', password: '', role: 'tenant_admin' });
      setShowNewUser(false);
      await loadUsers();
    } catch (err: any) { alert(err.message); }
    finally { setCreating(false); }
  }

  if (loading) return <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-muted)' }}>Cargando usuarios...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>{users.length} usuario{users.length !== 1 ? 's' : ''}</span>
        <button onClick={() => setShowNewUser(!showNewUser)} style={{
          display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px', fontSize: '12px',
          background: 'linear-gradient(135deg, #7c3aed, #8b5cf6)', color: 'white', border: 'none',
          borderRadius: 'var(--radius-sm)', fontWeight: 600, cursor: 'pointer',
        }}>
          <Plus size={14} /> Nuevo usuario
        </button>
      </div>

      {showNewUser && (
        <form onSubmit={handleCreateUser} style={{
          padding: '16px', background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-sm)',
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px',
        }}>
          <div>
            <label style={labelStyle}>Email</label>
            <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} type="email" required style={inputStyle} placeholder="email@ejemplo.com" />
          </div>
          <div>
            <label style={labelStyle}>Contraseña</label>
            <input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} type="password" required style={inputStyle} placeholder="min. 6 caracteres" />
          </div>
          <div>
            <label style={labelStyle}>Rol</label>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} style={inputStyle}>
              <option value="tenant_admin">Admin</option>
              <option value="agent">Agente</option>
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
            <button type="submit" disabled={creating} style={{
              padding: '10px 18px', background: 'linear-gradient(135deg, #7c3aed, #8b5cf6)', color: 'white',
              border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
            }}>
              {creating ? 'Creando...' : 'Crear'}
            </button>
            <button type="button" onClick={() => setShowNewUser(false)} style={{
              padding: '10px 14px', background: 'transparent', border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)', color: 'var(--color-text-muted)', cursor: 'pointer',
            }}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {users.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '30px', color: 'var(--color-text-muted)', fontSize: '13px' }}>
          No hay usuarios. Creá uno para que pueda acceder al panel del tenant.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {users.map((u) => (
            <div key={u.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '12px 16px', background: 'var(--color-bg-secondary)',
              borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <UserCircle size={18} style={{ color: 'var(--color-text-muted)' }} />
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 500 }}>{u.email}</div>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                    {u.role === 'tenant_admin' ? 'Admin' : 'Agente'}
                  </div>
                </div>
              </div>
              <span style={{
                fontSize: '11px', padding: '2px 8px', borderRadius: '10px',
                background: u.isActive !== false ? 'rgba(52, 211, 153, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                color: u.isActive !== false ? '#34d399' : '#f59e0b',
              }}>
                {u.isActive !== false ? 'Activo' : 'Inactivo'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


// ════════════════════════════════════════════
// TENANT DASHBOARD — Stats for tenant users
// ════════════════════════════════════════════

interface DashboardStats {
  conversations: { total: number; active: number; pendingHuman: number };
  leads: { total: number; newToday: number; newThisWeek: number };
  messages: { total: number; todayCount: number; avgResponseTime: number };
  sales?: { total: number; todayRevenue: number; pendingOrders: number };
}

function TenantDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try { const data = await api.getDashboardStats(); setStats(data); }
      catch (err) { console.error(err); }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) {
    return (
      <div>
        <div className={styles.pageHeader}>
          <h1>Dashboard</h1>
          <p>Bienvenido, {user?.email}</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{
              padding: '24px 28px', background: 'var(--color-surface)', border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-lg)', height: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{ color: 'var(--color-text-muted)' }}>Cargando...</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className={styles.pageHeader}>
        <h1>Dashboard</h1>
        <p>Bienvenido, {user?.email}</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '24px', marginBottom: '32px' }}>
        <StatCard icon={<MessageSquare size={20} />} label="Conversaciones activas" value={stats?.conversations.active?.toString() || '0'} subtitle={`${stats?.conversations.total || 0} total`} color="#8b5cf6" glow="rgba(139, 92, 246, 0.15)" />
        <StatCard icon={<Users size={20} />} label="Leads nuevos hoy" value={stats?.leads.newToday?.toString() || '0'} subtitle={`${stats?.leads.newThisWeek || 0} esta semana`} color="#34d399" glow="rgba(52, 211, 153, 0.15)" />
        <StatCard icon={<Phone size={20} />} label="Atención humana" value={stats?.conversations.pendingHuman?.toString() || '0'} subtitle="Conversaciones pendientes" color="#fbbf24" glow="rgba(251, 191, 36, 0.15)" />
        <StatCard icon={<Bot size={20} />} label="Mensajes hoy" value={stats?.messages.todayCount?.toString() || '0'} subtitle={`${stats?.messages.total || 0} total`} color="#06b6d4" glow="rgba(6, 182, 212, 0.15)" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '24px', marginBottom: '32px' }}>
        {stats?.sales && (
          <>
            <StatCard icon={<ShoppingCart size={20} />} label="Ventas hoy" value={`$${stats.sales.todayRevenue?.toLocaleString('es-AR') || '0'}`} subtitle={`${stats.sales.total || 0} órdenes total`} color="#10b981" glow="rgba(16, 185, 129, 0.15)" />
            <StatCard icon={<Clock size={20} />} label="Órdenes pendientes" value={stats.sales.pendingOrders?.toString() || '0'} subtitle="Esperando confirmación" color="#f59e0b" glow="rgba(245, 158, 11, 0.15)" />
          </>
        )}
        {stats?.messages.avgResponseTime ? (
          <StatCard icon={<TrendingUp size={20} />} label="Tiempo de respuesta" value={stats.messages.avgResponseTime < 60 ? `${Math.round(stats.messages.avgResponseTime)}s` : `${Math.round(stats.messages.avgResponseTime / 60)}min`} subtitle="Promedio de respuesta del bot" color="#8b5cf6" glow="rgba(139, 92, 246, 0.15)" />
        ) : null}
      </div>
    </div>
  );
}


// ════════════════════════════════════════════
// SHARED COMPONENTS
// ════════════════════════════════════════════

function StatCard({ icon, label, value, subtitle, color, glow }: {
  icon?: React.ReactNode; label: string; value: string; subtitle?: string; color: string; glow: string;
}) {
  return (
    <div style={{
      padding: '24px 28px', background: 'var(--color-surface)', border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)', position: 'relative', overflow: 'hidden',
      transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)', cursor: 'default',
      boxShadow: `0 2px 8px rgba(0,0,0,0.3), 0 0 1px ${glow}`,
    }}
    onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 8px 32px rgba(0,0,0,0.4), 0 0 20px ${glow}`; e.currentTarget.style.borderColor = `${color}30`; }}
    onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = `0 2px 8px rgba(0,0,0,0.3), 0 0 1px ${glow}`; e.currentTarget.style.borderColor = 'var(--color-border)'; }}
    >
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: `linear-gradient(90deg, ${color}, ${color}80, transparent)` }} />
      <div style={{ position: 'absolute', top: '-40px', right: '-40px', width: '120px', height: '120px', background: `radial-gradient(circle, ${glow} 0%, transparent 70%)`, pointerEvents: 'none' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px', position: 'relative' }}>
        {icon && <div style={{ color }}>{icon}</div>}
        <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', fontWeight: 500 }}>{label}</div>
      </div>
      <div style={{ fontSize: '32px', fontWeight: 800, color, letterSpacing: '-0.02em', position: 'relative', marginBottom: '4px' }}>{value}</div>
      {subtitle && <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', position: 'relative' }}>{subtitle}</div>}
    </div>
  );
}


// ════════════════════════════════════════════
// MAIN PAGE ROUTER
// ════════════════════════════════════════════

export default function DashboardPage() {
  const { isSuperAdmin } = useAuth();
  return isSuperAdmin ? <SuperAdminPanel /> : <TenantDashboard />;
}
