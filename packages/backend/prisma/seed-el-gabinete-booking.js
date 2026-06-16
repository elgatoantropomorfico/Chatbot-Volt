/**
 * Seed booking module for El Gabinete tenant.
 * Run: node prisma/seed-el-gabinete-booking.js
 * Optional: TENANT_ID=xxx node prisma/seed-el-gabinete-booking.js
 */
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const SERVICES = [
  {
    slug: 'camino-raiz',
    name: 'Camino Raíz',
    serviceType: 'Reflexología holística',
    shortDescription: 'Reflexología holística que comienza en los pies para activar puntos reflejos y reconectar cuerpo, mente y emoción.',
    longDescription: 'Camino Raíz comienza en los pies: el primer contacto con la tierra. A través de la presión consciente, activamos puntos reflejos que revelan tensiones físicas, emociones retenidas y energías estáticas.',
    recommendationTags: ['reflexologia', 'equilibrio', 'conexion', 'pies', 'emociones', 'tension_acumulada'],
    recommendedWhen: ['Experiencia holística', 'Trabajar desde los pies', 'Tensión acumulada o carga emocional'],
    botRecommendationText: 'Por lo que me contás, te recomiendo Camino Raíz. Es ideal si necesitás volver a tu eje y trabajar desde los pies.',
    sortOrder: 1,
  },
  {
    slug: 'camino-ligero',
    name: 'Camino Ligero',
    serviceType: 'Masaje relajante de pies y piernas',
    shortDescription: 'Masaje de pies y piernas para aliviar cansancio, pesadez y tensión acumulada.',
    longDescription: 'Camino Ligero es un descanso profundo para la parte del cuerpo que sostiene cada uno de tus pasos.',
    recommendationTags: ['pies', 'piernas', 'cansancio', 'pesadez', 'circulacion', 'drenaje', 'relajacion'],
    recommendedWhen: ['Piernas cansadas', 'Mucho tiempo de pie', 'Sensación de pesadez'],
    botRecommendationText: 'Por lo que me contás, te recomiendo Camino Ligero. Ideal si venís con pies o piernas cansadas.',
    sortOrder: 2,
  },
  {
    slug: 'camino-de-fuego',
    name: 'Camino de Fuego',
    serviceType: 'Masaje con piedras calientes',
    shortDescription: 'Masaje con piedras calientes para liberar tensiones y relajar contracturas.',
    longDescription: 'En Camino de Fuego, las piedras volcánicas entran en contacto con la piel a una temperatura adecuada.',
    recommendationTags: ['calor', 'piedras_calientes', 'contracturas', 'rigidez', 'descanso', 'relajacion_profunda'],
    recommendedWhen: ['Calor y relajación profunda', 'Contracturas', 'Rigidez corporal'],
    botRecommendationText: 'Por lo que me contás, te recomiendo Camino de Fuego. Ideal si necesitás calor y relajación profunda.',
    sortOrder: 3,
  },
  {
    slug: 'camino-verde',
    name: 'Camino Verde',
    serviceType: 'Masaje con pindas herbales y aromáticas',
    shortDescription: 'Experiencia con pindas herbales, calor y aromas naturales para bajar el ritmo.',
    longDescription: 'Camino Verde combina calor, aroma y contacto consciente con pindas de hierbas y aceites naturales.',
    recommendationTags: ['aromas', 'hierbas', 'pindas', 'sensorial', 'calor', 'calma', 'respiracion'],
    recommendedWhen: ['Experiencia sensorial', 'Aromas naturales', 'Bajar el ritmo mental'],
    botRecommendationText: 'Por lo que me contás, te recomiendo Camino Verde. Ideal si querés aromas naturales y calma.',
    sortOrder: 4,
  },
  {
    slug: 'camino-flexible',
    name: 'Camino Flexible',
    serviceType: 'Masaje con cañas de bambú',
    shortDescription: 'Técnica dinámica con bambú, presión rítmica y drenaje para activar circulación.',
    longDescription: 'Camino Flexible utiliza cañas de bambú para trabajar el cuerpo con presión rítmica y drenaje. Las cañas permiten aplicar presión profunda y rítmica sobre músculos y fascia, activando la circulación y ayudando a liberar rigidez y retención de líquidos.',
    recommendationTags: ['bambu', 'drenaje', 'circulacion', 'vitalidad', 'tonificar', 'presion_ritmica'],
    recommendedWhen: ['Técnica corporal dinámica', 'Activar circulación', 'Recuperar vitalidad'],
    botRecommendationText: 'Por lo que me contás, te recomiendo Camino Flexible. Ideal si buscás una experiencia más dinámica.',
    sortOrder: 5,
  },
];

const SLOTS = ['16:30', '18:00', '19:30'];

