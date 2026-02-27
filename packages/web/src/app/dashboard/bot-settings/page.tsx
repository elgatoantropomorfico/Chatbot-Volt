'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import {
  Save, Building2, MapPin, Clock, Phone, Package, Truck,
  Tag, Shield, HelpCircle, Sparkles, Bot, Brain, ShieldCheck, PhoneForwarded, Plus, Trash2,
} from 'lucide-react';

interface PromptBuilder {
  business: { name: string; industry: string; description: string; tone: string };
  location: { type: string; address: string; city: string; province: string; country: string; zone: string; notes: string };
  hours: { schedule: string; holidays: string; notes: string };
  contact: { phone: string; email: string; website: string; instagram: string; facebook: string; other: string };
  products: { description: string; categories: string; priceRange: string; notes: string };
  shipping: { methods: string; zones: string; costs: string; paymentMethods: string; notes: string };
  promotions: { active: string; conditions: string; validUntil: string };
  policies: { returns: string; warranty: string; exchanges: string; notes: string };
  faq: { question: string; answer: string }[];
  personality: { greeting: string; farewell: string; style: string; restrictions: string; language: string };
}

const defaultPB: PromptBuilder = {
  business: { name: '', industry: '', description: '', tone: '' },
  location: { type: '', address: '', city: '', province: '', country: '', zone: '', notes: '' },
  hours: { schedule: '', holidays: '', notes: '' },
  contact: { phone: '', email: '', website: '', instagram: '', facebook: '', other: '' },
  products: { description: '', categories: '', priceRange: '', notes: '' },
  shipping: { methods: '', zones: '', costs: '', paymentMethods: '', notes: '' },
  promotions: { active: '', conditions: '', validUntil: '' },
  policies: { returns: '', warranty: '', exchanges: '', notes: '' },
  faq: [],
  personality: { greeting: '', farewell: '', style: '', restrictions: '', language: '' },
};

const LOCATION_TYPES = [
  'Local comercial', 'Salón', 'Oficina', 'Showroom', 'Depósito', 'Fábrica',
  'Restaurante / Bar', 'Consultorio', 'Estudio', 'Coworking', 'Virtual / Solo online', 'Otro',
];

const TONE_OPTIONS = [
  'Formal y profesional', 'Amigable y cercano', 'Casual y relajado',
  'Técnico y preciso', 'Divertido y creativo', 'Corporativo',
];

type TabId = 'business' | 'location' | 'hours' | 'contact' | 'products' | 'shipping' | 'promotions' | 'policies' | 'faq' | 'personality' | 'engine' | 'guardrails' | 'handoff';

const TABS: { id: TabId; label: string; icon: any; group: string }[] = [
  { id: 'business', label: 'Negocio', icon: Building2, group: 'Contexto del Negocio' },
  { id: 'location', label: 'Ubicación', icon: MapPin, group: 'Contexto del Negocio' },
  { id: 'hours', label: 'Horarios', icon: Clock, group: 'Contexto del Negocio' },
  { id: 'contact', label: 'Contacto', icon: Phone, group: 'Contexto del Negocio' },
  { id: 'products', label: 'Productos', icon: Package, group: 'Contexto del Negocio' },
  { id: 'shipping', label: 'Envíos y Pagos', icon: Truck, group: 'Contexto del Negocio' },
  { id: 'promotions', label: 'Promociones', icon: Tag, group: 'Contexto del Negocio' },
  { id: 'policies', label: 'Políticas', icon: Shield, group: 'Contexto del Negocio' },
  { id: 'faq', label: 'FAQ', icon: HelpCircle, group: 'Contexto del Negocio' },
  { id: 'personality', label: 'Personalidad', icon: Sparkles, group: 'Contexto del Negocio' },
  { id: 'engine', label: 'Motor IA', icon: Brain, group: 'Configuración Técnica' },
  { id: 'guardrails', label: 'Guardrails', icon: ShieldCheck, group: 'Configuración Técnica' },
  { id: 'handoff', label: 'Derivación', icon: PhoneForwarded, group: 'Configuración Técnica' },
];

