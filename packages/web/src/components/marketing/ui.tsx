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
      <div className="mkt-section-badge">{badge}</div>
      <h2 className="mkt-section-title">{title}</h2>
      <p className="mkt-section-sub">{subtitle}</p>
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
  if (external || href.startsWith('mailto:')) {
    return (
      <a href={href} className="mkt-btn-primary landing-cta-btn">
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className="mkt-btn-primary landing-cta-btn">
      {children}
    </Link>
  );
}

export function GhostButton({ href, children }: { href: string; children: ReactNode }) {
  const isHash = href.startsWith('#');

  if (isHash) {
    return (
      <a href={href} className="mkt-btn-ghost landing-ghost-btn">
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className="mkt-btn-ghost landing-ghost-btn">
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
    <section className="mkt-section" style={{ padding: '100px 24px' }}>
      <div className="mkt-cta-panel">
        <h2 className="mkt-section-title" style={{ marginBottom: 12 }}>{title}</h2>
        <p className="mkt-section-sub" style={{ marginBottom: 28 }}>{subtitle}</p>
        <PrimaryButton href={buttonHref} external={buttonHref.startsWith('mailto:')}>
          {buttonLabel} <ArrowRight size={18} />
        </PrimaryButton>
      </div>
    </section>
  );
}
