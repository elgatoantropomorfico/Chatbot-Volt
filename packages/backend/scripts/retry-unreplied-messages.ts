import dotenv from 'dotenv';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';

dotenv.config();
const prisma = new PrismaClient();

async function main() {
  const since = new Date('2026-06-15T00:00:00Z');

  const inbound = await prisma.message.findMany({
    where: { direction: 'in', createdAt: { gte: since } },
    orderBy: { createdAt: 'asc' },
    include: {
      conversation: {
        include: {
          channel: { select: { phoneNumberId: true, displayPhone: true, isActive: true } },
          tenant: { select: { name: true } },
          lead: { select: { phone: true, name: true } },
        },
      },
    },
  });

  const unreplied: typeof inbound = [];
  for (const m of inbound) {
    const out = await prisma.message.count({
      where: {
        conversationId: m.conversationId,
        direction: 'out',
        createdAt: { gte: m.createdAt },
      },
    });
    if (out === 0) unreplied.push(m);
  }

  console.log(`Inbound since ${since.toISOString()}: ${inbound.length}`);
  console.log(`Without reply: ${unreplied.length}`);

  for (const m of unreplied) {
    console.log({
      at: m.createdAt.toISOString(),
      tenant: m.conversation.tenant.name,
      from: m.conversation.lead.phone,
      name: m.conversation.lead.name,
      phoneNumberId: m.conversation.channel.phoneNumberId,
      channelActive: m.conversation.channel.isActive,
      text: m.text.slice(0, 60),
      waMessageId: m.providerMessageId,
    });
  }

  if (unreplied.length === 0) {
    await prisma.$disconnect();
    return;
  }

  const redis = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });
  const queue = new Queue('message-processing', { connection: redis });

  let enqueued = 0;
  for (const m of unreplied) {
    const ch = m.conversation.channel;
    if (!ch.isActive) continue;

    const jobId = `retry-${m.providerMessageId}`;
    try {
      await queue.add('process-message', {
        phoneNumberId: ch.phoneNumberId,
        from: m.conversation.lead.phone,
        text: m.text,
        messageId: m.providerMessageId,
        timestamp: String(Math.floor(m.createdAt.getTime() / 1000)),
        profileName: m.conversation.lead.name,
        messageType: m.messageType || 'text',
      }, { jobId, attempts: 1 });
      enqueued++;
      console.log(`✅ Enqueued retry for ${m.conversation.tenant.name} / ${m.conversation.lead.phone}`);
    } catch (err: any) {
      if (err.message?.includes('already exists')) {
        console.log(`⏭️ Already queued: ${jobId}`);
      } else {
        console.error(`❌ ${jobId}:`, err.message);
      }
    }
  }

  console.log(`\nEnqueued ${enqueued} retries`);
  const counts = await queue.getJobCounts('waiting', 'active', 'failed');
  console.log('Queue:', counts);

  await queue.close();
  await redis.quit();
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
