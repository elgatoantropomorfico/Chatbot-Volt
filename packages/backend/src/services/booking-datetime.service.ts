/**
 * Parseo de fecha/hora para turnera — siempre en calendario del tenant.
 */

export interface SlotRef {
  date: string;
  time: string;
  label: string;
}

const DAY_NAMES: Record<string, number> = {
  domingo: 0, lunes: 1, martes: 2, miércoles: 3, miercoles: 3,
  jueves: 4, viernes: 5, sábado: 6, sabado: 6,
};

const DOW_SHORT: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

/** Fecha calendario YYYY-MM-DD en el timezone del tenant (+N días desde hoy local) */
export function calendarDateInTz(timezone: string, offsetDays = 0): string {
  const [y, m, d] = new Date()
    .toLocaleDateString('en-CA', { timeZone: timezone })
    .split('-')
    .map(Number);
  return new Date(Date.UTC(y, m - 1, d + offsetDays)).toISOString().slice(0, 10);
}

/** Rango de semana calendario en TZ del negocio (lunes–domingo local). */
export function weekRangeInTz(
  timezone: string,
  which: 'this' | 'next',
): { dateFrom: string; dateTo: string } {
  const today = calendarDateInTz(timezone, 0);
  const short = new Date(`${today}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short' });
  const dow = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[short] ?? 0;
  const sinceMonday = dow === 0 ? 6 : dow - 1;
  const mondayOffset = which === 'this' ? -sinceMonday : (7 - sinceMonday);
  return {
    dateFrom: calendarDateInTz(timezone, mondayOffset),
    dateTo: calendarDateInTz(timezone, mondayOffset + 6),
  };
}

export function matchesDaypart(time: string, daypart: 'ANY' | 'MORNING' | 'AFTERNOON' | 'EVENING' = 'ANY'): boolean {
  if (daypart === 'ANY') return true;
  const h = parseInt(time.split(':')[0], 10);
  if (daypart === 'MORNING') return h < 13;
  if (daypart === 'AFTERNOON') return h >= 13 && h < 18;
  if (daypart === 'EVENING') return h >= 18;
  return true;
}

export function currentYearInTz(timezone: string): number {
  return parseInt(calendarDateInTz(timezone, 0).slice(0, 4), 10);
}

/** Etiquetas de horario: "jueves 18-06 — 18:00" o "Hoy — 16:30" */
export function optionsLookLikeSlots(options: string[]): boolean {
  if (!options.length) return false;
  const slotish = options.filter((o) => /—\s*\d{1,2}(?::\d{2})?/.test(o));
  return slotish.length >= Math.min(2, options.length) || (options.length === 1 && slotish.length === 1);
}

export function looksLikeDateQuery(text: string): boolean {
  const t = text.toLowerCase();
  if (/\b(pasado\s+mañana|pasado\s+manana|mañana|manana|hoy)\b/.test(t)) return true;
  if (/\b(lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo)\b/.test(t)) return true;
  if (/\b\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?\b/.test(t)) return true;
  if (/\b(esta semana|semana)\b/.test(t)) return true;
  if (/\b(?:a las|las)\s+\d{1,2}(?::\d{2})?\s*(?:hs?)?\b/.test(t)) return true;
  if (/\b\d{1,2}\s*(?:hs|h)\b/.test(t)) return true;
  if (/\b(por la tarde|a la tarde|en la tarde|por la mañana|a la mañana|en la mañana)\b/.test(t)) return true;
  return false;
}

/** Mensaje con intención clara de elegir día y/o hora de turno */
export function looksLikeSlotPickQuery(text: string): boolean {
  const hasRelativeDay = /\b(pasado\s+mañana|pasado\s+manana|mañana|manana|hoy)\b/i.test(text);
  const hasWeekday = /\b(lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo)\b/i.test(text);
  const hasDateNum = /\b\d{1,2}[\/\-]\d{1,2}\b/.test(text);
  const hasTime = parseTargetTime(text) != null;
  const hasDayPart = /\b(por la tarde|a la tarde|en la tarde|por la mañana|a la mañana|en la mañana)\b/i.test(text);

  if (hasTime && (hasRelativeDay || hasWeekday || hasDateNum)) return true;
  if (hasDayPart && (hasRelativeDay || hasWeekday || hasDateNum)) return true;
  return false;
}

export function resolveTargetDateStr(query: string, timezone: string): string | null {
  const q = query.toLowerCase();

  if (/\bpasado\s+mañana\b/.test(q) || /\bpasado\s+manana\b/.test(q)) {
    return calendarDateInTz(timezone, 2);
  }
  if (/\b(para\s+)?mañana\b/.test(q) || /\b(para\s+)?manana\b/.test(q)) {
    return calendarDateInTz(timezone, 1);
  }
  if (/\bhoy\b/.test(q)) {
    return calendarDateInTz(timezone, 0);
  }

  const dm = q.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
  if (dm) {
    const day = parseInt(dm[1], 10);
    const month = parseInt(dm[2], 10);
    const year = dm[3]
      ? (dm[3].length === 2 ? 2000 + parseInt(dm[3], 10) : parseInt(dm[3], 10))
      : currentYearInTz(timezone);
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  for (const [name, dow] of Object.entries(DAY_NAMES)) {
    if (!new RegExp(`\\b${name}\\b`).test(q)) continue;
    for (let i = 0; i < 7; i++) {
      const dateStr = calendarDateInTz(timezone, i);
      const short = new Date(`${dateStr}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', timeZone: timezone });
      if (DOW_SHORT[short] === dow) return dateStr;
    }
    break;
  }
  return null;
}

