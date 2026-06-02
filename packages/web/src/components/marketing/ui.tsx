import { ArrowRight, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

export function SectionHeader({
  badge,
  title,
  subtitle,
  align = 'center',
}: {
  badge: string;
  title: string;
  subtitle: string;
  align?: 'center' | 'left';
}) {
  return (
    <div
      style={{
        textAlign: align,
        maxWidth: align === 'center' ? 640 : 720,
        margin: align === 'center' ? '0 auto' : undefined,
      }}
    >
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '5px 14px',
          borderRadius: 'var(--radius-full)',
          background: 'var(--color-primary-light)',
          border: '1px solid var(--color-border-light)',
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--color-primary-hover)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginBottom: 16,
        }}
      >
        {badge}
      </div>
      <h2
        style={{
          fontSize: 'clamp(26px, 4vw, 42px)',
          fontWeight: 800,
          color: '#fff',
          letterSpacing: '-0.03em',
          marginBottom: 12,
        }}
      >
        {title}
      </h2>
      <p style={{ fontSize: 16, lineHeight: 1.65, color: 'var(--color-text-secondary)' }}>
        {subtitle}
      </p>
    </div>
  );
}

export function PrimaryButton({
  href,
  children,
  external,
}: {
  href: string;
  children: ReactNode;
  external?: boolean;
}) {
  const style: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '14px 32px',
    borderRadius: 'var(--radius-full)',
    background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
    color: '#fff',
    fontSize: 15,
    fontWeight: 700,
    textDecoration: 'none',
    boxShadow: 'var(--shadow-glow-lg)',
    transition: 'all 0.25s',
  };

  if (external || href.startsWith('mailto:')) {
    return (
      <a href={href} className="landing-cta-btn" style={style}>
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className="landing-cta-btn" style={style}>
      {children}
    </Link>
  );
}

export function GhostButton({ href, children }: { href: string; children: ReactNode }) {
  const isHash = href.startsWith('#');
  const style: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '14px 32px',
    borderRadius: 'var(--radius-full)',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    color: 'var(--color-text)',
    fontSize: 15,
    fontWeight: 600,
    textDecoration: 'none',
    transition: 'all 0.25s',
  };

  if (isHash) {
    return (
      <a href={href} className="landing-ghost-btn" style={style}>
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className="landing-ghost-btn" style={style}>
      {children}
    </Link>
  );
}

export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 14,
        fontWeight: 600,
        color: 'var(--color-primary-hover)',
        textDecoration: 'none',
      }}
    >
      {children} <ArrowRight size={16} />
    </Link>
  );
}

export function BulletList({ items }: { items: readonly string[] | string[] }) {
  return (
    <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {items.map((item, i) => (
        <li
          key={i}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            fontSize: 15,
            lineHeight: 1.55,
            color: 'var(--color-text-secondary)',
          }}
        >
          <CheckCircle2 size={18} color="var(--color-success)" style={{ flexShrink: 0, marginTop: 2 }} />
          {item}
        </li>
      ))}
    </ul>
  );
}

export function ContentBlock({
  title,
  paragraphs,
}: {
  title: string;
  paragraphs: string[];
}) {
  return (
    <div>
      <h3
        style={{
          fontSize: 'clamp(22px, 3vw, 28px)',
          fontWeight: 800,
          color: '#fff',
          letterSpacing: '-0.03em',
          marginBottom: 16,
        }}
      >
        {title}
      </h3>
      {paragraphs.map((p, i) => (
        <p
          key={i}
          style={{
            fontSize: 16,
            lineHeight: 1.7,
            color: 'var(--color-text-secondary)',
            marginBottom: i < paragraphs.length - 1 ? 14 : 0,
          }}
        >
          {p}
        </p>
      ))}
    </div>
  );
}

export function FinalCTA({
  title,
  subtitle,
  buttonLabel,
  buttonHref,
}: {
  title: string;
  subtitle: string;
  buttonLabel: string;
  buttonHref: string;
}) {
  return (
    <section style={{ padding: '100px 24px', position: 'relative', overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(circle at 50% 50%, rgba(139, 92, 246, 0.1) 0%, transparent 60%)',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          maxWidth: 700,
          margin: '0 auto',
          textAlign: 'center',
          position: 'relative',
          zIndex: 1,
          padding: 48,
          borderRadius: 'var(--radius-xl)',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border-glow)',
          boxShadow: 'var(--shadow-glow-lg)',
        }}
      >
        <h2
          style={{
            fontSize: 'clamp(24px, 4vw, 36px)',
            fontWeight: 800,
            color: '#fff',
            marginBottom: 12,
            letterSpacing: '-0.03em',
          }}
        >
          {title}
        </h2>
        <p
          style={{
            fontSize: 16,
            color: 'var(--color-text-secondary)',
            lineHeight: 1.65,
            marginBottom: 28,
          }}
        >
          {subtitle}
        </p>
        <PrimaryButton href={buttonHref} external={buttonHref.startsWith('mailto:')}>
          {buttonLabel} <ArrowRight size={18} />
        </PrimaryButton>
      </div>
    </section>
  );
}
