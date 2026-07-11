const DEFAULT_DELAY_MS = 6000;

type FlushFn = (mergedText: string) => Promise<void>;

interface DebounceBuffer {
  texts: string[];
  timer: ReturnType<typeof setTimeout> | null;
  onFlush: FlushFn;
  flushing: boolean;
  queuedWhileFlushing: string[];
}

const buffers = new Map<string, DebounceBuffer>();

export class BookingDebounceService {
  /**
   * Acumula mensajes y dispara un único flush tras la ventana de debounce.
   * Siempre devuelve true: el caller debe cortar el pipeline del worker.
   */
  static schedule(params: {
    conversationId: string;
    text: string;
    onFlush: FlushFn;
    delayMs?: number;
  }): boolean {
    const { conversationId, text, onFlush, delayMs = DEFAULT_DELAY_MS } = params;
    let buf = buffers.get(conversationId);
    if (!buf) {
      buf = { texts: [], timer: null, onFlush, flushing: false, queuedWhileFlushing: [] };
      buffers.set(conversationId, buf);
    }
    buf.onFlush = onFlush;
    buf.texts.push(text.trim());
    if (buf.timer) clearTimeout(buf.timer);
    buf.timer = setTimeout(() => {
      void this.flush(conversationId);
    }, delayMs);
    return true;
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