export function parseTargetTime(query: string): string | null {
  const q = query.toLowerCase().trim();

  const patterns: RegExp[] = [
    /\b(?:a las|las)\s+(\d{1,2})(?:[:.](\d{2}))?\s*(?:hs?)?\b/,
    /\b(\d{1,2})[:.](\d{2})\s*(?:hs?)?\b/,
    /\b(\d{1,2})\s*(?:hs|h)\b/,
  ];

  for (const re of patterns) {
    const m = q.match(re);
    if (!m) continue;
    const h = parseInt(m[1], 10);
    const min = parseInt(m[2] || '0', 10);
    if (h < 0 || h > 23 || min < 0 || min > 59) continue;
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  }

  // "jueves 18", "mañana 18" — hora suelta al final (6–23 para no confundir con día del mes)
  const tailHour = q.match(/\b(\d{1,2})\s*$/);
  if (tailHour) {
    const h = parseInt(tailHour[1], 10);
    if (h >= 6 && h <= 23) {
      return `${String(h).padStart(2, '0')}:00`;
    }
  }

  return null;
}

/**
 * Matchea fecha+hora contra slots concretos (lista "Ver opciones").
 * Nunca matchea solo por números sueltos en la etiqueta (ej. "18" de "18-06").
 */
export function findMatchingSlot(
  query: string,
  timezone: string,
  slots: SlotRef[],
): SlotRef | null {
  if (!slots.length) return null;

  const targetDate = resolveTargetDateStr(query, timezone);
  const targetTime = parseTargetTime(query);
  let candidates = [...slots];

  if (targetDate) candidates = candidates.filter((s) => s.date === targetDate);
  if (targetTime) candidates = candidates.filter((s) => s.time === targetTime);

  if (!targetDate && !targetTime) return null;

  if (candidates.length === 1) return candidates[0];

  if (targetDate && targetTime && candidates.length > 0) return candidates[0];

  if (targetDate && !targetTime && candidates.length === 1) return candidates[0];

  return null;
}

/** Filtra slots por intención de fecha/hora (turnera completa) */
export function filterSlotsByQuery(
  query: string,
  timezone: string,
  all: SlotRef[],
): SlotRef[] {
  const q = query.toLowerCase();

  if (q.includes('esta semana') || (q.includes('semana') && !q.includes('fin de semana'))) {
    return all;
  }

  let targetDateStr = resolveTargetDateStr(query, timezone);
  let targetDow: number | null = null;

  if (!targetDateStr) {
    for (const [name, dow] of Object.entries(DAY_NAMES)) {
      if (new RegExp(`\\b${name}\\b`).test(q)) {
        targetDow = dow;
        break;
      }
    }
  }

  const targetTime = parseTargetTime(query);
  const wantsAfternoon = /\b(por la tarde|a la tarde|en la tarde|noche)\b/.test(q);
  const wantsMorning = /\b(por la mañana|a la mañana|en la mañana|temprano)\b/.test(q);

  return all.filter((s) => {
    if (targetDateStr && s.date !== targetDateStr) return false;
    if (targetDow != null) {
      const short = new Date(`${s.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', timeZone: timezone });
      if (DOW_SHORT[short] !== targetDow) return false;
    }
    if (targetTime && s.time !== targetTime) return false;
    const [h] = s.time.split(':').map(Number);
    if (wantsAfternoon && h < 12) return false;
    if (wantsMorning && h >= 14) return false;
    return true;
  });
}
