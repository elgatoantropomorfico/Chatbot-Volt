/**
 * Seed Pilot CRM + catalog for Le Rocher tenant.
 * Run: node prisma/seed-le-rocher-pilot.js
 */
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const TENANT_ID = 'cmq8igu1q000lli09cr2e02on';

const PILOT_FIELDS = [
  { localKey: 'fname', pilotField: 'pilot_firstname', label: 'Nombre', fieldType: 'text', isRequired: true, sortOrder: 1, description: 'Confirmá el nombre de pila del cliente.' },
  { localKey: 'lname', pilotField: 'pilot_lastname', label: 'Apellido', fieldType: 'text', isRequired: true, sortOrder: 2, description: 'Confirmá el apellido del cliente.' },
  { localKey: 'phone', pilotField: 'pilot_cellphone', label: 'Celular', fieldType: 'phone', isRequired: true, sortOrder: 3, description: 'Se obtiene automáticamente de WhatsApp.' },
  { localKey: 'product', pilotField: 'pilot_product_of_interest', label: 'Modelo o plan', fieldType: 'text', isRequired: true, sortOrder: 4, includeInNotes: true, description: '¿Qué modelo o versión le interesa?' },
  {
    localKey: 'biz', pilotField: 'pilot_business_type_id', label: 'Tipo de operación', fieldType: 'select', isRequired: true, sortOrder: 5,
    defaultValue: '1', description: '¿Busca 0km o usado?',
    optionsJson: [{ value: '1', label: '0km' }, { value: '2', label: 'Usado' }],
  },
  { localKey: 'has_trade_in', pilotField: 'notes', label: 'Usado para entregar', fieldType: 'boolean', isRequired: true, sortOrder: 6, includeInNotes: true, description: '¿Tenés un usado para entregar como parte de pago? Respondé sí o no.' },
  { localKey: 'notes', pilotField: 'pilot_notes', label: 'Resumen conversación', fieldType: 'textarea', isRequired: true, sortOrder: 7, description: 'Resumen breve de la consulta y próximos pasos.' },
];

const CATALOG = `PEUGEOT
- 208: Active, Allure, GT (nafta/diesel según versión)
- 2008: Active, Allure, GT
- Partner / Expert: utilitarios comerciales

CITROËN
- C3: Feel, Shine
- C3 Aircross: Feel, Shine
- Berlingo: utilitario

JEEP
- Renegade: Sport, Longitude, Limited
- Compass: Sport, Longitude, Limited

RAM
- 1500 / Rampage (consultar versiones disponibles)

UTILITARIOS
- Peugeot Partner, Expert
- Citroën Berlingo`;

const PRICE_RANGE = `PEUGEOT 208
- Plan EASY: anticipo + cuotas fijas
- Plan PLUS: menor anticipo, más cuotas
- Plan 70/30 disponible según stock

PEUGEOT 2008
- Plan ACTIVE / ALLURE con anticipo desde consulta en sala
- Tasa 0% en campañas vigentes (sujeto a aprobación crediticia)

BENEFICIOS GENERALES
- Tomamos usado llave por llave
- Hasta 84 cuotas
- Tasa 0% en planes seleccionados`;

