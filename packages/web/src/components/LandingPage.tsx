'use client';

import {
  Zap, MessageSquare, Bot, ShoppingCart, BarChart3, Shield,
  Users, ArrowRight, CheckCircle2, Sparkles, Globe,
  Send, Star,
} from 'lucide-react';

const PLATFORM_LOGIN = '/login';

export default function LandingPage() {
  return (
    <div style={{ minHeight: '100vh', overflow: 'hidden' }}>
      <Navbar />
      <Hero />
      <LogoBar />
      <Features />
      <HowItWorks />
      <Integrations />
      <Pricing />
      <CTASection />
      <Footer />

      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
        }
        @keyframes pulse-glow {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes gradient-shift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .landing-nav-link:hover { color: var(--color-text) !important; }
        .landing-card:hover {
          border-color: var(--color-border-light) !important;
          box-shadow: var(--shadow-card-hover) !important;
          transform: translateY(-2px);
        }
        .landing-cta-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 0 30px rgba(139, 92, 246, 0.4), 0 0 80px rgba(232, 121, 249, 0.15) !important;
        }
        .landing-ghost-btn:hover {
          background: var(--color-surface-hover) !important;
          border-color: var(--color-border-light) !important;
        }
        @media (max-width: 768px) {
          .landing-nav-links { display: none !important; }
          .landing-hero-btns { flex-direction: column !important; align-items: stretch !important; }
          .landing-grid-3 { grid-template-columns: 1fr !important; }
          .landing-grid-4 { grid-template-columns: 1fr !important; }
          .landing-footer-inner { flex-direction: column !important; text-align: center !important; }
        }
      `}</style>
    </div>
  );
}

/* ─── NAVBAR ─── */
function Navbar() {
  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
      background: 'rgba(6, 6, 12, 0.8)', backdropFilter: 'blur(20px)',
      borderBottom: '1px solid var(--color-border)',
    }}>
      <div style={{
        maxWidth: 1200, margin: '0 auto', padding: '0 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        height: 64,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10,
            background: 'linear-gradient(135deg, #8b5cf6, #e879f9)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Zap size={18} color="#fff" />
          </div>
          <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.03em' }}>
            <span style={{ color: '#fff' }}>Volt</span>
            <span style={{ color: 'var(--color-text-muted)' }}> ChatBot</span>
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
          <div className="landing-nav-links" style={{ display: 'flex', gap: 28 }}>
            {[
              { label: 'Funciones', href: '#features' },
              { label: 'Cómo funciona', href: '#how-it-works' },
              { label: 'Precios', href: '#pricing' },
            ].map(l => (
              <a key={l.href} href={l.href} className="landing-nav-link" style={{
                color: 'var(--color-text-secondary)', fontSize: 14, fontWeight: 500,
                textDecoration: 'none', transition: 'color 0.15s',
              }}>
                {l.label}
              </a>
            ))}
          </div>
          <a href={PLATFORM_LOGIN} style={{
            padding: '8px 20px', borderRadius: 'var(--radius-full)',
            background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
            color: '#fff', fontSize: 13, fontWeight: 600,
            textDecoration: 'none', transition: 'all 0.25s',
            boxShadow: '0 0 20px rgba(139, 92, 246, 0.3)',
          }}>
            Acceder
          </a>
        </div>
      </div>
    </nav>
  );
}

/* ─── HERO ─── */
function Hero() {
  return (
    <section style={{
      position: 'relative', paddingTop: 160, paddingBottom: 100,
      display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
      overflow: 'hidden',
    }}>
      {/* Background orbs */}
      <div style={{
        position: 'absolute', top: -200, left: '50%', transform: 'translateX(-50%)',
        width: 800, height: 800, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(139, 92, 246, 0.12) 0%, rgba(232, 121, 249, 0.05) 40%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', top: 100, right: '10%', width: 300, height: 300,
        borderRadius: '50%', background: 'radial-gradient(circle, rgba(232, 121, 249, 0.08) 0%, transparent 70%)',
        animation: 'float 6s ease-in-out infinite', pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', top: 200, left: '5%', width: 200, height: 200,
        borderRadius: '50%', background: 'radial-gradient(circle, rgba(103, 232, 249, 0.06) 0%, transparent 70%)',
        animation: 'float 8s ease-in-out infinite 1s', pointerEvents: 'none',
      }} />

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 800, padding: '0 24px' }}>
        {/* Badge */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '6px 16px', borderRadius: 'var(--radius-full)',
          background: 'var(--color-primary-light)', border: '1px solid var(--color-border-light)',
          fontSize: 13, fontWeight: 600, color: 'var(--color-primary-hover)',
          marginBottom: 28, animation: 'fade-in-up 0.6s ease-out',
        }}>
          <Sparkles size={14} />
          Potenciado por Inteligencia Artificial
        </div>

        {/* Headline */}
        <h1 style={{
          fontSize: 'clamp(36px, 6vw, 72px)', fontWeight: 900, lineHeight: 1.05,
          letterSpacing: '-0.04em', marginBottom: 24,
          animation: 'fade-in-up 0.6s ease-out 0.1s both',
        }}>
          <span style={{ color: '#fff' }}>Automatizá tu</span>
          <br />
          <span style={{
            background: 'linear-gradient(135deg, #8b5cf6, #e879f9, #67e8f9)',
            backgroundSize: '200% 200%', animation: 'gradient-shift 4s ease infinite',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>
            atención por WhatsApp
          </span>
        </h1>

        {/* Subtitle */}
        <p style={{
          fontSize: 'clamp(16px, 2vw, 20px)', color: 'var(--color-text-secondary)',
          lineHeight: 1.6, maxWidth: 600, margin: '0 auto 40px',
          animation: 'fade-in-up 0.6s ease-out 0.2s both',
        }}>
          Volt ChatBot conecta tu negocio con tus clientes 24/7.
          Respondé consultas, vendé productos y hacé seguimiento de leads
          con inteligencia artificial — todo desde WhatsApp.
        </p>

        {/* CTA Buttons */}
        <div className="landing-hero-btns" style={{
          display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap',
          animation: 'fade-in-up 0.6s ease-out 0.3s both',
        }}>
          <a href={PLATFORM_LOGIN} className="landing-cta-btn" style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '14px 32px', borderRadius: 'var(--radius-full)',
            background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
            color: '#fff', fontSize: 15, fontWeight: 700, textDecoration: 'none',
            boxShadow: 'var(--shadow-glow-lg)', transition: 'all 0.25s',
          }}>
            Comenzar gratis <ArrowRight size={18} />
          </a>
          <a href="#how-it-works" className="landing-ghost-btn" style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '14px 32px', borderRadius: 'var(--radius-full)',
            background: 'var(--color-surface)', border: '1px solid var(--color-border)',
            color: 'var(--color-text)', fontSize: 15, fontWeight: 600, textDecoration: 'none',
            transition: 'all 0.25s',
          }}>
            Cómo funciona
          </a>
        </div>
      </div>

      {/* Chat mockup */}
      <div style={{
        position: 'relative', zIndex: 1, marginTop: 64, maxWidth: 700, width: '100%',
        padding: '0 24px', animation: 'fade-in-up 0.8s ease-out 0.5s both',
      }}>
        <ChatMockup />
      </div>
    </section>
  );
}

function ChatMockup() {
  const messages = [
    { from: 'user', text: 'Hola! Tienen zapatillas Nike?' },
    { from: 'bot', text: '¡Hola! 🛍️ Sí, te muestro lo que tenemos:\n\n1. *Nike Air Max 90* — $89.990\n2. *Nike Revolution 6* — $54.990\n3. *Nike Court Vision* — $72.990\n\nDecime el número para agregar al carrito 🛒' },
    { from: 'user', text: 'El 1, hay promos?' },
    { from: 'bot', text: '✅ *Nike Air Max 90* agregado al carrito!\n\n🏷️ *Promos vigentes:*\n• 20% off con Visa — hasta el 15/03\n• 3 cuotas sin interés con Mercado Pago\n\n_Si querés, sigo con la búsqueda de productos._' },
  ];

  return (
    <div style={{
      background: 'var(--color-surface)', border: '1px solid var(--color-border-light)',
      borderRadius: 'var(--radius-xl)', overflow: 'hidden',
      boxShadow: 'var(--shadow-glow-lg)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px',
        background: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-border)',
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          background: 'linear-gradient(135deg, #7c3aed, #e879f9)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Bot size={18} color="#fff" />
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>Volt Assistant</div>
          <div style={{ fontSize: 11, color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-success)' }} />
            Online
          </div>
        </div>
      </div>

      {/* Messages */}
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 360, overflow: 'hidden' }}>
        {messages.map((msg, i) => (
          <div key={i} style={{
            alignSelf: msg.from === 'user' ? 'flex-end' : 'flex-start',
            maxWidth: '80%', padding: '10px 14px', borderRadius: 14,
            background: msg.from === 'user'
              ? 'linear-gradient(135deg, #7c3aed, #8b5cf6)'
              : 'var(--color-bg-tertiary)',
            border: msg.from === 'user' ? 'none' : '1px solid var(--color-border)',
            fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-line',
            color: msg.from === 'user' ? '#fff' : 'var(--color-text)',
          }}>
            {msg.text}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── LOGO BAR ─── */
function LogoBar() {
  const techs = ['WhatsApp Cloud API', 'OpenAI GPT-4', 'WooCommerce', 'Mercado Pago', 'Meta Business'];
  return (
    <section style={{
      padding: '40px 24px', borderTop: '1px solid var(--color-border)',
      borderBottom: '1px solid var(--color-border)',
    }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', textAlign: 'center' }}>
        <p style={{
          fontSize: 12, fontWeight: 600, textTransform: 'uppercase',
          letterSpacing: '0.1em', color: 'var(--color-text-muted)', marginBottom: 20,
        }}>
          Integrado con las plataformas que ya usás
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          {techs.map(t => (
            <span key={t} style={{
              fontSize: 13, fontWeight: 600, color: 'var(--color-text-muted)',
              padding: '8px 16px', borderRadius: 'var(--radius-sm)',
              background: 'var(--color-primary-light)', border: '1px solid var(--color-border)',
            }}>
              {t}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── FEATURES ─── */
function Features() {
  const features = [
    {
      icon: <Bot size={24} />, color: '#8b5cf6',
      title: 'Bot con IA Personalizable',
      desc: 'Configurá el tono, la personalidad y el conocimiento del bot para cada negocio. Responde como si fuera un miembro más del equipo.',
    },
    {
      icon: <ShoppingCart size={24} />, color: '#e879f9',
      title: 'Tienda en WhatsApp',
      desc: 'Integración con WooCommerce: buscá productos, armá el carrito y cerrá ventas directamente desde el chat.',
    },
    {
      icon: <Users size={24} />, color: '#34d399',
      title: 'Gestión de Leads',
      desc: 'Seguimiento automático de cada contacto. Clasificá leads por etapa, asigná agentes y nunca pierdas una oportunidad.',
    },
    {
      icon: <MessageSquare size={24} />, color: '#67e8f9',
      title: 'Inbox Unificado',
      desc: 'Todas las conversaciones de todos tus canales en un solo lugar. Filtrá, buscá y respondé sin cambiar de app.',
    },
    {
      icon: <BarChart3 size={24} />, color: '#fbbf24',
      title: 'Dashboard Analítico',
      desc: 'Métricas en tiempo real: mensajes, conversiones, tiempos de respuesta y rendimiento del bot por período.',
    },
    {
      icon: <Shield size={24} />, color: '#fb7185',
      title: 'Multi-tenant Seguro',
      desc: 'Cada negocio tiene su espacio aislado con datos, configuración y canales independientes. Seguridad enterprise.',
    },
  ];

  return (
    <section id="features" style={{ padding: '100px 24px', position: 'relative' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <SectionHeader
          badge="Funciones"
          title="Todo lo que tu negocio necesita"
          subtitle="Una plataforma completa para automatizar, vender y atender por WhatsApp con inteligencia artificial."
        />
        <div className="landing-grid-3" style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 20, marginTop: 60,
        }}>
          {features.map((f, i) => (
            <div key={i} className="landing-card" style={{
              padding: 28, borderRadius: 'var(--radius-lg)',
              background: 'var(--color-surface)', border: '1px solid var(--color-border)',
              transition: 'all 0.25s', boxShadow: 'var(--shadow-card)', cursor: 'default',
            }}>
              <div style={{
                width: 48, height: 48, borderRadius: 'var(--radius-md)',
                background: `${f.color}15`, border: `1px solid ${f.color}30`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: f.color, marginBottom: 16,
              }}>
                {f.icon}
              </div>
              <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 8, color: '#fff' }}>{f.title}</h3>
              <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--color-text-secondary)' }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── HOW IT WORKS ─── */
function HowItWorks() {
  const steps = [
    { num: '01', title: 'Conectá tu WhatsApp', desc: 'Vinculá tu número de WhatsApp Business en minutos. Solo necesitás tu Phone Number ID y WABA ID de Meta.', icon: <Globe size={20} /> },
    { num: '02', title: 'Configurá tu bot', desc: 'Definí la personalidad, el conocimiento del negocio, horarios, promociones y reglas de respuesta.', icon: <Bot size={20} /> },
    { num: '03', title: 'Conectá tu tienda', desc: 'Si tenés WooCommerce, vinculá tu catálogo y activá la venta por chat con carrito y checkout.', icon: <ShoppingCart size={20} /> },
    { num: '04', title: 'Empezá a vender', desc: 'Tu bot atiende 24/7. Vos seguís las conversiones desde el dashboard y tomás el control cuando quieras.', icon: <Zap size={20} /> },
  ];

  return (
    <section id="how-it-works" style={{ padding: '100px 24px', background: 'var(--color-bg-secondary)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <SectionHeader
          badge="Proceso"
          title="Cómo funciona"
          subtitle="En 4 pasos simples, tu negocio está atendiendo por WhatsApp con inteligencia artificial."
        />
        <div className="landing-grid-4" style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: 24, marginTop: 60,
        }}>
          {steps.map((s, i) => (
            <div key={i} className="landing-card" style={{
              position: 'relative', padding: 28, borderRadius: 'var(--radius-lg)',
              background: 'var(--color-surface)', border: '1px solid var(--color-border)',
              transition: 'all 0.25s', cursor: 'default',
            }}>
              <div style={{
                fontSize: 48, fontWeight: 900, letterSpacing: '-0.04em',
                background: 'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(232,121,249,0.1))',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                lineHeight: 1, marginBottom: 16,
              }}>
                {s.num}
              </div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
                color: 'var(--color-primary)',
              }}>
                {s.icon}
                <h3 style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>{s.title}</h3>
              </div>
              <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--color-text-secondary)' }}>{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── INTEGRATIONS ─── */
function Integrations() {
  const items = [
    { name: 'WhatsApp Business', desc: 'Cloud API oficial de Meta', icon: <MessageSquare size={22} />, color: '#25D366' },
    { name: 'WooCommerce', desc: 'Catálogo, carrito y checkout', icon: <ShoppingCart size={22} />, color: '#96588A' },
    { name: 'OpenAI', desc: 'GPT-4o y GPT-4o Mini', icon: <Sparkles size={22} />, color: '#10A37F' },
    { name: 'Mercado Pago', desc: 'Pagos y cuotas (próximamente)', icon: <Star size={22} />, color: '#009EE3' },
  ];

  return (
    <section style={{ padding: '100px 24px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <SectionHeader
          badge="Integraciones"
          title="Conectado con todo"
          subtitle="Volt se integra con las herramientas que tu negocio ya usa."
        />
        <div className="landing-grid-4" style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: 20, marginTop: 60,
        }}>
          {items.map((item, i) => (
            <div key={i} className="landing-card" style={{
              display: 'flex', alignItems: 'center', gap: 16, padding: '20px 24px',
              borderRadius: 'var(--radius-lg)', background: 'var(--color-surface)',
              border: '1px solid var(--color-border)', transition: 'all 0.25s', cursor: 'default',
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: 'var(--radius-md)',
                background: `${item.color}18`, border: `1px solid ${item.color}30`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: item.color, flexShrink: 0,
              }}>
                {item.icon}
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{item.name}</div>
                <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── PRICING ─── */
function Pricing() {
  const plans = [
    {
      name: 'Starter', price: 'Gratis', period: 'para empezar', highlight: false,
      features: ['1 canal de WhatsApp', 'Bot con IA básico', 'Hasta 100 mensajes/mes', 'Dashboard básico'],
      cta: 'Empezar gratis',
    },
    {
      name: 'Pro', price: '$29.990', period: '/mes', highlight: true,
      features: ['1 canal de WhatsApp', 'Bot con IA avanzado', 'Mensajes ilimitados', 'WooCommerce integrado', 'Gestión de leads', 'Dashboard completo', 'Soporte prioritario'],
      cta: 'Comenzar prueba',
    },
    {
      name: 'Enterprise', price: 'Personalizado', period: '', highlight: false,
      features: ['Canales ilimitados', 'Multi-tenant', 'API personalizada', 'Integraciones custom', 'SLA dedicado', 'Onboarding asistido'],
      cta: 'Contactar ventas',
    },
  ];

  return (
    <section id="pricing" style={{ padding: '100px 24px', background: 'var(--color-bg-secondary)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <SectionHeader
          badge="Precios"
          title="Planes para cada etapa"
          subtitle="Empezá gratis y escalá cuando tu negocio lo necesite."
        />
        <div className="landing-grid-3" style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 24, marginTop: 60, alignItems: 'start',
        }}>
          {plans.map((plan, i) => (
            <div key={i} style={{
              padding: 32, borderRadius: 'var(--radius-xl)', position: 'relative',
              background: plan.highlight
                ? 'linear-gradient(135deg, rgba(139,92,246,0.08), rgba(232,121,249,0.04))'
                : 'var(--color-surface)',
              border: plan.highlight ? '1px solid var(--color-border-glow)' : '1px solid var(--color-border)',
              boxShadow: plan.highlight ? 'var(--shadow-glow)' : 'var(--shadow-card)',
            }}>
              {plan.highlight && (
                <div style={{
                  position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                  padding: '4px 16px', borderRadius: 'var(--radius-full)',
                  background: 'linear-gradient(135deg, #7c3aed, #e879f9)',
                  fontSize: 11, fontWeight: 700, color: '#fff', textTransform: 'uppercase',
                  letterSpacing: '0.05em', whiteSpace: 'nowrap',
                }}>
                  Más popular
                </div>
              )}
              <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-primary-hover)', marginBottom: 8 }}>
                {plan.name}
              </h3>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 24 }}>
                <span style={{ fontSize: 36, fontWeight: 900, color: '#fff', letterSpacing: '-0.03em' }}>
                  {plan.price}
                </span>
                <span style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>{plan.period}</span>
              </div>
              <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
                {plan.features.map((f, j) => (
                  <li key={j} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: 'var(--color-text-secondary)' }}>
                    <CheckCircle2 size={16} color="var(--color-success)" style={{ flexShrink: 0 }} />
                    {f}
                  </li>
                ))}
              </ul>
              <a href={PLATFORM_LOGIN} style={{
                display: 'block', textAlign: 'center', padding: '12px 24px',
                borderRadius: 'var(--radius-full)', textDecoration: 'none',
                background: plan.highlight ? 'linear-gradient(135deg, #7c3aed, #a855f7)' : 'transparent',
                border: plan.highlight ? 'none' : '1px solid var(--color-border-light)',
                color: '#fff', fontSize: 14, fontWeight: 600,
                boxShadow: plan.highlight ? '0 0 20px rgba(139, 92, 246, 0.3)' : 'none',
                transition: 'all 0.25s',
              }}>
                {plan.cta}
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── CTA ─── */
function CTASection() {
  return (
    <section style={{ padding: '100px 24px', position: 'relative', overflow: 'hidden' }}>
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(circle at 50% 50%, rgba(139, 92, 246, 0.1) 0%, transparent 60%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        maxWidth: 700, margin: '0 auto', textAlign: 'center', position: 'relative', zIndex: 1,
        padding: 48, borderRadius: 'var(--radius-xl)',
        background: 'var(--color-surface)', border: '1px solid var(--color-border-glow)',
        boxShadow: 'var(--shadow-glow-lg)',
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: 16,
          background: 'linear-gradient(135deg, #7c3aed, #e879f9)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 24px',
        }}>
          <Send size={26} color="#fff" />
        </div>
        <h2 style={{
          fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 800, color: '#fff',
          marginBottom: 12, letterSpacing: '-0.03em',
        }}>
          ¿Listo para automatizar?
        </h2>
        <p style={{ fontSize: 16, color: 'var(--color-text-secondary)', lineHeight: 1.6, marginBottom: 32 }}>
          Unite a los negocios que ya están vendiendo más y atendiendo mejor con Volt ChatBot.
        </p>
        <a href={PLATFORM_LOGIN} className="landing-cta-btn" style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '14px 36px', borderRadius: 'var(--radius-full)',
          background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
          color: '#fff', fontSize: 16, fontWeight: 700, textDecoration: 'none',
          boxShadow: 'var(--shadow-glow-lg)', transition: 'all 0.25s',
        }}>
          Empezar ahora <ArrowRight size={18} />
        </a>
      </div>
    </section>
  );
}

/* ─── FOOTER ─── */
function Footer() {
  return (
    <footer style={{
      padding: '40px 24px', borderTop: '1px solid var(--color-border)',
      background: 'var(--color-bg-secondary)',
    }}>
      <div className="landing-footer-inner" style={{
        maxWidth: 1200, margin: '0 auto',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexWrap: 'wrap', gap: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: 'linear-gradient(135deg, #8b5cf6, #e879f9)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Zap size={14} color="#fff" />
          </div>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-secondary)' }}>
            Volt ChatBot
          </span>
        </div>
        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
          © {new Date().getFullYear()} Volt ChatBot. Todos los derechos reservados.
        </span>
      </div>
    </footer>
  );
}

/* ─── SHARED COMPONENTS ─── */
function SectionHeader({ badge, title, subtitle }: { badge: string; title: string; subtitle: string }) {
  return (
    <div style={{ textAlign: 'center', maxWidth: 600, margin: '0 auto' }}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '5px 14px', borderRadius: 'var(--radius-full)',
        background: 'var(--color-primary-light)', border: '1px solid var(--color-border-light)',
        fontSize: 12, fontWeight: 600, color: 'var(--color-primary-hover)',
        textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 16,
      }}>
        {badge}
      </div>
      <h2 style={{
        fontSize: 'clamp(26px, 4vw, 42px)', fontWeight: 800, color: '#fff',
        letterSpacing: '-0.03em', marginBottom: 12,
      }}>
        {title}
      </h2>
      <p style={{ fontSize: 16, lineHeight: 1.6, color: 'var(--color-text-secondary)' }}>{subtitle}</p>
    </div>
  );
}
