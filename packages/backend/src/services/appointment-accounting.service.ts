import type { AppointmentStatus } from '@prisma/client';

function toNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'object' && v !== null && 'toNumber' in (v as object)) {
    return (v as { toNumber: () => number }).toNumber();
  }
  return Number(v);
}

export type AccountingPatch = {
  amountPaid: number;
  balanceDue: number;
  amountTotal: number;
  paymentType: string | null;
  confirmedAt?: Date | null;
  completedAt?: Date | null;
  cancelledAt?: Date | null;
};

/**
 * Contabilidad según estado del turno.
 * Permite subir/bajar de estado y revertir cobros sin borrar el turno.
 *
 * - pendiente_* / vencido → $0
 * - senado → seña (deposit%)
 * - confirmado / completado → 100%
 * - cancelado / no_asistio / reprogramado → $0 (libera cobro contable)
 */
export function accountingForStatus(params: {
  status: AppointmentStatus | string;
  finalPrice: unknown;
  depositPercentage?: number | null;
  now?: Date;
}): AccountingPatch {
  const finalPrice = Math.max(0, toNum(params.finalPrice));
  const depositPct = Math.min(100, Math.max(1, params.depositPercentage || 50));
  const now = params.now || new Date();
  const senaAmount = Math.round(finalPrice * (depositPct / 100));

  switch (params.status) {
    case 'senado':
      return {
        amountPaid: senaAmount,
        balanceDue: Math.max(0, finalPrice - senaAmount),
        amountTotal: finalPrice,
        paymentType: 'sena',
        confirmedAt: now,
        completedAt: null,
        cancelledAt: null,
      };
    case 'confirmado':
      return {
        amountPaid: finalPrice,
        balanceDue: 0,
        amountTotal: finalPrice,
        paymentType: 'total',
        confirmedAt: now,
        completedAt: null,
        cancelledAt: null,
      };
    case 'completado':
      return {
        amountPaid: finalPrice,
        balanceDue: 0,
        amountTotal: finalPrice,
        paymentType: 'total',
        confirmedAt: now,
        completedAt: now,
        cancelledAt: null,
      };
    case 'cancelado':
      return {
        amountPaid: 0,
        balanceDue: finalPrice,
        amountTotal: finalPrice,
        paymentType: null,
        cancelledAt: now,
        completedAt: null,
      };
    case 'no_asistio':
    case 'reprogramado':
    case 'vencido':
    case 'pendiente_pago':
    case 'pendiente_datos':
    default:
      return {
        amountPaid: 0,
        balanceDue: finalPrice,
        amountTotal: finalPrice,
        paymentType: null,
        confirmedAt: null,
        completedAt: null,
        cancelledAt: null,
      };
  }
}
