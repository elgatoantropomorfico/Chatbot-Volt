import { prisma } from '../config/database';
import { R2Service } from './r2.service';

/**
 * Ordered teardown for channels and tenants.
 *
 * Conversations hold a required FK to Channel without DB-level cascade, so
 * channel/tenant deletes must clear them explicitly before removing channels.
 */
export class TenantCleanupService {
  static async deleteChannel(channelId: string) {
    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
      include: { tenant: { select: { name: true } } },
    });
    if (!channel) throw new Error('Channel not found');

    const convCount = await prisma.conversation.count({ where: { channelId } });

    await prisma.$transaction(async (tx) => {
      await tx.conversation.deleteMany({ where: { channelId } });
      await tx.lead.updateMany({ where: { channelId }, data: { channelId: null } });
      await tx.channel.delete({ where: { id: channelId } });
    });

    console.log(
      `🗑️ Deleted channel ${channelId} (${channel.displayPhone || channel.phoneNumberId}) ` +
        `tenant=${channel.tenant?.name || channel.tenantId}, conversations=${convCount}`,
    );

    return { conversationsRemoved: convCount };
  }

  static async deleteTenant(tenantId: string) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        _count: {
          select: {
            users: true,
            channels: true,
            leads: true,
            conversations: true,
            integrations: true,
            leadFieldConfigs: true,
            zohoFieldConfigs: true,
          },
        },
      },
    });
    if (!tenant) throw new Error('Tenant not found');

    // Best-effort: wipe all R2 media under this tenant prefix.
    try {
      const removed = await R2Service.deleteByPrefix(`${tenantId}/`);
      if (removed > 0) {
        console.log(`🧹 Removed ${removed} R2 object(s) for tenant ${tenantId}`);
      }
    } catch (err) {
      console.warn(`⚠️ R2 cleanup failed for tenant ${tenantId} (continuing):`, err);
    }

    await prisma.$transaction(async (tx) => {
      // Conversations block channel removal (FK without cascade).
      await tx.conversation.deleteMany({ where: { tenantId } });
      await tx.lead.updateMany({
        where: { tenantId },
        data: { assignedUserId: null, channelId: null },
      });
      // Cascades: users (+ refresh tokens), channels, leads (+ notes, photos,
      // requests), botSettings, integrations, sales, offers, field configs, etc.
      await tx.tenant.delete({ where: { id: tenantId } });
    });

    const c = tenant._count;
    console.log(
      `🗑️ Deleted tenant ${tenantId} (${tenant.name}) — ` +
        `users=${c.users}, channels=${c.channels}, leads=${c.leads}, ` +
        `conversations=${c.conversations}, integrations=${c.integrations}`,
    );

    return {
      usersRemoved: c.users,
      channelsRemoved: c.channels,
      leadsRemoved: c.leads,
      conversationsRemoved: c.conversations,
    };
  }
}
