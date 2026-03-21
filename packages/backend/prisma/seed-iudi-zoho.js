const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const IUDI_TENANT_ID = 'cmm8mflz3000spc48sc48dcud';

const ZOHO_CONFIG = {
  clientId: '1000.DPNNVMBI65J8P0WJGOMW2U07X8ZMPR',
  clientSecret: '9c181beb09ed88befc34fe847c9ec500cccda964a7',
  refreshToken: '1000.ac65218dd93c73dfd360978a75566622.151b8f61594f39447906e4613b1f68b0',
  moduleApiName: 'Contacts',
  dedupeField: 'Mobile',
  fieldMapping: {
    firstName: 'First_Name',
    lastName: 'Last_Name',
    phone: 'Mobile',
    email: 'Email',
    dni: 'DNI',
    offerInterest: 'Programa',
    modalityInterest: 'Modalidad',
    periodInterest: 'Periodo',
  },
  fixedValues: {
    Fuente_de_aspirante: 'Volt IA Chatbot',
  },
};

const OFFERS = [
  {
    name: 'Curso 1',
    slug: 'curso-1',
    zohoPicklistValue: 'Curso 1',
    synonymsJson: ['curso uno', 'primer curso', 'curso 1'],
    keywordsJson: ['curso', 'uno', '1'],
    description: 'Curso 1 de IUDI',
    sortOrder: 1,
  },
  {
    name: 'Curso 2',
    slug: 'curso-2',
    zohoPicklistValue: 'Curso 2',
    synonymsJson: ['curso dos', 'segundo curso', 'curso 2'],
    keywordsJson: ['curso', 'dos', '2'],
    description: 'Curso 2 de IUDI',
    sortOrder: 2,
  },
  {
    name: 'Curso 3',
    slug: 'curso-3',
    zohoPicklistValue: 'Curso 3',
    synonymsJson: ['curso tres', 'tercer curso', 'curso 3'],
    keywordsJson: ['curso', 'tres', '3'],
    description: 'Curso 3 de IUDI',
    sortOrder: 3,
  },
];

async function main() {
  console.log('🌱 Seeding IUDI Zoho integration...');

  // 1. Upsert Zoho CRM integration
  const existing = await p.integration.findFirst({
    where: { tenantId: IUDI_TENANT_ID, type: 'zoho_crm' },
  });

  if (existing) {
    await p.integration.update({
      where: { id: existing.id },
      data: {
        configEncrypted: JSON.stringify(ZOHO_CONFIG),
        status: 'active',
      },
    });
    console.log('✅ Zoho integration updated');
  } else {
    await p.integration.create({
      data: {
        tenantId: IUDI_TENANT_ID,
        type: 'zoho_crm',
        configEncrypted: JSON.stringify(ZOHO_CONFIG),
        status: 'active',
      },
    });
    console.log('✅ Zoho integration created');
  }

  // 2. Upsert test offers
  for (const offer of OFFERS) {
    await p.tenantOffer.upsert({
      where: {
        tenantId_slug: { tenantId: IUDI_TENANT_ID, slug: offer.slug },
      },
      update: {
        name: offer.name,
        zohoPicklistValue: offer.zohoPicklistValue,
        synonymsJson: offer.synonymsJson,
        keywordsJson: offer.keywordsJson,
        description: offer.description,
        sortOrder: offer.sortOrder,
        isActive: true,
      },
      create: {
        tenantId: IUDI_TENANT_ID,
        name: offer.name,
        slug: offer.slug,
        zohoPicklistValue: offer.zohoPicklistValue,
        synonymsJson: offer.synonymsJson,
        keywordsJson: offer.keywordsJson,
        description: offer.description,
        sortOrder: offer.sortOrder,
        isActive: true,
      },
    });
    console.log(`  ✅ Offer "${offer.name}" upserted`);
  }

  console.log('\n🎉 IUDI Zoho seed completed!');
  await p.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