export default function BotSettingsPage() {
  const { user, isSuperAdmin, isTenantAdmin } = useAuth();
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tenants, setTenants] = useState<any[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [activeTab, setActiveTab] = useState<TabId>('business');

  const pb: PromptBuilder = settings?.promptBuilderJson || defaultPB;

  function updatePB(section: keyof PromptBuilder, value: any) {
    const updated = { ...pb, [section]: value };
    setSettings((prev: any) => ({ ...prev, promptBuilderJson: updated }));
  }

  function updatePBField(section: keyof PromptBuilder, field: string, value: any) {
    const current = (pb as any)[section] || {};
    updatePB(section, { ...current, [field]: value });
  }

  useEffect(() => {
    if (isSuperAdmin) {
      loadTenants();
    } else if (user?.tenantId) {
      setSelectedTenantId(user.tenantId);
      loadSettings(user.tenantId);
    }
  }, [user]);

  async function loadTenants() {
    try {
      const data = await api.getTenants();
      setTenants(data.tenants);
      if (data.tenants.length > 0) {
        setSelectedTenantId(data.tenants[0].id);
        await loadSettings(data.tenants[0].id);
      }
    } catch (err) { console.error(err); }
  }

  async function loadSettings(tenantId: string) {
    setLoading(true);
    try {
      const data = await api.getBotSettings(tenantId);
      setSettings(data.settings);
    } catch (err) {
      setSettings(null);
    } finally { setLoading(false); }
  }

  async function handleSave() {
    if (!selectedTenantId || !settings) return;
    setSaving(true);
    try {
      await api.updateBotSettings(selectedTenantId, {
        systemPrompt: settings.systemPrompt,
        model: settings.model,
        temperature: settings.temperature,
        maxContextMessages: settings.maxContextMessages,
        handoffEnabled: settings.handoffEnabled,
        handoffPhoneE164: settings.handoffPhoneE164,
        handoffMessageTemplate: settings.handoffMessageTemplate,
        handoffTriggersJson: settings.handoffTriggersJson,
        guardrailsJson: settings.guardrailsJson,
        promptBuilderJson: settings.promptBuilderJson || defaultPB,
      });
      alert('Configuración guardada');
    } catch (err: any) { alert(err.message); }
    finally { setSaving(false); }
  }

  function updateField(field: string, value: any) {
    setSettings((prev: any) => ({ ...prev, [field]: value }));
  }

  if (!isSuperAdmin && !isTenantAdmin) return <p style={{ color: 'var(--color-text-muted)' }}>Acceso denegado</p>;

  const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 12px', background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text)', fontSize: '14px', outline: 'none' };
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '4px', fontWeight: 500 };
  const textareaStyle: React.CSSProperties = { ...inputStyle, resize: 'vertical', minHeight: '80px' };
  const hintStyle: React.CSSProperties = { fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '3px' };
  const fieldGap: React.CSSProperties = { marginBottom: '14px' };

  function sectionHasContent(section: keyof PromptBuilder): boolean {
    const val = pb[section];
    if (Array.isArray(val)) return val.length > 0;
    if (typeof val === 'object' && val) return Object.values(val).some((v) => v && String(v).trim() !== '');
    return false;
  }

  function renderContent() {
    if (loading) return <p style={{ padding: '40px', color: 'var(--color-text-muted)' }}>Cargando...</p>;
    if (!settings) return <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-muted)' }}><Bot size={32} /><p>No hay configuración para este tenant</p></div>;

    switch (activeTab) {
      case 'business':
        return (
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>Negocio</h3>
            <p style={{ ...hintStyle, marginBottom: '20px' }}>Información general de tu negocio. El bot usará esto como contexto base.</p>
            <div style={fieldGap}>
              <label style={labelStyle}>Nombre del negocio</label>
              <input value={pb.business.name} onChange={(e) => updatePBField('business', 'name', e.target.value)} placeholder="Ej: Veo Veo Librería" style={inputStyle} />
            </div>
            <div style={fieldGap}>
              <label style={labelStyle}>Rubro / Industria</label>
              <input value={pb.business.industry} onChange={(e) => updatePBField('business', 'industry', e.target.value)} placeholder="Ej: Librería, Restaurante, Veterinaria..." style={inputStyle} />
            </div>
            <div style={fieldGap}>
              <label style={labelStyle}>Descripción del negocio</label>
              <textarea value={pb.business.description} onChange={(e) => updatePBField('business', 'description', e.target.value)} placeholder="Contá brevemente qué hace tu negocio, qué lo diferencia..." rows={4} style={textareaStyle} />
            </div>
            <div style={fieldGap}>
              <label style={labelStyle}>Tono de comunicación</label>
              <select value={pb.business.tone} onChange={(e) => updatePBField('business', 'tone', e.target.value)} style={inputStyle}>
                <option value="">Seleccionar...</option>
                {TONE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
        );

      case 'location':
        return (
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>Ubicación</h3>
            <p style={{ ...hintStyle, marginBottom: '20px' }}>Dónde se encuentra tu negocio. Completá solo lo que aplique.</p>
            <div style={fieldGap}>
              <label style={labelStyle}>Tipo de lugar</label>
              <select value={pb.location.type} onChange={(e) => updatePBField('location', 'type', e.target.value)} style={inputStyle}>
                <option value="">Seleccionar...</option>
                {LOCATION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', ...fieldGap }}>
              <div>
                <label style={labelStyle}>Dirección</label>
                <input value={pb.location.address} onChange={(e) => updatePBField('location', 'address', e.target.value)} placeholder="Ej: San Juan 868" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Zona / Barrio</label>
                <input value={pb.location.zone} onChange={(e) => updatePBField('location', 'zone', e.target.value)} placeholder="Ej: Centro" style={inputStyle} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', ...fieldGap }}>
              <div>
                <label style={labelStyle}>Ciudad</label>
                <input value={pb.location.city} onChange={(e) => updatePBField('location', 'city', e.target.value)} placeholder="Ej: Corrientes" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Provincia</label>
                <input value={pb.location.province} onChange={(e) => updatePBField('location', 'province', e.target.value)} placeholder="Ej: Corrientes" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>País</label>
                <input value={pb.location.country} onChange={(e) => updatePBField('location', 'country', e.target.value)} placeholder="Ej: Argentina" style={inputStyle} />
              </div>
            </div>
            <div style={fieldGap}>
              <label style={labelStyle}>Notas adicionales</label>
              <textarea value={pb.location.notes} onChange={(e) => updatePBField('location', 'notes', e.target.value)} placeholder="Ej: Frente a la plaza principal, a media cuadra del banco..." rows={2} style={textareaStyle} />
            </div>
          </div>
        );

      case 'hours':
        return (
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>Horarios</h3>
            <p style={{ ...hintStyle, marginBottom: '20px' }}>Horarios de atención. El bot informará estos horarios cuando le pregunten.</p>
            <div style={fieldGap}>
              <label style={labelStyle}>Horarios de atención</label>
              <textarea value={pb.hours.schedule} onChange={(e) => updatePBField('hours', 'schedule', e.target.value)} placeholder={"Ej:\nLunes a Viernes: 8:00 - 12:30 / 16:30 - 20:30\nSábados: 9:00 - 13:00\nDomingos: Cerrado"} rows={5} style={textareaStyle} />
              <p style={hintStyle}>Escribí los horarios como querés que el bot los comunique</p>
            </div>
            <div style={fieldGap}>
              <label style={labelStyle}>Feriados / Fechas especiales</label>
              <input value={pb.hours.holidays} onChange={(e) => updatePBField('hours', 'holidays', e.target.value)} placeholder="Ej: Cerrado feriados nacionales" style={inputStyle} />
            </div>
            <div style={fieldGap}>
              <label style={labelStyle}>Notas</label>
              <input value={pb.hours.notes} onChange={(e) => updatePBField('hours', 'notes', e.target.value)} placeholder="Ej: En verano horario reducido" style={inputStyle} />
            </div>
          </div>
        );

      case 'contact':
        return (
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>Contacto</h3>
            <p style={{ ...hintStyle, marginBottom: '20px' }}>Datos de contacto para que el bot los comparta cuando sea relevante.</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', ...fieldGap }}>
              <div>
                <label style={labelStyle}>Teléfono</label>
                <input value={pb.contact.phone} onChange={(e) => updatePBField('contact', 'phone', e.target.value)} placeholder="Ej: 3794789169" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Email</label>
                <input value={pb.contact.email} onChange={(e) => updatePBField('contact', 'email', e.target.value)} placeholder="info@tunegocio.com" style={inputStyle} />
              </div>
            </div>
            <div style={fieldGap}>
              <label style={labelStyle}>Sitio web</label>
              <input value={pb.contact.website} onChange={(e) => updatePBField('contact', 'website', e.target.value)} placeholder="https://www.tunegocio.com" style={inputStyle} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', ...fieldGap }}>
              <div>
                <label style={labelStyle}>Instagram</label>
                <input value={pb.contact.instagram} onChange={(e) => updatePBField('contact', 'instagram', e.target.value)} placeholder="@tunegocio" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Facebook</label>
                <input value={pb.contact.facebook} onChange={(e) => updatePBField('contact', 'facebook', e.target.value)} placeholder="facebook.com/tunegocio" style={inputStyle} />
              </div>
            </div>
            <div style={fieldGap}>
              <label style={labelStyle}>Otro</label>
              <input value={pb.contact.other} onChange={(e) => updatePBField('contact', 'other', e.target.value)} placeholder="TikTok, LinkedIn, etc." style={inputStyle} />
            </div>
          </div>
        );

      case 'products':
        return (
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>Productos / Servicios</h3>
            <p style={{ ...hintStyle, marginBottom: '20px' }}>Descripción general de lo que ofrecés. No es el catálogo (eso va por WooCommerce), sino contexto general.</p>
            <div style={fieldGap}>
              <label style={labelStyle}>Descripción general</label>
              <textarea value={pb.products.description} onChange={(e) => updatePBField('products', 'description', e.target.value)} placeholder="Ej: Vendemos libros infantiles, juveniles y para adultos. También tenemos juegos didácticos y artículos de librería." rows={4} style={textareaStyle} />
            </div>
            <div style={fieldGap}>
              <label style={labelStyle}>Categorías principales</label>
              <input value={pb.products.categories} onChange={(e) => updatePBField('products', 'categories', e.target.value)} placeholder="Ej: Libros infantiles, Libros juveniles, Juegos didácticos" style={inputStyle} />
            </div>
            <div style={fieldGap}>
              <label style={labelStyle}>Rango de precios</label>
              <input value={pb.products.priceRange} onChange={(e) => updatePBField('products', 'priceRange', e.target.value)} placeholder="Ej: $5.000 - $50.000" style={inputStyle} />
            </div>
            <div style={fieldGap}>
              <label style={labelStyle}>Notas</label>
              <textarea value={pb.products.notes} onChange={(e) => updatePBField('products', 'notes', e.target.value)} placeholder="Ej: Podemos hacer pedidos especiales de libros que no tengamos en stock" rows={2} style={textareaStyle} />
            </div>
          </div>
        );

      case 'shipping':
        return (
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>Envíos y Pagos</h3>
            <p style={{ ...hintStyle, marginBottom: '20px' }}>Información sobre envíos, entregas y medios de pago aceptados.</p>
            <div style={fieldGap}>
              <label style={labelStyle}>Métodos de envío</label>
              <textarea value={pb.shipping.methods} onChange={(e) => updatePBField('shipping', 'methods', e.target.value)} placeholder="Ej: Retiro en local, Envío por OCA, Correo Argentino, Cadete zona centro" rows={3} style={textareaStyle} />
            </div>
            <div style={fieldGap}>
              <label style={labelStyle}>Zonas de cobertura</label>
              <input value={pb.shipping.zones} onChange={(e) => updatePBField('shipping', 'zones', e.target.value)} placeholder="Ej: Corrientes Capital, envíos nacionales" style={inputStyle} />
            </div>
            <div style={fieldGap}>
              <label style={labelStyle}>Costos de envío</label>
              <input value={pb.shipping.costs} onChange={(e) => updatePBField('shipping', 'costs', e.target.value)} placeholder="Ej: Gratis en compras mayores a $20.000, sino $2.500" style={inputStyle} />
            </div>
            <div style={fieldGap}>
              <label style={labelStyle}>Medios de pago</label>
              <textarea value={pb.shipping.paymentMethods} onChange={(e) => updatePBField('shipping', 'paymentMethods', e.target.value)} placeholder="Ej: Efectivo, Transferencia, MercadoPago, Tarjeta de crédito (3 cuotas sin interés)" rows={3} style={textareaStyle} />
            </div>
            <div style={fieldGap}>
              <label style={labelStyle}>Notas</label>
              <input value={pb.shipping.notes} onChange={(e) => updatePBField('shipping', 'notes', e.target.value)} placeholder="Ej: Entregas en el día para zona centro" style={inputStyle} />
            </div>
          </div>
        );

      case 'promotions':
        return (
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>Promociones</h3>
            <p style={{ ...hintStyle, marginBottom: '20px' }}>Promociones vigentes que el bot puede comunicar.</p>
            <div style={fieldGap}>
              <label style={labelStyle}>Promociones activas</label>
              <textarea value={pb.promotions.active} onChange={(e) => updatePBField('promotions', 'active', e.target.value)} placeholder={"Ej:\n- 2x1 en libros infantiles\n- 20% OFF en la segunda unidad\n- Envío gratis comprando 3 o más"} rows={5} style={textareaStyle} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', ...fieldGap }}>
              <div>
                <label style={labelStyle}>Condiciones</label>
                <input value={pb.promotions.conditions} onChange={(e) => updatePBField('promotions', 'conditions', e.target.value)} placeholder="Ej: No acumulable con otras promos" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Válido hasta</label>
                <input type="date" value={pb.promotions.validUntil} onChange={(e) => updatePBField('promotions', 'validUntil', e.target.value)} style={inputStyle} />
              </div>
            </div>
          </div>
        );

      case 'policies':
        return (
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>Políticas</h3>
            <p style={{ ...hintStyle, marginBottom: '20px' }}>Políticas de devolución, garantía y cambios.</p>
            <div style={fieldGap}>
              <label style={labelStyle}>Devoluciones</label>
              <textarea value={pb.policies.returns} onChange={(e) => updatePBField('policies', 'returns', e.target.value)} placeholder="Ej: Se aceptan devoluciones dentro de los 7 días con ticket" rows={2} style={textareaStyle} />
            </div>
            <div style={fieldGap}>
              <label style={labelStyle}>Cambios</label>
              <textarea value={pb.policies.exchanges} onChange={(e) => updatePBField('policies', 'exchanges', e.target.value)} placeholder="Ej: Cambios dentro de los 30 días, producto sin uso" rows={2} style={textareaStyle} />
            </div>
            <div style={fieldGap}>
              <label style={labelStyle}>Garantía</label>
              <input value={pb.policies.warranty} onChange={(e) => updatePBField('policies', 'warranty', e.target.value)} placeholder="Ej: Garantía de fábrica 6 meses" style={inputStyle} />
            </div>
            <div style={fieldGap}>
              <label style={labelStyle}>Notas</label>
              <input value={pb.policies.notes} onChange={(e) => updatePBField('policies', 'notes', e.target.value)} placeholder="Ej: No se aceptan devoluciones de libros con uso" style={inputStyle} />
            </div>
          </div>
        );

      case 'faq':
        const faqItems = pb.faq || [];
        return (
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>Preguntas Frecuentes</h3>
            <p style={{ ...hintStyle, marginBottom: '20px' }}>Preguntas y respuestas predefinidas. El bot las usará como referencia.</p>
            {faqItems.map((item, idx) => (
              <div key={idx} style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '14px', marginBottom: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontWeight: 600 }}>FAQ #{idx + 1}</span>
                  <button onClick={() => { const updated = faqItems.filter((_, i) => i !== idx); updatePB('faq', updated); }} style={{ background: 'none', border: 'none', color: 'var(--color-danger)', padding: '2px' }}><Trash2 size={14} /></button>
                </div>
                <div style={{ marginBottom: '8px' }}>
                  <label style={labelStyle}>Pregunta</label>
                  <input value={item.question} onChange={(e) => { const updated = [...faqItems]; updated[idx] = { ...updated[idx], question: e.target.value }; updatePB('faq', updated); }} placeholder="Ej: ¿Hacen envíos al interior?" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Respuesta</label>
                  <textarea value={item.answer} onChange={(e) => { const updated = [...faqItems]; updated[idx] = { ...updated[idx], answer: e.target.value }; updatePB('faq', updated); }} placeholder="Ej: Sí, hacemos envíos a todo el país por Correo Argentino y OCA." rows={2} style={textareaStyle} />
                </div>
              </div>
            ))}
            <button onClick={() => updatePB('faq', [...faqItems, { question: '', answer: '' }])} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: 'var(--color-primary-light)', color: 'var(--color-primary)', border: '1px solid var(--color-primary)', borderRadius: 'var(--radius-sm)', fontSize: '13px', fontWeight: 500 }}>
              <Plus size={14} /> Agregar pregunta
            </button>
          </div>
        );

      case 'personality':
        return (
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>Personalidad</h3>
            <p style={{ ...hintStyle, marginBottom: '20px' }}>Cómo debe comportarse y comunicarse el bot.</p>
            <div style={fieldGap}>
              <label style={labelStyle}>Saludo inicial</label>
              <input value={pb.personality.greeting} onChange={(e) => updatePBField('personality', 'greeting', e.target.value)} placeholder="Ej: ¡Hola! Bienvenido/a a Veo Veo Librería. ¿En qué puedo ayudarte?" style={inputStyle} />
            </div>
            <div style={fieldGap}>
              <label style={labelStyle}>Despedida</label>
              <input value={pb.personality.farewell} onChange={(e) => updatePBField('personality', 'farewell', e.target.value)} placeholder="Ej: ¡Gracias por tu consulta! Cualquier cosa, estamos acá." style={inputStyle} />
            </div>
            <div style={fieldGap}>
              <label style={labelStyle}>Estilo de respuesta</label>
              <textarea value={pb.personality.style} onChange={(e) => updatePBField('personality', 'style', e.target.value)} placeholder="Ej: Respuestas cortas y directas, usa emojis, tutea al cliente" rows={3} style={textareaStyle} />
            </div>
            <div style={fieldGap}>
              <label style={labelStyle}>Restricciones</label>
              <textarea value={pb.personality.restrictions} onChange={(e) => updatePBField('personality', 'restrictions', e.target.value)} placeholder="Ej: No hablar de política, no recomendar competidores, no dar consejos médicos" rows={3} style={textareaStyle} />
            </div>
            <div style={fieldGap}>
              <label style={labelStyle}>Idioma</label>
              <input value={pb.personality.language} onChange={(e) => updatePBField('personality', 'language', e.target.value)} placeholder="Ej: Español argentino" style={inputStyle} />
            </div>
          </div>
        );

      case 'engine':
        return (
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>Motor IA</h3>
            <p style={{ ...hintStyle, marginBottom: '20px' }}>Configuración técnica del modelo de IA.</p>
            <div style={fieldGap}>
              <label style={labelStyle}>System Prompt base</label>
              <textarea value={settings.systemPrompt} onChange={(e) => updateField('systemPrompt', e.target.value)} rows={6} style={{ ...textareaStyle, minHeight: '120px' }} />
              <p style={hintStyle}>Este es el prompt base. El contexto del negocio (secciones de arriba) se agrega automáticamente.</p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
              <div>
                <label style={labelStyle}>Modelo</label>
                <select value={settings.model} onChange={(e) => updateField('model', e.target.value)} style={inputStyle}>
                  <option value="gpt-4o-mini">gpt-4o-mini</option>
                  <option value="gpt-4o">gpt-4o</option>
                  <option value="gpt-4-turbo">gpt-4-turbo</option>
                  <option value="gpt-3.5-turbo">gpt-3.5-turbo</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Temperatura</label>
                <input type="number" value={settings.temperature} onChange={(e) => updateField('temperature', parseFloat(e.target.value))} min={0} max={2} step={0.1} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Contexto (msgs)</label>
                <input type="number" value={settings.maxContextMessages} onChange={(e) => updateField('maxContextMessages', parseInt(e.target.value))} min={1} max={50} style={inputStyle} />
              </div>
            </div>
          </div>
        );

      case 'guardrails':
        return (
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>Restricciones (Guardrails)</h3>
            <p style={{ ...hintStyle, marginBottom: '20px' }}>Reglas que el bot debe cumplir siempre. Se inyectan automáticamente en cada respuesta.</p>
            {settings.guardrailsJson && Array.isArray(settings.guardrailsJson) ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {(settings.guardrailsJson as Array<{ id: string; label: string; prompt: string; enabled: boolean }>).map((guardrail, idx) => (
                  <label key={guardrail.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 12px', background: guardrail.enabled ? 'rgba(139, 92, 246, 0.08)' : 'transparent', border: `1px solid ${guardrail.enabled ? 'var(--color-primary)' : 'var(--color-border)'}`, borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={guardrail.enabled} onChange={(e) => { const updated = [...settings.guardrailsJson]; updated[idx] = { ...updated[idx], enabled: e.target.checked }; updateField('guardrailsJson', updated); }} style={{ marginTop: '2px', accentColor: 'var(--color-primary)' }} />
                    <div>
                      <span style={{ fontSize: '13px', fontWeight: 500 }}>{guardrail.label}</span>
                      <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px', lineHeight: 1.4 }}>{guardrail.prompt}</p>
                    </div>
                  </label>
                ))}
              </div>
            ) : <p style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>No hay guardrails configurados.</p>}
          </div>
        );

      case 'handoff':
        return (
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>Derivación a humano</h3>
            <p style={{ ...hintStyle, marginBottom: '20px' }}>Configurá cuándo y cómo el bot deriva la conversación a un humano.</p>
            <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <label style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>Habilitado</label>
              <input type="checkbox" checked={settings.handoffEnabled} onChange={(e) => updateField('handoffEnabled', e.target.checked)} style={{ accentColor: 'var(--color-primary)' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', ...fieldGap }}>
              <div>
                <label style={labelStyle}>Teléfono humano (E.164)</label>
                <input value={settings.handoffPhoneE164 || ''} onChange={(e) => updateField('handoffPhoneE164', e.target.value)} placeholder="5491100000000" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Keywords de derivación</label>
                <input value={(settings.handoffTriggersJson?.keywords || []).join(', ')} onChange={(e) => updateField('handoffTriggersJson', { ...settings.handoffTriggersJson, keywords: e.target.value.split(',').map((k: string) => k.trim()).filter(Boolean) })} placeholder="humano, asesor, reclamo" style={inputStyle} />
              </div>
            </div>
            <div>
              <label style={labelStyle}>Plantilla de mensaje</label>
              <textarea value={settings.handoffMessageTemplate || ''} onChange={(e) => updateField('handoffMessageTemplate', e.target.value)} rows={3} style={textareaStyle} placeholder="Te derivo con un asesor: {{wa_me_link}}" />
            </div>
          </div>
        );

      default:
        return null;
    }
  }

  const groups = [...new Set(TABS.map((t) => t.group))];

  return (
    <div style={{ display: 'flex', gap: '0', height: 'calc(100vh - 80px)', maxHeight: 'calc(100vh - 80px)' }}>
      {/* Sidebar */}
      <div style={{ width: '220px', minWidth: '220px', background: 'var(--color-surface)', borderRight: '1px solid var(--color-border)', borderRadius: 'var(--radius-md) 0 0 var(--radius-md)', overflowY: 'auto', padding: '12px 0' }}>
        {isSuperAdmin && tenants.length > 0 && (
          <div style={{ padding: '0 12px 12px', borderBottom: '1px solid var(--color-border)', marginBottom: '8px' }}>
            <label style={{ ...labelStyle, fontSize: '10px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>Tenant</label>
            <select value={selectedTenantId} onChange={(e) => { setSelectedTenantId(e.target.value); loadSettings(e.target.value); }} style={{ ...inputStyle, fontSize: '12px', padding: '5px 8px' }}>
              {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        )}
        {groups.map((group) => (
          <div key={group}>
            <div style={{ padding: '8px 16px 4px', fontSize: '10px', textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: 'var(--color-text-muted)', fontWeight: 600 }}>{group}</div>
            {TABS.filter((t) => t.group === group).map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              const hasContent = ['engine', 'guardrails', 'handoff'].includes(tab.id) ? false : sectionHasContent(tab.id as keyof PromptBuilder);
              return (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '7px 16px', background: isActive ? 'var(--color-primary-light)' : 'transparent', color: isActive ? 'var(--color-primary)' : 'var(--color-text-secondary)', border: 'none', borderLeft: isActive ? '3px solid var(--color-primary)' : '3px solid transparent', fontSize: '13px', fontWeight: isActive ? 600 : 400, textAlign: 'left' as const, transition: 'all 0.1s' }}>
                  <Icon size={15} />
                  <span style={{ flex: 1 }}>{tab.label}</span>
                  {hasContent && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--color-success)' }} />}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 24px', borderBottom: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
          <h1 style={{ fontSize: '18px', fontWeight: 700 }}>Configuración del Bot</h1>
          <button onClick={handleSave} disabled={saving || !settings} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 16px', background: 'var(--color-primary)', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '13px', fontWeight: 500, opacity: saving ? 0.6 : 1 }}>
            <Save size={15} /> {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {renderContent()}
        </div>
      </div>
    </div>
  );
}
