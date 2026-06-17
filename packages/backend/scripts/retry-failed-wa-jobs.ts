/**
 * Reintenta jobs fallidos de WhatsApp que no recibieron respuesta.
 * Omite mensajes que ya tienen reply o cuyo canal ya no existe.
 */
import dotenv from 'dotenv';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';

dotenv.config();

const prisma = new PrismaClient();

const PHONE_NUMBER_ID_ALIASES: Record<string, string> = {
  // Veo Veo — phone_number_id viejo en jobs fallidos de la cola
  '998503420015129': '1050917248094220',
};

async function resolvePhoneNumberId(raw: string): Promise<string | null> {
  const channel = await prisma.channel.findUnique({ where: { phoneNumberId: raw } });
  if (channel?.isActive) return raw;
  const alias = PHONE_NUMBER_ID_ALIASES[raw];
  if (!alias) return null;
  const aliased = await prisma.channel.findUnique({ where: { phoneNumberId: alias } });
  return aliased?.isActive ? alias : null;
}

async function main() {
  const redis = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });
  const queue = new Queue('message-processing', { connection: redis });

  const failed = await queue.getFailed(0, 500);
  console.log(`Failed jobs found: ${failed.length}`);

  let retried = 0;
  let skippedHasReply = 0;
  let skippedNoChannel = 0;
  let skippedOther = 0;

  for (const job of failed) {
    const data = job.data as {
      phoneNumberId?: string;
      from?: string;
      text?: string;
      messageId?: string;
    };

    if (!data?.phoneNumberId || !data?.messageId) {
      skippedOther++;
      continue;
    }

    const phoneNumberId = await resolvePhoneNumberId(data.phoneNumberId);
    if (!phoneNumberId) {
      console.log(`⏭️ Skip (no channel): ${data.messageId?.slice(0, 30)}… phoneNumberId=${data.phoneNumberId}`);
      skippedNoChannel++;
      continue;
    }

    const incoming = await prisma.message.findFirst({
      where: { providerMessageId: data.messageId, direction: 'in' },
      orderBy: { createdAt: 'desc' },
    });

    if (incoming) {
      const hasReply = await prisma.message.count({
        where: {
          conversationId: incoming.conversationId,
          direction: 'out',
          createdAt: { gte: incoming.createdAt },
        },
      });
      if (hasReply > 0) {
        skippedHasReply++;
        await job.remove();
        continue;
      }
    }

    try {
      const payload = { ...data, phoneNumberId };
      await queue.add('process-message', payload, {
        jobId: `retry-${data.messageId}`,
        attempts: 1,
      });
      await job.remove();
      retried++;
      console.log(`🔁 Retried: ${data.from} — "${(data.text || '').slice(0, 50)}"`);
    } catch (err: any) {
      if (err.message?.includes('already exists')) {
        await job.remove();
        skippedOther++;
      } else {
        console.error(`❌ Could not retry ${job.id}:`, err.message);
        skippedOther++;
      }
    }
  }

  const counts = await queue.getJobCounts('waiting', 'active', 'failed', 'completed');
  console.log('\n=== Summary ===');
  console.log({ retried, skippedHasReply, skippedNoChannel, skippedOther });
  console.log('Queue after:', counts);

  await queue.close();
  await redis.quit();
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