const MESSAGES = {
  welcome: 'Hola 🌿 Qué lindo que quieras regalarte un momento para vos.\nPuedo ayudarte a elegir el camino ideal o, si ya sabés cuál querés, avanzamos directo con la reserva.',
  payment_summary: 'Te dejo el resumen de tu turno:\n\nCamino: {{service}}\nDía y horario: {{slot}}\nDuración: {{duration}} minutos\nValor de la sesión: ${{price}}\n\nPara confirmar el turno se abona una seña del {{deposit}}%.\nTambién podés abonar el 100% ahora.\n\nImportante: en caso de cancelación, la seña no es reembolsable.\n\n1️⃣ Señar {{deposit}}%\n2️⃣ Pagar 100%\n3️⃣ Cambiar horario',
  payment_pending: 'Perfecto. Te genero el link de pago seguro por Mercado Pago.\nEl horario queda reservado durante 15 minutos.',
  confirmation: 'Listo, tu turno quedó confirmado 🌿',
  human_handoff: 'Te comunico con una persona del equipo para ayudarte.',
  fallback: 'No entendí esa opción. Escribí *menu* para volver al inicio.',
};

async function main() {
  const tenantId = process.env.TENANT_ID;
  let tenant;
  if (tenantId) {
    tenant = await p.tenant.findUnique({ where: { id: tenantId } });
  } else {
    tenant = await p.tenant.findFirst({
      where: { name: { contains: 'gabinete', mode: 'insensitive' } },
    });
  }

  if (!tenant) {
    console.error('❌ Tenant El Gabinete no encontrado. Pasá TENANT_ID=... o creá el tenant primero.');
    process.exit(1);
  }
  console.log(`✅ Tenant: ${tenant.name} (${tenant.id})`);

  await p.bookingSettings.upsert({
    where: { tenantId: tenant.id },
    create: {
      tenantId: tenant.id,
      bookingEnabled: true,
      bookingMode: 'fixed_slots',
      sessionDurationMinutes: 80,
      slotIntervalMinutes: 90,
      bufferMinutes: 10,
      timezone: 'America/Argentina/Cordoba',
      currency: 'ARS',
      priceMode: 'same_price_for_all_services',
      basePrice: 60000,
      depositEnabled: true,
      depositPercentage: 50,
      depositRefundable: false,
      allowFullPayment: true,
      paymentLinkExpirationMinutes: 15,
      workingDaysJson: [1, 2, 3, 4, 5],
      cancellationPolicyJson: {
        can_cancel: true,
        deposit_refundable: false,
        policy_title: 'Política de cancelación',
        policy_short_text: 'Podés cancelar tu turno, pero la seña abonada no es reembolsable.',
        policy_full_text: 'Para confirmar el turno se solicita una seña del 50%. En caso de cancelación por parte del cliente, la seña abonada no se reintegra. Si necesitás modificar tu turno, podés solicitar una reprogramación sujeta a disponibilidad.',
      },
      messagesJson: MESSAGES,
      allowCustomSlots: true,
      allowCustomServices: true,
      cancelEnabled: true,
    },
    update: {
      bookingEnabled: true,
      basePrice: 60000,
      cancelEnabled: true,
      messagesJson: MESSAGES,
    },
  });
  console.log('✅ BookingSettings');

  for (const s of SERVICES) {
    await p.bookingService.upsert({
      where: { tenantId_slug: { tenantId: tenant.id, slug: s.slug } },
      create: {
        tenantId: tenant.id,
        ...s,
        durationMinutes: 80,
        usesBasePrice: true,
        isActive: true,
        recommendationTags: s.recommendationTags,
        recommendedWhen: s.recommendedWhen,
      },
      update: {
        name: s.name,
        shortDescription: s.shortDescription,
        longDescription: s.longDescription,
        botSummary: null,
        botRecommendationText: s.botRecommendationText,
        recommendationTags: s.recommendationTags,
        isActive: true,
      },
    });
  }
  console.log(`✅ ${SERVICES.length} servicios/caminos`);

  for (let i = 0; i < SLOTS.length; i++) {
    const time = SLOTS[i];
    await p.bookingSlot.upsert({
      where: { tenantId_time: { tenantId: tenant.id, time } },
      create: {
        tenantId: tenant.id,
        time,
        durationMinutes: 80,
        isActive: true,
        sortOrder: i + 1,
      },
      update: { isActive: true, sortOrder: i + 1 },
    });
  }
  console.log(`✅ ${SLOTS.length} slots`);

  const existingRule = await p.bookingPriceRule.findFirst({
    where: { tenantId: tenant.id, label: 'Promo lanzamiento 25% off' },
  });
  if (!existingRule) {
    await p.bookingPriceRule.create({
      data: {
        tenantId: tenant.id,
        label: 'Promo lanzamiento 25% off',
        ruleType: 'percentage_discount',
        value: 25,
        validFrom: new Date('2026-01-01T00:00:00-03:00'),
        validUntil: new Date('2026-06-30T23:59:59-03:00'),
        isActive: true,
        sortOrder: 1,
      },
    });
    console.log('✅ Regla promo 25% hasta 30/06/2026');
  }

  await p.tenant.update({
    where: { id: tenant.id },
    data: { timezone: 'America/Argentina/Cordoba' },
  });

  console.log('\n🎉 Seed El Gabinete booking completado.');
  console.log('Próximo paso: activar Mercado Pago en Integraciones del dashboard.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => p.$disconnect());
