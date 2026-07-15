const DEFAULT_DELAY_MS = 6000;
const QUICK_TAP_DELAY_MS = 400;

type FlushFn = (mergedText: string) => Promise<void>;

interface DebounceBuffer {
  texts: string[];
  timer: ReturnType<typeof setTimeout> | null;
  onFlush: FlushFn;
  flushing: boolean;
  queuedWhileFlushing: string[];
}

const buffers = new Map<string, DebounceBuffer>();

function isQuickTap(text: string): boolean {
  const t = text.trim();
  return /^\d{1,2}$/.test(t)
    || /^(si|sí|no|nada|menu|menú|humano)$/i.test(t);
}

export class BookingDebounceService {
  /**
   * Acumula mensajes y dispara un único flush tras la ventana de debounce.
   * Taps numéricos / sí-no flush casi inmediato y no se mezclan con texto libre previo.
   * Siempre devuelve true: el caller debe cortar el pipeline del worker.
   */
  static schedule(params: {
    conversationId: string;
    text: string;
    onFlush: FlushFn;
    delayMs?: number;
  }): boolean {
    const { conversationId, text, onFlush } = params;
    const trimmed = text.trim();
    if (!trimmed) return true;

    let buf = buffers.get(conversationId);
    if (!buf) {
      buf = { texts: [], timer: null, onFlush, flushing: false, queuedWhileFlushing: [] };
      buffers.set(conversationId, buf);
    }
    buf.onFlush = onFlush;

    const quick = isQuickTap(trimmed);
    const delayMs = params.delayMs
      ?? (quick ? QUICK_TAP_DELAY_MS : DEFAULT_DELAY_MS);

    // Tap de menú: no mezclar con texto libre anterior (evita "menú del bot\n3")
    if (quick && buf.texts.length > 0 && !buf.texts.every(isQuickTap)) {
      if (buf.timer) clearTimeout(buf.timer);
      buf.timer = null;
      const pending = [...buf.texts];
      buf.texts = [];
      void this.flushTexts(conversationId, pending, onFlush).finally(() => {
        this.schedule({ conversationId, text: trimmed, onFlush, delayMs: QUICK_TAP_DELAY_MS });
      });
      return true;
    }

    buf.texts.push(trimmed);
    if (buf.timer) clearTimeout(buf.timer);
    buf.timer = setTimeout(() => {
      void this.flush(conversationId);
    }, delayMs);
    return true;
  }

  private static async flushTexts(
    conversationId: string,
    texts: string[],
    onFlush: FlushFn,
  ): Promise<void> {
    const merged = texts.join('\n').trim();
    if (!merged) return;
    const buf = buffers.get(conversationId);
    if (buf?.flushing) {
      buf.queuedWhileFlushing.push(merged);
      return;
    }
    if (buf) buf.flushing = true;
    try {
      await onFlush(merged);
    } catch (err: any) {
      console.error('📅 Booking debounce flush error:', err.message || err);
    } finally {
      if (buf) {
        buf.flushing = false;
        if (buf.queuedWhileFlushing.length > 0) {
          buf.texts = [...buf.queuedWhileFlushing];
          buf.queuedWhileFlushing = [];
          buf.timer = setTimeout(() => {
            void this.flush(conversationId);
          }, 300);
        }
      }
    }
  }

  private static async flush(conversationId: string): Promise<void> {
    const buf = buffers.get(conversationId);
    if (!buf || buf.texts.length === 0) return;

    const merged = buf.texts.join('\n').trim();
    buf.texts = [];
    buf.timer = null;

    if (buf.flushing) {
      buf.queuedWhileFlushing.push(merged);
      return;
    }

    buf.flushing = true;
    try {
      await buf.onFlush(merged);
    } catch (err: any) {
      console.error('📅 Booking debounce flush error:', err.message || err);
    } finally {
      buf.flushing = false;
      if (buf.queuedWhileFlushing.length > 0) {
        buf.texts = [...buf.queuedWhileFlushing];
        buf.queuedWhileFlushing = [];
        buf.timer = setTimeout(() => {
          void this.flush(conversationId);
        }, 300);
      } else if (buf.texts.length === 0) {
        buffers.delete(conversationId);
      }
    }
  }
}
