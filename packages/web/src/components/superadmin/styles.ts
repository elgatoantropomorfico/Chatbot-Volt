import type { CSSProperties } from 'react';

export const inputStyle: CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  background: 'var(--color-bg-secondary)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--color-text)',
  fontSize: '14px',
  outline: 'none',
};

export const labelStyle: CSSProperties = {
  display: 'block',
  fontSize: '12px',
  color: 'var(--color-text-muted)',
  marginBottom: '6px',
  fontWeight: 600,
};

export const tabStyle = (active: boolean): CSSProperties => ({
  padding: '10px 20px',
  fontSize: '13px',
  fontWeight: active ? 600 : 400,
  cursor: 'pointer',
  color: active ? 'var(--color-primary)' : 'var(--color-text-muted)',
  background: 'transparent',
  border: 'none',
  borderBottom: active ? '2px solid var(--color-primary)' : '2px solid transparent',
  transition: 'all 0.15s',
});

export const primaryBtnStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '10px 22px',
  background: 'linear-gradient(135deg, #7c3aed, #8b5cf6)',
  color: 'white',
  border: 'none',
  borderRadius: 'var(--radius-sm)',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
};

export const dangerBtnStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '9px 16px',
  background: 'rgba(251, 113, 133, 0.12)',
  color: '#fb7185',
  border: '1px solid rgba(251, 113, 133, 0.35)',
  borderRadius: 'var(--radius-sm)',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
};

export const iconBtnStyle: CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: '4px',
  borderRadius: 'var(--radius-sm)',
  transition: 'all 0.15s',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

export const inlineInputStyle: CSSProperties = {
  padding: '6px 10px',
  background: 'var(--color-bg-secondary)',
  border: '1px solid var(--color-border-light)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--color-text)',
  fontSize: '12px',
  outline: 'none',
  width: '100%',
};

export const modalOverlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.6)',
  zIndex: 1000,
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  padding: '20px',
};

export const modalStyle: CSSProperties = {
  background: 'var(--color-bg)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-lg)',
  width: '100%',
  maxWidth: '720px',
  maxHeight: '85vh',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '0 20px 60px rgba(0,0,0,0.5), 0 0 1px rgba(139,92,246,0.2)',
};
