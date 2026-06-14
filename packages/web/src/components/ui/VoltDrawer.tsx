'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';

interface VoltDrawerProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  width?: number;
  zIndex?: number;
}

export function VoltDrawer({ open, onClose, children, width = 420, zIndex }: VoltDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  const panelStyle: React.CSSProperties = {
    width: `min(${width}px, calc(100vw - 24px))`,
    ...(zIndex ? { zIndex: zIndex + 1 } : {}),
  };
  const backdropStyle: React.CSSProperties = zIndex ? { zIndex } : {};

  return createPortal(
    <>
      <div className="volt-drawer-backdrop" style={backdropStyle} onClick={onClose} aria-hidden />
      <div className="volt-drawer" style={panelStyle} role="dialog" aria-modal="true">
        {children}
      </div>
    </>,
    document.body,
  );
}
