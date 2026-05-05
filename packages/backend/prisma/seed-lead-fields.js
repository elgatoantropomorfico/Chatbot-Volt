const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // ========================================
  // CARDIO COR — Centro de Cardiología
  // ========================================
  const cardioCor = await prisma.tenant.findFirst({ where: { name: { contains: 'cardio', mode: 'insensitive' } } });
  if (!cardioCor) {
    console.error('❌ Tenant CardioCor not found');
  } else {
    console.log(`✅ Found tenant: ${cardioCor.name} (${cardioCor.id})`);

    const cardioFields = [
      {
        tenantId: cardioCor.id,
        fieldKey: 'dni',
        label: 'DNI',
        fieldType: 'text',
        step: 1,
        isRequired: true,
        sortOrder: 1,
        promptHint: 'Pedí el número de documento (DNI) para registrar al paciente',
      },
      {
        tenantId: cardioCor.id,
        fieldKey: 'obraSocial',
        label: 'Obra Social',
        fieldType: 'text',
        step: 1,
        isRequired: true,
        sortOrder: 2,
        promptHint: 'Preguntá cuál es su obra social o prepaga',
      },
      {
        tenantId: cardioCor.id,
        fieldKey: 'preferredDoctor',
        label: 'Médico de preferencia',
        fieldType: 'text',
        step: 2,
        isRequired: false,
        sortOrder: 1,
        promptHint: 'Preguntá si tiene algún médico de preferencia del staff. Si no tiene, está bien',
      },
      {
        tenantId: cardioCor.id,
        fieldKey: 'preferredSchedule',
        label: 'Horario de preferencia',
        fieldType: 'picklist',
        step: 2,
        isRequired: false,
        sortOrder: 2,
        optionsJson: [
          { value: 'Mañana', aliases: ['mañana', 'a la mañana', 'temprano'] },
          { value: 'Tarde', aliases: ['tarde', 'a la tarde', 'después del mediodía'] },
        ],
        promptHint: 'Preguntá en qué franja horaria prefiere su turno, basándote en los horarios de las sucursales descriptos en la info del negocio',
      },
      {
        tenantId: cardioCor.id,
        fieldKey: 'medicalRequest',
        label: 'Solicitud médica',
        fieldType: 'photo',
        step: 3,
        isRequired: true,
        sortOrder: 1,
        promptHint: 'Pedile que envíe una foto de la solicitud/orden del médico de cabecera para poder procesar su turno',
      },
    ];

    for (const field of cardioFields) {
      await prisma.leadFieldConfig.upsert({
        where: { tenantId_fieldKey: { tenantId: field.tenantId, fieldKey: field.fieldKey } },
        update: field,
        create: field,
      });
      console.log(`  ✓ ${field.fieldKey} (step ${field.step})`);
    }
    console.log(`✅ CardioCor: ${cardioFields.length} field configs seeded`);
  }

  // ========================================
  // TALLER ALFA — Chapa y Pintura
  // ========================================
  const tallerAlfa = await prisma.tenant.findFirst({ where: { name: { contains: 'alfa', mode: 'insensitive' } } });
  if (!tallerAlfa) {
    console.error('❌ Tenant Taller Alfa not found');
  } else {
    console.log(`✅ Found tenant: ${tallerAlfa.name} (${tallerAlfa.id})`);

    const tallerFields = [
      {
        tenantId: tallerAlfa.id,
        fieldKey: 'dni',
        label: 'DNI',
        fieldType: 'text',
        step: 1,
        isRequired: true,
        sortOrder: 1,
        promptHint: 'Pedí el número de documento (DNI) del cliente',
      },
      {
        tenantId: tallerAlfa.id,
        fieldKey: 'problemDescription',
        label: 'Descripción del problema',
        fieldType: 'text',
        step: 2,
        isRequired: true,
        sortOrder: 1,
        promptHint: 'Preguntá qué problema específico de chapa y pintura tiene el vehículo. Necesitamos detalle para armar un presupuesto',
      },
      {
        tenantId: tallerAlfa.id,
        fieldKey: 'damagePhotos',
        label: 'Fotos de la zona afectada',
        fieldType: 'multi_photo',
        step: 3,
        isRequired: true,
        sortOrder: 1,
        optionsJson: { maxPhotos: 3 },
        promptHint: 'Pedile que suba hasta 3 fotos de la zona afectada del vehículo. Las fotos deben mostrar claramente el daño para poder armar un presupuesto efectivo',
      },
    ];

    for (const field of tallerFields) {
      await prisma.leadFieldConfig.upsert({
        where: { tenantId_fieldKey: { tenantId: field.tenantId, fieldKey: field.fieldKey } },
        update: field,
        create: field,
      });
      console.log(`  ✓ ${field.fieldKey} (step ${field.step})`);
    }
    console.log(`✅ Taller Alfa: ${tallerFields.length} field configs seeded`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
