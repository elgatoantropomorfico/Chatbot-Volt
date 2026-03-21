const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const IUDI_TENANT_ID = 'cmm8mflz3000spc48sc48dcud';

const FIELDS = [
  {
    localKey: 'firstName',
    zohoField: 'First_Name',
    label: 'Nombre',
    fieldType: 'single_line',
    isRequired: true,
    sortOrder: 1,
    optionsJson: [],
  },
  {
    localKey: 'lastName',
    zohoField: 'Last_Name',
    label: 'Apellido',
    fieldType: 'single_line',
    isRequired: true,
    sortOrder: 2,
    optionsJson: [],
  },
  {
    localKey: 'phone',
    zohoField: 'Mobile',
    label: 'Teléfono',
    fieldType: 'phone',
    isRequired: true,
    sortOrder: 3,
    description: 'Se obtiene automáticamente de WhatsApp',
    optionsJson: [],
  },
  {
    localKey: 'email',
    zohoField: 'Email',
    label: 'Email',
    fieldType: 'email',
    isRequired: false,
    sortOrder: 4,
    optionsJson: [],
  },
  {
    localKey: 'dni',
    zohoField: 'DNI',
    label: 'DNI',
    fieldType: 'single_line',
    isRequired: false,
    sortOrder: 5,
    optionsJson: [],
  },
  {
    localKey: 'offerInterest',
    zohoField: 'Programa',
    label: 'Programa',
    fieldType: 'picklist',
    isRequired: true,
    sortOrder: 6,
    optionsJson: [
      { value: 'Curso 1', slug: 'curso-1', aliases: ['curso uno', 'primer curso', 'curso 1'], keywords: ['curso', 'uno', '1'], description: 'Curso 1 de IUDI' },
      { value: 'Curso 2', slug: 'curso-2', aliases: ['curso dos', 'segundo curso', 'curso 2'], keywords: ['curso', 'dos', '2'], description: 'Curso 2 de IUDI' },
      { value: 'Curso 3', slug: 'curso-3', aliases: ['curso tres', 'tercer curso', 'curso 3'], keywords: ['curso', 'tres', '3'], description: 'Curso 3 de IUDI' },
    ],
  },
  {
    localKey: 'modalityInterest',
    zohoField: 'Modalidad',
    label: 'Modalidad',
    fieldType: 'picklist',
    isRequired: false,
    sortOrder: 7,
    optionsJson: [
      { value: 'Presencial', aliases: ['presencial'] },
      { value: 'A Distancia', aliases: ['a distancia', 'distancia', 'virtual', 'online'] },
      { value: 'Híbrido', aliases: ['hibrida', 'híbrida', 'hibrido', 'híbrido', 'semipresencial'] },
    ],
  },
  {
    localKey: 'periodInterest',
    zohoField: 'Periodo',
    label: 'Período',
    fieldType: 'single_line',
    isRequired: false,
    sortOrder: 8,
    optionsJson: [],
  },
  {
    localKey: '_fixed_fuente',
    zohoField: 'Fuente_de_aspirante',
    label: 'Fuente de aspirante',
    fieldType: 'single_line',
    isRequired: false,
    sortOrder: 99,
    fixedValue: 'Volt IA Chatbot',
    optionsJson: [],
    description: 'Valor fijo, se envía automáticamente',
  },
  {
    localKey: '_fixed_fecha',
    zohoField: 'Fecha_de_contacto',
    label: 'Fecha de contacto',
    fieldType: 'date',
    isRequired: false,
    sortOrder: 100,
    fixedValue: '__TODAY__',
    optionsJson: [],
    description: 'Fecha actual al momento de sincronizar',
  },
];

async function main() {
  console.log('🌱 Seeding Zoho field configs for IUDI...');

  for (const field of FIELDS) {
    await p.zohoFieldConfig.upsert({
      where: {
        tenantId_localKey: { tenantId: IUDI_TENANT_ID, localKey: field.localKey },
      },
      update: {
        zohoField: field.zohoField,
        label: field.label,
        fieldType: field.fieldType,
        isRequired: field.isRequired,
        sortOrder: field.sortOrder,
        fixedValue: field.fixedValue || null,
        optionsJson: field.optionsJson,
        description: field.description || null,
        isActive: true,
      },
      create: {
        tenantId: IUDI_TENANT_ID,
        localKey: field.localKey,
        zohoField: field.zohoField,
        label: field.label,
        fieldType: field.fieldType,
        isRequired: field.isRequired,
        sortOrder: field.sortOrder,
        fixedValue: field.fixedValue || null,
        optionsJson: field.optionsJson,
        description: field.description || null,
        isActive: true,
      },
    });
    console.log(`  ✅ ${field.label} (${field.localKey} → ${field.zohoField})`);
  }

  console.log('\n🎉 Zoho field configs seeded!');
  await p.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
