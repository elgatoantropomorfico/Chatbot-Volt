'use client';

import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import type { Feedback } from './types';

const COLORS = {
  ok: { bg: 'rgba(52, 211, 153, 0.1)', border: 'rgba(52, 211, 153, 0.25)', color: '#34d399' },
  err: { bg: 'rgba(251, 113, 133, 0.1)', border: 'rgba(251, 113, 133, 0.25)', color: '#fb7185' },
  info: { bg: 'rgba(139, 92, 246, 0.1)', border: 'rgba(139, 92, 246, 0.25)', color: '#8b5cf6' },
};

export function FeedbackBanner({ feedback, onDismiss }: { feedback: Feedback; onDismiss?: () => void }) {
  const colors = COLORS[feedback.type];
  const Icon = feedback.type === 'ok' ? CheckCircle2 : feedback.type === 'err' ? AlertCircle : Info;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px',
      marginBottom: '16px', borderRadius: 'var(--radius-sm)',
      background: colors.bg, border: `1px solid ${colors.border}`, color: colors.color,
      fontSize: '13px', fontWeight: 500,
    }}>
      <Icon size={16} style={{ flexShrink: 0 }} />
      <span style={{ flex: 1 }}>{feedback.text}</span>
      {onDismiss && (
        <button onClick={onDismiss} style={{
          background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', padding: '2px',
        }}>
          <X size={14} />
        </button>
      )}
    </div>
  );
}

export function InlineFeedback({ feedback }: { feedback: Feedback | null }) {
  if (!feedback) return null;
  const colors = COLORS[feedback.type];
  return (
    <span style={{ fontSize: '13px', color: colors.color, fontWeight: 500 }}>{feedback.text}</span>
  );
}
