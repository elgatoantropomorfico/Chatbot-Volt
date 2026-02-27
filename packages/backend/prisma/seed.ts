import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create superadmin
  const passwordHash = await bcrypt.hash('admin123456', 12);
  const superadmin = await prisma.user.upsert({
    where: { email: 'admin@volt.dev' },
    update: {},
    create: {
      email: 'admin@volt.dev',
      passwordHash,
      role: 'superadmin',
    },
  });
  console.log(`✅ Superadmin created: ${superadmin.email}`);

  // Create demo tenant
  const tenant = await prisma.tenant.upsert({
    where: { id: 'demo-tenant' },
    update: {},
    create: {
      id: 'demo-tenant',
      name: 'Demo Store',
      status: 'active',
      timezone: 'America/Argentina/Buenos_Aires',
    },
  });
  console.log(`✅ Tenant created: ${tenant.name}`);

  // Create bot settings for demo tenant
  await prisma.botSettings.upsert({
    where: { tenantId: tenant.id },
    update: {},
    create: {
      tenantId: tenant.id,
      systemPrompt: 'Eres un asistente virtual de Demo Store. Ayudás a los clientes con consultas sobre productos y pedidos. Respondé siempre en español, de forma amable y profesional.',
      model: 'gpt-4o-mini',
      temperature: 0.7,
      maxContextMessages: 15,
      handoffEnabled: true,
      handoffPhoneE164: '5491100000000',
      handoffMessageTemplate: 'Te derivo con un asesor humano para que te ayude mejor: {{wa_me_link}}',
      handoffTriggersJson: {
        keywords: ['humano', 'asesor', 'reclamo', 'queja', 'llamar'],
        outside_business_hours: false,
        force_on_negative_sentiment: false,
      },
    },
  });
  console.log('✅ Bot settings created');

  // Create demo channel (sandbox)
  await prisma.channel.upsert({
    where: { phoneNumberId: '998503420015129' },
    update: {},
    create: {
      tenantId: tenant.id,
      provider: 'whatsapp_cloud',
      phoneNumberId: '998503420015129',
      wabaId: '2095266721226644',
      displayPhone: 'Volt WhatsApp',
      isActive: true,
    },
  });
  console.log('✅ Sandbox channel created');

  // Create tenant admin
  const tenantAdminHash = await bcrypt.hash('tenant123456', 12);
  const tenantAdmin = await prisma.user.upsert({
    where: { email: 'tenant@demo.com' },
    update: {},
    create: {
      email: 'tenant@demo.com',
      passwordHash: tenantAdminHash,
      role: 'tenant_admin',
      tenantId: tenant.id,
    },
  });
  console.log(`✅ Tenant admin created: ${tenantAdmin.email}`);

  // Create agent
  const agentHash = await bcrypt.hash('agent123456', 12);
  const agent = await prisma.user.upsert({
    where: { email: 'agent@demo.com' },
    update: {},
    create: {
      email: 'agent@demo.com',
      passwordHash: agentHash,
      role: 'agent',
      tenantId: tenant.id,
    },
  });
  console.log(`✅ Agent created: ${agent.email}`);

  console.log('\n🎉 Seed completed!');
  console.log('\nCredentials:');
  console.log('  Superadmin: admin@volt.dev / admin123456');
  console.log('  Tenant Admin: tenant@demo.com / tenant123456');
  console.log('  Agent: agent@demo.com / agent123456');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
