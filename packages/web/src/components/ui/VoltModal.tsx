'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface VoltModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  width?: number;
  zIndex?: number;
}

export function VoltModal({
  open,
  onClose,
  title,
  subtitle,
  children,
  width = 580,
  zIndex,
}: VoltModalProps) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  const backdropZ = zIndex ?? 1100;
  const modalZ = backdropZ + 1;
  const modalStyle: React.CSSProperties = {
    width: `min(${width}px, calc(100vw - 32px))`,
    zIndex: modalZ,
  };

  return createPortal(
    <>
      <div
        className="volt-modal-backdrop"
        style={{ zIndex: backdropZ }}
        onClick={onClose}
        aria-hidden
      />
      <div
        className="volt-modal"
        style={modalStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby="volt-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="volt-modal-accent" aria-hidden />
        <div className="volt-modal-header">
          <div>
            <h2 id="volt-modal-title" className="volt-modal-title">{title}</h2>
            {subtitle && <p className="volt-modal-sub">{subtitle}</p>}
          </div>
          <button type="button" className="volt-modal-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        <div className="volt-modal-body">{children}</div>
      </div>
    </>,
    document.body,
  );
}
