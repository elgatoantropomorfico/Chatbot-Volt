import { prisma } from '../config/database';

const VIEWER_ROLES = new Set(['superadmin', 'tenant_admin', 'agent']);

export function canMarkConversationRead(role: string | undefined | null): boolean {
  return !!role && VIEWER_ROLES.has(role);
}

/** Solo handoff automatico del bot prende alerta de dashboard. */
export async function flagConversationNeedsAttention(conversationId: string): Promise<void> {
  // Raw: no tocar updated_at (el orden del inbox no debe moverse por flags)
  await prisma.$executeRawUnsafe(
    `UPDATE conversations SET needs_attention = true WHERE id = $1`,
    conversationId,
  );
}

/**
 * Marca leido: limpia alerta dashboard + contador de no leidos.
 * Raw SQL a proposito: no bumpa updated_at ni last_message_at (orden estable como WhatsApp).
 */
export async function markConversationAttentionRead(conversationId: string): Promise<void> {
  await prisma.$executeRawUnsafe(
    `UPDATE conversations
     SET needs_attention = false,
         unread_count = 0,
         attention_read_at = NOW()
     WHERE id = $1`,
    conversationId,
  );
}

/** Mensaje entrante del cliente: suma al globito (sin prender alerta dashboard). */
export async function registerInboundUnread(conversationId: string, at: Date = new Date()): Promise<void> {
  await prisma.$executeRawUnsafe(
    `UPDATE conversations
     SET unread_count = unread_count + 1,
         last_customer_message_at = $2,
         last_message_at = $2
     WHERE id = $1`,
    conversationId,
    at,
  );
}

/** Cualquier mensaje (in/out/system) mueve el chat arriba como WhatsApp. */
export async function touchConversationLastMessage(conversationId: string, at: Date = new Date()): Promise<void> {
  await prisma.$executeRawUnsafe(
    `UPDATE conversations SET last_message_at = $2 WHERE id = $1`,
    conversationId,
    at,
  );
}

export function conversationHasUnread(conv: {
  unreadCount?: number | null;
  needsAttention?: boolean | null;
}): boolean {
  return (conv.unreadCount ?? 0) > 0 || !!conv.needsAttention;
}
