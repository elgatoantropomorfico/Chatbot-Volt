'use client';

import {
  Bot,
  Calendar,
  Code2,
  MessageSquare,
  Sparkles,
  Zap,
  ArrowRight,
} from 'lucide-react';
import { MarketingShell } from './marketing/MarketingShell';
import {
  DEMO_MAILTO,
  GENERAL_BENEFITS,
  IDEAL_FOR,
  WORK_STEPS,
} from './marketing/constants';
import { FinalCTA, GhostButton, PrimaryButton, SectionHeader, TextLink } from './marketing/ui';

export default function LandingPage() {
  return (
    <MarketingShell>
      <Hero />
      <WhatWeDo />
      <MainSolutions />
      <IdealFor />
      <Benefits />
      <HowWeWork />
      <FinalCTA
        title="Convertí tus canales digitales en una operación inteligente"
        subtitle="Hablemos sobre cómo Volt puede ayudarte a automatizar atención, ventas y procesos internos."
        buttonLabel="Agendar demo"
        buttonHref={DEMO_MAILTO}
      />
    </MarketingShell>
  );
}

function Hero() {
  return (
    <section
      style={{
        position: 'relative',
        paddingTop: 160,
        paddingBottom: 100,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: -200,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 800,
          height: 800,
          borderRadius: '50%',
          background:
            'radial-gradient(circle, rgba(139, 92, 246, 0.12) 0%, rgba(232, 121, 249, 0.05) 40%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 860, padding: '0 24px' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 16px',
            borderRadius: 'var(--radius-full)',
            background: 'var(--color-primary-light)',
            border: '1px solid var(--color-border-light)',
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--color-primary-hover)',
            marginBottom: 28,
            animation: 'fade-in-up 0.6s ease-out',
          }}
        >
          <Sparkles size={14} />
          Inteligencia artificial para tu operación
        </div>

        <h1
          style={{
            fontSize: 'clamp(32px, 5.5vw, 64px)',
            fontWeight: 900,
            lineHeight: 1.08,
            letterSpacing: '-0.04em',
            marginBottom: 24,
            animation: 'fade-in-up 0.6s ease-out 0.1s both',
          }}
        >
          <span style={{ color: '#fff' }}>Automatizá tu atención, tus ventas y tus procesos con </span>
          <span
            style={{
              background: 'linear-gradient(135deg, #8b5cf6, #e879f9, #67e8f9)',
              backgroundSize: '200% 200%',
              animation: 'gradient-shift 4s ease infinite',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            inteligencia artificial
          </span>
        </h1>

        <p
          style={{
            fontSize: 'clamp(16px, 2vw, 20px)',
            color: 'var(--color-text-secondary)',
            lineHeight: 1.65,
            maxWidth: 680,
            margin: '0 auto 40px',
            animation: 'fade-in-up 0.6s ease-out 0.2s both',
          }}
        >
          Creamos asistentes inteligentes, integraciones oficiales y soluciones tecnológicas a medida
          para que tu empresa responda más rápido, capture más oportunidades y reduzca tareas operativas.
        </p>

        <div
          className="landing-hero-btns"
          style={{
            display: 'flex',
            gap: 16,
            justifyContent: 'center',
            flexWrap: 'wrap',
            animation: 'fade-in-up 0.6s ease-out 0.3s both',
          }}
        >
          <PrimaryButton href={DEMO_MAILTO} external>
            Agendar una demo <ArrowRight size={18} />
          </PrimaryButton>
          <GhostButton href="#soluciones">Ver soluciones</GhostButton>
        </div>
      </div>
    </section>
  );
}

function WhatWeDo() {
  const areas = [
    'Asistentes virtuales para ventas y atención.',
    'Integraciones con WhatsApp, Instagram, Facebook y sistemas internos.',
    'Desarrollo de software a medida para procesos específicos.',
  ];

  return (
    <section style={{ padding: '100px 24px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <SectionHeader
          badge="Qué hacemos"
          title="Tecnología para empresas que quieren vender, atender y operar mejor"
          subtitle="En Volt desarrollamos soluciones basadas en inteligencia artificial, automatización e integraciones digitales para transformar la manera en que las empresas se comunican con sus clientes y gestionan sus procesos internos."
        />
        <div style={{ marginTop: 48, maxWidth: 640, margin: '48px auto 0' }}>
          <p
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: 'var(--color-text)',
              marginBottom: 20,
              textAlign: 'center',
            }}
          >
            Trabajamos sobre tres grandes áreas:
          </p>
          <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {areas.map((a, i) => (
              <li
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                  padding: '16px 20px',
                  borderRadius: 'var(--radius-lg)',
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  fontSize: 15,
                  color: 'var(--color-text-secondary)',
                  lineHeight: 1.5,
                }}
              >
                <Zap size={18} color="var(--color-primary)" style={{ flexShrink: 0, marginTop: 2 }} />
                {a}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function MainSolutions() {
  const solutions = [
    {
      icon: <Bot size={24} />,
      color: '#8b5cf6',
      title: 'Chatbot Inteligente para Ventas y Atención',
      desc: 'Automatizá conversaciones, respondé consultas frecuentes, calificá prospectos y convertí cada mensaje en una oportunidad comercial.',
      href: '/chatbot-inteligente',
    },
    {
      icon: <MessageSquare size={24} />,
      color: '#67e8f9',
      title: 'Integraciones con Meta',
      desc: 'Conectá WhatsApp, Instagram y Facebook con sistemas internos, CRMs, automatizaciones y flujos conversacionales inteligentes.',
      href: '/integraciones-meta',
    },
    {
      icon: <Calendar size={24} />,
      color: '#34d399',
      title: 'Automatización de Turnos y Casos',
      desc: 'Gestioná reservas, confirmaciones, consultas, tickets y derivaciones sin depender de procesos manuales repetitivos.',
      href: '/automatizacion-turnos-consultas',
    },
    {
      icon: <Code2 size={24} />,
      color: '#e879f9',
      title: 'Desarrollo de Software a Medida',
      desc: 'Diseñamos plataformas, sistemas internos, dashboards, CRMs e integraciones adaptadas a la forma real en que opera tu negocio.',
      href: '/desarrollo-software-medida',
    },
  ];

  return (
    <section id="soluciones" style={{ padding: '100px 24px', background: 'var(--color-bg-secondary)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <SectionHeader
          badge="Soluciones"
          title="Soluciones principales"
          subtitle="Cada área de Volt está pensada para resolver un problema concreto de tu operación comercial y administrativa."
        />
        <div
          className="landing-grid-2"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 24,
            marginTop: 60,
          }}
        >
          {solutions.map((s, i) => (
            <div
              key={i}
              className="landing-card"
              style={{
                padding: 32,
                borderRadius: 'var(--radius-lg)',
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                transition: 'all 0.25s',
                boxShadow: 'var(--shadow-card)',
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 'var(--radius-md)',
                  background: `${s.color}15`,
                  border: `1px solid ${s.color}30`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: s.color,
                  marginBottom: 20,
                }}
              >
                {s.icon}
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12, color: '#fff', lineHeight: 1.3 }}>
                {s.title}
              </h3>
              <p
                style={{
                  fontSize: 14,
                  lineHeight: 1.65,
                  color: 'var(--color-text-secondary)',
                  marginBottom: 24,
                  flex: 1,
                }}
              >
                {s.desc}
              </p>
              <TextLink href={s.href}>Ver solución</TextLink>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 32, textAlign: 'center' }}>
          <p style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>
            También podés explorar por industria en{' '}
            <a href="/sectores" style={{ color: 'var(--color-primary-hover)', fontWeight: 600 }}>
              Sectores
            </a>
          </p>
        </div>
      </div>
    </section>
  );
}

function IdealFor() {
  return (
    <section style={{ padding: '100px 24px' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <SectionHeader
          badge="Para quién"
          title="Para quién es Volt"
          subtitle="Ideal para organizaciones que necesitan escalar atención, ventas y procesos sin sumar carga operativa."
        />
        <div
          className="landing-grid-4"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 16,
            marginTop: 48,
          }}
        >
          {IDEAL_FOR.map((item, i) => (
            <div
              key={i}
              className="landing-card"
              style={{
                padding: '18px 20px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                fontSize: 14,
                fontWeight: 500,
                color: 'var(--color-text-secondary)',
                textAlign: 'center',
                transition: 'all 0.25s',
              }}
            >
              {item}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Benefits() {
  return (
    <section style={{ padding: '100px 24px', background: 'var(--color-bg-secondary)' }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <SectionHeader
          badge="Beneficios"
          title="Menos tareas manuales. Más velocidad. Más oportunidades."
          subtitle="Automatizar no es reemplazar personas: es liberar tiempo para lo que realmente importa."
        />
        <ul style={{ listStyle: 'none', padding: 0, marginTop: 48, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {GENERAL_BENEFITS.map((b, i) => (
            <li
              key={i}
              style={{
                padding: '14px 18px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                fontSize: 15,
                color: 'var(--color-text-secondary)',
              }}
            >
              {b}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function HowWeWork() {
  return (
    <section style={{ padding: '100px 24px' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <SectionHeader
          badge="Proceso"
          title="Cómo trabajamos"
          subtitle="Un enfoque claro desde el diagnóstico hasta la optimización continua."
        />
        <div
          className="landing-steps"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 20,
            marginTop: 56,
          }}
        >
          {WORK_STEPS.map((step, i) => (
            <div
              key={i}
              className="landing-card"
              style={{
                padding: 24,
                borderRadius: 'var(--radius-lg)',
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                transition: 'all 0.25s',
              }}
            >
              <div
                style={{
                  fontSize: 36,
                  fontWeight: 900,
                  letterSpacing: '-0.04em',
                  background: 'linear-gradient(135deg, rgba(139,92,246,0.35), rgba(232,121,249,0.15))',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  marginBottom: 12,
                }}
              >
                {String(i + 1).padStart(2, '0')}
              </div>
              <p style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--color-text-secondary)' }}>{step}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
