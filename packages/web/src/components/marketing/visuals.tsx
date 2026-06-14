'use client';

import {
  Bot,
  BarChart3,
  Calendar,
  Code2,
  Facebook,
  Instagram,
  MessageSquare,
  ShoppingCart,
  Users,
  Inbox,
  Sparkles,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { VoltLogo } from '@/components/ui/VoltLogo';

export function HeroOrbs() {
  return null;
}

export function IntegrationsLogoBar() {
  const techs = [
    'WhatsApp Cloud API',
    'OpenAI GPT-4',
    'WooCommerce',
    'Meta Business',
    'Zoho CRM',
    'Cloudflare R2',
  ];
  return (
    <section
      style={{
        padding: '40px 24px',
        borderTop: '1px solid var(--color-border)',
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      <div style={{ maxWidth: 1200, margin: '0 auto', textAlign: 'center' }}>
        <p
          style={{
            fontSize: 12,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: 'var(--color-text-muted)',
            marginBottom: 20,
          }}
        >
          Integrado con las plataformas que ya usás
        </p>
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 12,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          {techs.map((t) => (
            <span key={t} className="mkt-tech-pill">{t}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ChatMockup({ variant = 'commerce' }: { variant?: 'commerce' | 'leads' | 'turnos' }) {
  const messages =
    variant === 'leads'
      ? [
          { from: 'user', text: 'Hola, quiero info sobre la carrera de marketing' },
          { from: 'bot', text: '¡Hola! 👋 Te ayudo con eso.\n\n¿Podés confirmarme tu nombre completo?' },
          { from: 'user', text: 'Soy María López' },
          { from: 'bot', text: 'Perfecto María. ¿Preferís modalidad *presencial* o *virtual*?' },
        ]
      : variant === 'turnos'
      ? [
          { from: 'user', text: 'Necesito un turno con cardiología' },
          { from: 'bot', text: 'Claro. ¿Tenés obra social o es particular?' },
          { from: 'user', text: 'OSDE 310' },
          { from: 'bot', text: '✅ Turno tentativo *miércoles 10:30* con Dr. García.\nTe envío confirmación por WhatsApp.' },
        ]
      : [
          { from: 'user', text: 'Hola! Tienen el libro Sapiens?' },
          {
            from: 'bot',
            text: '¡Hola! 📚 Sí, te muestro opciones:\n\n1. *Sapiens* — $18.990\n2. *Homo Deus* — $16.500\n\nEscribí el número para agregar al carrito 🛒',
          },
          { from: 'user', text: 'El 1' },
          { from: 'bot', text: '✅ *Sapiens* agregado al carrito.\n\n_Si querés, sigo con la búsqueda de productos._' },
        ];

  return (
    <div className="mkt-mockup-panel" style={{ maxWidth: 700, width: '100%', margin: '0 auto' }}>
      <MockHeader title="Volt Assistant" subtitle="Online" icon={<VoltLogo size={32} />} />
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 360 }}>
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              alignSelf: msg.from === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '85%',
              padding: '10px 14px',
              borderRadius: 14,
              background:
                msg.from === 'user'
                  ? 'linear-gradient(135deg, #7c3aed, #8b5cf6)'
                  : 'var(--color-bg-tertiary)',
              border: msg.from === 'user' ? 'none' : '1px solid var(--color-border)',
              fontSize: 13,
              lineHeight: 1.5,
              whiteSpace: 'pre-line',
              color: msg.from === 'user' ? '#fff' : 'var(--color-text)',
            }}
          >
            {msg.text}
          </div>
        ))}
      </div>
    </div>
  );
}

export function DashboardMockup() {
  const stats = [
    { label: 'Conversaciones', value: '1.284', color: '#8b5cf6' },
    { label: 'Leads nuevos', value: '86', color: '#34d399' },
    { label: 'Tasa respuesta', value: '98%', color: '#67e8f9' },
  ];

  return (
    <div className="mkt-mockup-panel" style={{ maxWidth: 720, width: '100%', margin: '0 auto' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '12px 16px',
          background: 'var(--color-bg-secondary)',
          borderBottom: '1px solid var(--color-border)',
          fontSize: 12,
          color: 'var(--color-text-muted)',
        }}
      >
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#fb7185' }} />
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#fbbf24' }} />
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#34d399' }} />
        <span style={{ marginLeft: 8 }}>panel.volt.app — Dashboard</span>
      </div>
      <div style={{ display: 'flex', minHeight: 280 }}>
        <div
          style={{
            width: 72,
            padding: 12,
            borderRight: '1px solid var(--color-border)',
            background: 'var(--color-bg-secondary)',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <VoltLogo size={22} />
          {[Inbox, Users, BarChart3, MessageSquare].map((Icon, i) => (
            <div
              key={i}
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: i === 0 ? 'var(--color-primary-light)' : 'transparent',
                border: i === 0 ? '1px solid var(--color-border-light)' : '1px solid transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: i === 0 ? 'var(--color-primary)' : 'var(--color-text-muted)',
              }}
            >
              <Icon size={16} />
            </div>
          ))}
        </div>
        <div style={{ flex: 1, padding: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
            {stats.map((s) => (
              <div
                key={s.label}
                style={{
                  padding: 12,
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--color-bg-tertiary)',
                  border: '1px solid var(--color-border)',
                }}
              >
                <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>
          <div
            style={{
              padding: 12,
              borderRadius: 'var(--radius-md)',
              background: 'var(--color-bg-tertiary)',
              border: '1px solid var(--color-border)',
            }}
          >
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 8 }}>Inbox — últimas conversaciones</div>
            {['Veo Veo Librería', 'CardioCor', 'Taller Alfa'].map((name, i) => (
              <div
                key={name}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '8px 0',
                  borderBottom: i < 2 ? '1px solid var(--color-border)' : 'none',
                  fontSize: 12,
                }}
              >
                <span style={{ color: 'var(--color-text)' }}>{name}</span>
                <span style={{ color: 'var(--color-success)', fontSize: 11 }}>Activo</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function MetaHubVisual() {
  const channels = [
    { name: 'WhatsApp', color: '#25D366', icon: <MessageSquare size={22} /> },
    { name: 'Instagram', color: '#E4405F', icon: <Instagram size={22} /> },
    { name: 'Facebook', color: '#1877F2', icon: <Facebook size={22} /> },
  ];
  return (
    <div className="mkt-mockup-panel" style={{ maxWidth: 560, width: '100%', margin: '0 auto', padding: 28 }}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            margin: '0 auto 12px',
            background: 'linear-gradient(135deg, #7c3aed, #e879f9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Sparkles size={26} color="#fff" />
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>Hub Volt</div>
        <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Canales unificados</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {channels.map((ch) => (
          <div
            key={ch.name}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '14px 16px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--color-bg-tertiary)',
              border: `1px solid ${ch.color}40`,
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: `${ch.color}18`,
                color: ch.color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {ch.icon}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{ch.name}</div>
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>→ CRM · Bot · Equipo humano</div>
            </div>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-success)' }} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function TurnosVisual() {
  const slots = ['09:00', '10:30', '11:00', '15:00'];
  return (
    <div className="mkt-mockup-panel" style={{ maxWidth: 480, width: '100%', margin: '0 auto', padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <Calendar size={20} color="var(--color-success)" />
        <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>Agenda automática</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
        {slots.map((t, i) => (
          <div
            key={t}
            style={{
              padding: '12px 14px',
              borderRadius: 'var(--radius-md)',
              background: i === 1 ? 'var(--color-primary-light)' : 'var(--color-bg-tertiary)',
              border: i === 1 ? '1px solid var(--color-border-glow)' : '1px solid var(--color-border)',
              fontSize: 13,
              fontWeight: i === 1 ? 700 : 500,
              color: i === 1 ? 'var(--color-primary-hover)' : 'var(--color-text-secondary)',
              textAlign: 'center',
            }}
          >
            {t}
          </div>
        ))}
      </div>
      <div
        style={{
          padding: 14,
          borderRadius: 'var(--radius-md)',
          background: 'var(--color-success-light)',
          border: '1px solid rgba(52, 211, 153, 0.25)',
          fontSize: 12,
          color: 'var(--color-text-secondary)',
        }}
      >
        Ticket #1842 · Consulta reprogramada · Derivado a recepción
      </div>
    </div>
  );
}

export function SoftwareVisual() {
  const modules = ['CRM', 'API', 'Dashboard', 'E-commerce', 'Logística', 'IA'];
  return (
    <div className="mkt-mockup-panel" style={{ maxWidth: 520, width: '100%', margin: '0 auto', padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <Code2 size={20} color="#e879f9" />
        <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>Arquitectura a medida</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        {modules.map((m) => (
          <div
            key={m}
            style={{
              padding: 16,
              borderRadius: 'var(--radius-md)',
              background: 'var(--color-bg-tertiary)',
              border: '1px solid var(--color-border)',
              textAlign: 'center',
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--color-primary-hover)',
            }}
          >
            {m}
          </div>
        ))}
      </div>
      <div
        style={{
          marginTop: 16,
          padding: 12,
          borderRadius: 'var(--radius-md)',
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--color-text-muted)',
          background: '#0a0a14',
          border: '1px solid var(--color-border)',
        }}
      >
        <span style={{ color: '#e879f9' }}>const</span> solution = buildForClient(processes);
      </div>
    </div>
  );
}

export function FeatureCardsRow() {
  const items = [
    { icon: <Bot size={20} />, color: '#8b5cf6', title: 'Bot IA', desc: 'Respuestas 24/7' },
    { icon: <ShoppingCart size={20} />, color: '#e879f9', title: 'Ventas', desc: 'Catálogo + carrito' },
    { icon: <Users size={20} />, color: '#34d399', title: 'Leads', desc: 'Captura automática' },
    { icon: <Inbox size={20} />, color: '#67e8f9', title: 'Inbox', desc: 'Todo en un panel' },
  ];
  return (
    <div
      className="landing-grid-4"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: 14,
        maxWidth: 720,
        margin: '0 auto',
      }}
    >
      {items.map((item) => (
        <div key={item.title} className="mkt-glass-card" style={{ padding: 16, textAlign: 'center' }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              margin: '0 auto 10px',
              background: `${item.color}15`,
              border: `1px solid ${item.color}30`,
              color: item.color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {item.icon}
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{item.title}</div>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>{item.desc}</div>
        </div>
      ))}
    </div>
  );
}

export type HeroVisualType = 'chat' | 'dashboard' | 'meta' | 'turnos' | 'software' | 'features';

export function HeroVisual({ type }: { type: HeroVisualType }) {
  switch (type) {
    case 'chat':
      return <ChatMockup />;
    case 'dashboard':
      return <DashboardMockup />;
    case 'meta':
      return <MetaHubVisual />;
    case 'turnos':
      return <TurnosVisual />;
    case 'software':
      return <SoftwareVisual />;
    case 'features':
      return <FeatureCardsRow />;
    default:
      return <ChatMockup />;
  }
}

function MockHeader({
  title,
  subtitle,
  icon,
}: {
  title: string;
  subtitle: string;
  icon: ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '14px 20px',
        background: 'var(--color-bg-secondary)',
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      {icon}
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{title}</div>
        <div style={{ fontSize: 11, color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-success)' }} />
          {subtitle}
        </div>
      </div>
    </div>
  );
}

export function SplitSection({
  children,
  visual,
  visualPosition = 'right',
  alt,
}: {
  children: ReactNode;
  visual: ReactNode;
  visualPosition?: 'left' | 'right';
  alt?: boolean;
}) {
  return (
    <section style={{ padding: '80px 24px', background: alt ? 'var(--color-bg-secondary)' : undefined }}>
      <div
        className="landing-split"
        style={{
          maxWidth: 1100,
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 48,
          alignItems: 'center',
        }}
      >
        <div style={{ order: visualPosition === 'left' ? 2 : 1 }}>{children}</div>
        <div
          style={{
            order: visualPosition === 'left' ? 1 : 2,
            animation: 'fade-in-up 0.6s ease-out both',
          }}
        >
          {visual}
        </div>
      </div>
    </section>
  );
}
