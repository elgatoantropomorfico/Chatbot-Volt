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
      guardrailsJson: [
        { id: 'no_competitors', label: 'No recomendar competencia', prompt: 'Nunca menciones, recomiendes ni hagas referencia a productos, servicios o marcas de la competencia. Si te preguntan, redirige amablemente hacia los productos/servicios propios.', enabled: true },
        { id: 'no_pricing_negotiation', label: 'No negociar precios', prompt: 'No ofrezcas descuentos, rebajas ni negocies precios. Si el cliente pide descuento, indica amablemente que los precios son fijos o que puede consultar las promociones vigentes.', enabled: false },
        { id: 'no_personal_opinions', label: 'No dar opiniones personales', prompt: 'No des opiniones personales ni subjetivas. Limitate a hechos, datos del negocio e información objetiva sobre los productos/servicios.', enabled: false },
        { id: 'only_business_topics', label: 'Solo temas del negocio', prompt: 'Responde únicamente sobre temas relacionados al negocio, sus productos y servicios. Si te preguntan sobre otros temas no relacionados, indica amablemente que solo podés ayudar con consultas sobre el negocio.', enabled: true },
        { id: 'no_external_links', label: 'No compartir links externos', prompt: 'No compartas links, URLs ni referencias a sitios web externos. Solo podés compartir información que te haya sido proporcionada en tu contexto.', enabled: false },
        { id: 'collect_contact', label: 'Solicitar datos de contacto', prompt: 'Cuando detectes intención de compra o consulta seria, solicita amablemente nombre, email y/o teléfono del cliente para seguimiento.', enabled: false },
        { id: 'no_medical_legal_advice', label: 'No dar consejos médicos/legales', prompt: 'Nunca des consejos médicos, legales ni financieros. Si te preguntan, sugiere que consulten con un profesional especializado.', enabled: false },
        { id: 'polite_language', label: 'Lenguaje formal y respetuoso', prompt: 'Mantené siempre un tono formal, respetuoso y profesional. No uses jerga, insultos ni lenguaje inapropiado bajo ninguna circunstancia, incluso si el cliente lo hace.', enabled: true },
        { id: 'woo_no_invent_products', label: '🛒 No inventar productos ni precios', prompt: 'Cuando respondés fuera del modo compra, NUNCA inventes nombres de productos, precios ni disponibilidad. No tenés acceso al inventario. Si el cliente pregunta por algo específico, guialo al catálogo.', enabled: true, scope: 'woocommerce' },
        { id: 'woo_no_confirm_purchase', label: '🛒 No simular ventas ni confirmar pedidos', prompt: 'NUNCA digas que una compra fue realizada ni que un pedido está confirmado. Vos solo respondés consultas; las compras las maneja el sistema de carrito automáticamente.', enabled: true, scope: 'woocommerce' },
        { id: 'woo_redirect_search', label: '🛒 Guiar al cliente al catálogo', prompt: 'Si el cliente quiere ver o comprar un producto, indicale que escriba "Busco [producto]" o "Quiero comprar" para que el sistema le muestre opciones del catálogo real.', enabled: true, scope: 'woocommerce' },
        { id: 'woo_no_fake_cart', label: '🛒 No mencionar carrito fuera del modo compra', prompt: 'No menciones el carrito ni sugieras "Finalizar compra" a menos que el cliente ya esté comprando y tenga productos agregados. Esa función solo existe dentro del modo compra.', enabled: true, scope: 'woocommerce' },
      ],
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
