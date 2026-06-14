import type { CSSProperties } from 'react';

const BOLT_PATH =
  'M53.2 17.8 35.8 52.4c-.5.9.2 2 1.3 2h9.8l-5.6 27.8c-.3 1.2 1.3 1.9 2.1 1l27.4-34.6c.7-.9.1-2.2-1-2.2H54.1l2.5-16.4c.1-.7-.5-1.2-1.2-1.2h-2.2z';

interface VoltLogoProps {
  size?: number;
  glow?: boolean;
  className?: string;
  style?: CSSProperties;
  title?: string;
}

export function VoltLogo({
  size = 36,
  glow = true,
  className,
  style,
  title = 'Volt',
}: VoltLogoProps) {
  return (
    <span
      className={`volt-logo${glow ? ' volt-logo--glow' : ''}${className ? ` ${className}` : ''}`}
      style={{ width: size, height: size, ...style }}
      role="img"
      aria-label={title}
    >
      <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden>
        <circle cx="50" cy="50" r="50" fill="#7C66FF" />
        <path fill="#0A0A0A" d={BOLT_PATH} />
      </svg>
    </span>
  );
}

interface VoltBrandProps {
  size?: number;
  glow?: boolean;
  subtitle?: string;
  iaSuffix?: boolean;
  suffix?: string;
  className?: string;
}

export function VoltBrand({
  size = 34,
  glow = true,
  subtitle,
  iaSuffix = true,
  suffix,
  className,
}: VoltBrandProps) {
  const suffixText = suffix ?? (iaSuffix ? ' IA' : '');
  return (
    <span className={`volt-brand${className ? ` ${className}` : ''}`}>
      <VoltLogo size={size} glow={glow} />
      <span>
        <span className="volt-brand-text">
          <span className="volt-brand-volt">Volt</span>
          {suffixText && <span className="volt-brand-ia">{suffixText}</span>}
        </span>
        {subtitle && <span className="volt-brand-sub">{subtitle}</span>}
      </span>
    </span>
  );
}
