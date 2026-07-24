import { prisma } from '../config/database';

const VIEWER_ROLES = new Set(['superadmin', 'tenant_admin', 'agent']);

export function canMarkConversationRead(role: string | undefined | null): boolean {
  return !!role && VIEWER_ROLES.has(role);
}

/** Marca actividad del cliente (o handoff bot) como pendiente de revisión en dashboard/inbox. */
export async function flagConversationNeedsAttention(
  conversationId: string,
  opts?: { lastCustomerMessageAt?: Date },
): Promise<void> {
  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      needsAttention: true,
      ...(opts?.lastCustomerMessageAt
        ? { lastCustomerMessageAt: opts.lastCustomerMessageAt }
        : {}),
    },
  });
}

/** Cualquier usuario con permiso de ver mensajes abre el chat → deja de alertar. */
export async function markConversationAttentionRead(conversationId: string): Promise<void> {
  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      needsAttention: false,
      attentionReadAt: new Date(),
    },
  });
}

export function conversationHasUnread(conv: {
  needsAttention?: boolean | null;
}): boolean {
  return !!conv.needsAttention;
}
