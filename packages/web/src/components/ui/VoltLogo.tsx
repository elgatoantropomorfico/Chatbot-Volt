import type { CSSProperties } from 'react';

const LOGO_SRC = '/logo_real_volt.svg';

interface VoltLogoProps {
  size?: number;
  glow?: boolean;
  className?: string;
  style?: CSSProperties;
  title?: string;
}

export function VoltLogo({
  size = 36,
  glow = false,
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
      {glow && (
        <>
          <span className="volt-logo-aura volt-logo-aura--deep" aria-hidden />
          <span className="volt-logo-aura volt-logo-aura--mid" aria-hidden />
          <span className="volt-logo-edge" aria-hidden />
          <span className="volt-logo-rim" aria-hidden />
          <span className="volt-logo-lens" aria-hidden />
        </>
      )}
      <img
        src={LOGO_SRC}
        width={size}
        height={size}
        alt=""
        aria-hidden
        draggable={false}
      />
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
  glow = false,
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