async function main() {
  const tenant = await p.tenant.findUnique({ where: { id: TENANT_ID } });
  if (!tenant) {
    console.error(`❌ Tenant ${TENANT_ID} no encontrado. Creá el tenant en superadmin primero.`);
    process.exit(1);
  }
  console.log(`✅ Tenant: ${tenant.name}`);

  // Integration pilot_crm
  const existingInt = await p.integration.findFirst({
    where: { tenantId: TENANT_ID, type: 'pilot_crm' },
  });
  if (existingInt) {
    await p.integration.update({
      where: { id: existingInt.id },
      data: { status: 'active', configEncrypted: JSON.stringify({ serverConfigured: true }) },
    });
    console.log('🔄 Integration pilot_crm actualizada');
  } else {
    await p.integration.create({
      data: {
        tenantId: TENANT_ID,
        type: 'pilot_crm',
        status: 'active',
        configEncrypted: JSON.stringify({ serverConfigured: true }),
      },
    });
    console.log('✅ Integration pilot_crm creada');
  }

  // Pilot field configs
  for (const f of PILOT_FIELDS) {
    await p.pilotFieldConfig.upsert({
      where: { tenantId_localKey: { tenantId: TENANT_ID, localKey: f.localKey } },
      create: { tenantId: TENANT_ID, ...f, isActive: true, includeInNotes: f.includeInNotes || false, optionsJson: f.optionsJson || [] },
      update: { ...f, isActive: true, includeInNotes: f.includeInNotes || false, optionsJson: f.optionsJson || [] },
    });
  }
  console.log(`✅ ${PILOT_FIELDS.length} PilotFieldConfig upserted`);

  // Bot settings — catalog in promptBuilderJson.products
  const botSettings = await p.botSettings.findUnique({ where: { tenantId: TENANT_ID } });
  const existingPb = (botSettings?.promptBuilderJson || {}) ;
  const products = {
    catalog: CATALOG,
    priceRange: PRICE_RANGE,
    categories: 'Peugeot, Citroën, Jeep, RAM, Utilitarios',
    description: 'Concesionaria oficial en Formosa. Venta de 0km y usados, planes de financiación.',
    notes: 'Tomamos usado llave por llave. Tasa 0% y hasta 84 cuotas en planes seleccionados.',
    ...(existingPb.products || {}),
  };
  // Prefer seed catalog if empty
  if (!existingPb.products?.catalog) {
    products.catalog = CATALOG;
  }
  if (!existingPb.products?.priceRange) {
    products.priceRange = PRICE_RANGE;
  }

  const promptBuilderJson = {
    ...existingPb,
    business: {
      name: 'Le Rocher - Concesionaria Formosa',
      industry: 'Automotriz / Concesionaria',
      description: 'Venta de vehículos 0km y usados. Marcas Peugeot, Citroën, Jeep y RAM.',
      tone: 'Amigable y cercano',
      ...(existingPb.business || {}),
    },
    products,
    personality: {
      ...(existingPb.personality || {}),
      greeting: existingPb.personality?.greeting?.includes('Peugeot') && !existingPb.personality?.greeting?.includes('Citro')
        ? 'Hola, soy el asistente de Le Rocher. ¿En qué modelo o plan estás interesado? Trabajamos con Peugeot, Citroën, Jeep y RAM.'
        : (existingPb.personality?.greeting || 'Hola, soy el asistente de Le Rocher. ¿En qué modelo o plan estás interesado? Trabajamos con Peugeot, Citroën, Jeep y RAM.'),
      style: existingPb.personality?.style || 'Español argentino, claro, breve. Una pregunta por mensaje.',
      restrictions: existingPb.personality?.restrictions
        ? `${existingPb.personality.restrictions} Nunca decir que solo vendemos Peugeot.`
        : 'No inventar precios ni modelos fuera del catálogo. Nunca decir que solo vendemos Peugeot; somos multimarca.',
    },
  };

  if (botSettings) {
    await p.botSettings.update({
      where: { tenantId: TENANT_ID },
      data: { promptBuilderJson },
    });
  } else {
    await p.botSettings.create({
      data: {
        tenantId: TENANT_ID,
        systemPrompt: 'Sos el asistente comercial de Le Rocher, concesionaria multimarca en Formosa (Peugeot, Citroën, Jeep, RAM). Usá el catálogo cargado en productos para listar modelos.',
        model: 'gpt-4o-mini',
        temperature: 0.7,
        promptBuilderJson,
      },
    });
  }
  console.log('✅ Bot settings / catálogo actualizado');

  console.log('\n🎉 Seed Le Rocher Pilot completado.');
  console.log('Próximo paso: configurar PILOT_* y GROQ_* en Railway y correr la migración.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => p.$disconnect());
