# Especificación maestra — Integración Chatbot Volt + Zoho CRM (multi-tenant)

## Documento dirigido a Opus 4.6

Este documento propone la arquitectura, reglas de negocio, estructuras de datos, flujo conversacional y estrategia de sincronización entre el chatbot Volt y Zoho CRM para un entorno multi-tenant. La idea es respetar al máximo el código actual, aprovechar la arquitectura ya existente y evitar hardcodear reglas específicas de un tenant dentro del core.

---

# 1. Contexto actual

## Estado real del sistema

El sistema ya tiene:

* worker con BullMQ para procesar mensajes entrantes
* resolución de `tenant`, `lead`, `conversation` y `channel`
* persistencia de mensajes
* `bot_settings` multi-tenant
* `systemPrompt` editable por tenant
* `promptBuilderJson` editable por tenant
* `guardrailsJson` editable por tenant
* `handoff` configurable por tenant
* integración WooCommerce por tenant
* servicio OpenAI con armado dinámico del prompt
* resumen de conversación (`generateSummary`)

## Lo que falta hoy

Falta una capa estructurada para:

* extraer datos de lead desde la conversación
* guardar esos datos en la base interna
* decidir cuándo un lead está listo para CRM
* sincronizar create/update con Zoho CRM
* hacerlo de forma multi-tenant y configurable
* manejar catálogo dinámico de ofertas/cursos/carreras sin hardcodeos

---

# 2. Decisión principal de arquitectura

## Regla general

No hardcodear en el core del worker:

* módulos de Zoho
* nombres de campos
* criterios de readiness
* catálogo de ofertas
* sinónimos de ofertas
* valores fijos de picklists
* orden conversacional

Todo eso debe vivir por tenant.

## Dónde debe vivir la configuración

Se propone usar 2 capas:

### A. Configuración por integración (`Integration.configEncrypted`)

Para:

* credenciales Zoho
* módulo API name
* mapeo de campos
* reglas de readiness
* valor fijo de fuente
* dedupe field
* flags de sync

### B. Catálogo de ofertas por tenant

Esto NO debería vivir solo en un JSON encriptado si queremos escalar bien.

Se propone crear una entidad explícita en base de datos para las ofertas académicas por tenant.

---

# 3. Problema clave: ofertas/cursos/carreras dinámicas

## Requisito de negocio

Hoy hay 3 cursos. Mañana puede haber 4, 10 o 30.

El sistema debe permitir:

* agregar nuevas ofertas desde un panel
* editar nombre visible
* activar/desactivar ofertas
* definir sinónimos y keywords
* elegir qué valor exacto se manda al picklist de Zoho
* usar ese catálogo para que el worker haga matching automático
* evitar hardcodear `Curso 1`, `Curso 2`, etc. en el código

## Conclusión

La fuente de verdad para detectar `offerInterest` no debe ser el código, sino un catálogo de ofertas del tenant.

---

# 4. Propuesta de modelo para ofertas

## Nuevo modelo sugerido

```prisma
model TenantOffer {
  id                String   @id @default(cuid())
  tenantId          String   @map("tenant_id")
  name              String
  slug              String
  zohoPicklistValue String   @map("zoho_picklist_value")
  synonymsJson      Json?    @map("synonyms_json")
  keywordsJson      Json?    @map("keywords_json")
  description       String?
  isActive          Boolean  @default(true) @map("is_active")
  sortOrder         Int      @default(0) @map("sort_order")
  createdAt         DateTime @default(now()) @map("created_at")
  updatedAt         DateTime @updatedAt @map("updated_at")

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@unique([tenantId, slug])
  @@index([tenantId, isActive])
  @@map("tenant_offers")
}
```

## Significado de campos

* `name`: nombre visible en el panel, por ejemplo `Tecnicatura en Marketing Digital`
* `slug`: identificador interno estable
* `zohoPicklistValue`: valor exacto que debe enviarse al picklist de Zoho
* `synonymsJson`: sinónimos amplios, ej. `marketing`, `mkt digital`, `tec marketing`
* `keywordsJson`: términos cortos de matching
* `description`: opcional, útil para contexto conversacional
* `isActive`: si está disponible o no
* `sortOrder`: orden visual

---

# 5. Lógica correcta para asignar oferta de interés

## Regla general

El worker no debe adivinar libremente entre miles de textos. Debe resolver `offerInterest` por decantación contra el catálogo activo del tenant.

## Pipeline recomendado

### Paso 1 — detectar intención académica

Si el usuario menciona interés en estudiar, cursar, inscribirse, averiguar por carreras/cursos/materias, activar modo de detección de oferta.

### Paso 2 — tomar texto candidato

Tomar:

* mensaje actual
* 3 a 6 mensajes recientes
* posibles respuestas anteriores del bot

### Paso 3 — matching contra catálogo activo

Para cada oferta activa del tenant:

* comparar contra `name`
* comparar contra `synonymsJson`
* comparar contra `keywordsJson`

### Paso 4 — calcular score

Se propone score híbrido:

* match exacto en nombre: +100
* match exacto en sinónimo: +95
* match parcial fuerte: +70
* match keyword: +50
* fuzzy score / similitud: variable

### Paso 5 — decidir

* si hay una oferta con score muy superior al resto: asignar esa
* si hay empate o baja confianza: no asignar automáticamente y pedir aclaración al usuario
* si la oferta ya estaba definida y el nuevo match es más débil, no sobreescribir

## Regla de seguridad

Nunca asignar oferta por baja confianza solo porque había que completar el campo.

---

# 6. Recomendación importante sobre matching

## No usar solo LLM libre

No conviene hacer:

* “decime cuál de estas ofertas quiso decir el usuario” y aceptar cualquier salida del modelo sin control.

## Mejor estrategia

### A. Matching determinístico primero

* normalización
* exact match
* synonym match
* fuzzy controlled

### B. LLM opcional solo como árbitro

Si hay 2 o 3 candidatos cercanos, se puede usar una llamada barata al modelo para elegir el más probable entre opciones concretas.

Ejemplo:

* opciones: A, B, C
* texto usuario: “quiero averiguar por el curso de marketing”
* el extractor puede devolver `slug` de la mejor opción entre el set dado

Pero siempre con catálogo controlado.

---

# 7. Cómo debe configurarse desde panel

## En el módulo de integración custom del tenant debe poderse

### Gestionar ofertas

* crear oferta
* editar oferta
* activar/desactivar
* definir valor Zoho
* definir sinónimos
* definir keywords
* ordenar visualmente

### Sync opcional con Zoho picklist

Idealmente:

* el panel debería poder validar que `zohoPicklistValue` exista en el picklist `Programa`
* si no existe, mostrar warning

## Opción ideal futura

Poder sincronizar automáticamente la lista de ofertas con el picklist de Zoho.

## MVP razonable

Mantener el catálogo local como fuente principal, y exigir que el usuario cargue un `zohoPicklistValue` válido.

---

# 8. Integración Zoho por tenant

## Tipo de integración confirmado

**Self Client de Zoho** — No OAuth público.

El backend controla las credenciales del cliente IUDI. No hay botón "Conectar Zoho" en el panel porque es una integración custom pre-configurada.

## Enum nuevo

```prisma
enum IntegrationType {
  woocommerce
  zoho_crm
}
```

## Config confirmada para `zoho_crm`

```json
{
  "clientId": "TU_CLIENT_ID",
  "clientSecret": "TU_CLIENT_SECRET",
  "refreshToken": "TU_REFRESH_TOKEN",
  "moduleApiName": "Contacts",
  "dedupeField": "Mobile",
  "fieldMapping": {
    "firstName": "First_Name",
    "lastName": "Last_Name",
    "phone": "Mobile",
    "email": "Email",
    "dni": "DNI",
    "offerInterest": "Programa",
    "modalityInterest": "Modalidad",
    "periodInterest": "Periodo"
  },
  "fixedValues": {
    "Fuente_de_aspirante": "Volt IA Chatbot"
  }
}
```

**Nota:** El campo `Description` fue descartado. La renovación automática del `access_token` se maneja en el servicio usando el `refresh_token`.

---

# 9. Módulo Zoho y campos confirmados

## Módulo destino

Visualmente es `Aspirantes`, técnicamente es:

```text
Contacts
```

## API names confirmados

* `First_Name` ✅
* `Last_Name` ✅
* `Mobile` ✅ (dedupe field)
* `Email` ✅
* `DNI` ✅
* `Programa` ✅ (picklist: "Curso 1", "Curso 2", "Curso 3", etc.)
* `Modalidad` ✅
* `Periodo` ✅
* `Fuente_de_aspirante` ✅ (fixed value: "Volt IA Chatbot")
* `Fecha_de_contacto` ✅

**Nota:** El campo `Description` fue descartado.

---

# 10. Regla de creación y actualización

## Create automático en Zoho cuando haya:

* `phone` (normalizado E.164)
* `firstName`
* `lastName`
* `offerInterest`

**Trigger:** Inmediatamente después de que el lead complete estos 4 campos en la conversación.

## Update manual desde panel:

* Botón **"Actualizar en Zoho"** en la vista de lead
* Solo visible si hay datos nuevos desde la última sync (comparación por hash)
* Muestra error si hubo fallo en la última sync
* Permite actualizar:
  * `modalityInterest`
  * `periodInterest`
  * `email`
  * `dni`
  * `offerInterest` (si cambió)

## Dedupe field

```text
Mobile
```

La búsqueda y dedupe se hace por teléfono normalizado E.164.

---

# 11. Evolución del modelo `Lead`

## Se propone ampliar `Lead` con estos campos

```prisma
enum IntentLevel {
  low
  medium
  high
}

enum ZohoSyncStatus {
  pending
  synced
  error
}
```

```prisma
model Lead {
  id                  String         @id @default(cuid())
  tenantId            String         @map("tenant_id")
  channelId           String?        @map("channel_id")

  phone               String
  phoneRaw            String?        @map("phone_raw")
  phoneE164           String?        @map("phone_e164")
  whatsappProfileName String?        @map("whatsapp_profile_name")

  name                String?
  firstName           String?        @map("first_name")
  lastName            String?        @map("last_name")
  fullName            String?        @map("full_name")

  email               String?
  dni                 String?

  offerInterest       String?        @map("offer_interest")
  modalityInterest    String?        @map("modality_interest")
  periodInterest      String?        @map("period_interest")

  stage               LeadStage      @default(nuevo)
  intentLevel         IntentLevel?   @map("intent_level")
  lastDetectedTopic   String?        @map("last_detected_topic")
  needsHumanFollowup  Boolean        @default(false) @map("needs_human_followup")

  zohoContactId       String?        @map("zoho_contact_id")
  zohoSyncStatus      ZohoSyncStatus @default(pending) @map("zoho_sync_status")
  zohoLastSyncAt      DateTime?      @map("zoho_last_sync_at")
  zohoLastError       String?        @map("zoho_last_error")
  zohoSyncHash        String?        @map("zoho_sync_hash")

  assignedUserId      String?        @map("assigned_user_id")
  lastMessageAt       DateTime?      @map("last_message_at")
  createdAt           DateTime       @default(now()) @map("created_at")
  updatedAt           DateTime       @updatedAt @map("updated_at")

  tenant              Tenant         @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  channel             Channel?       @relation(fields: [channelId], references: [id])
  assignedUser        User?          @relation("AssignedAgent", fields: [assignedUserId], references: [id])
  conversations       Conversation[]
  notes               LeadNote[]
  sales               Sale[]

  @@unique([tenantId, phone])
  @@index([tenantId, phoneE164])
  @@index([tenantId, zohoContactId])
  @@map("leads")
}
```

---

# 12. Nueva capa de servicios

## A. `LeadExtractionService`

Responsable de:

* leer mensaje actual
* leer mensajes recientes
* leer `profileName`
* leer `Lead` actual
* extraer campos estructurados

### Output sugerido

```ts
export type ExtractedLeadData = {
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  email?: string | null;
  dni?: string | null;
  offerInterest?: string | null;
  modalityInterest?: string | null;
  periodInterest?: string | null;
  intentLevel?: 'low' | 'medium' | 'high' | null;
  lastDetectedTopic?: string | null;
};
```

## B. `LeadProfileService`

Responsable de:

* mergear datos nuevos sobre `Lead`
* no sobreescribir datos buenos con datos débiles
* calcular `readyForZoho`

## C. `ZohoSyncService`

Responsable de:

* leer config `zoho_crm` del tenant
* buscar contacto por `Mobile`
* create/update en Zoho
* persistir `zohoAspiranteId`
* manejar errores

## D. `OfferMatchingService`

Responsable de:

* cargar catálogo activo del tenant
* normalizar textos
* hacer scoring de coincidencia
* devolver la oferta más probable con confidence score

---

# 13. Inserción en el worker actual

## Punto exacto recomendado

Después de:

```ts
const { conversation, channel, tenant, lead } = resolved;
```

## Nuevo bloque sugerido

```ts
let enrichedLead = lead;

try {
  const extracted = await LeadExtractionService.extract({
    tenantId: tenant.id,
    conversationId: conversation.id,
    lead,
    latestMessage: data.text,
    profileName: data.profileName,
  });

  enrichedLead = await LeadProfileService.mergeExtractedData(lead.id, extracted);

  if (enrichedLead.readyForZoho) {
    await ZohoSyncService.syncLeadToZoho(enrichedLead.id, tenant.id);
  }
} catch (err) {
  console.error('⚠️ Lead extraction/sync error (non-fatal):', err);
}
```

## Resumen final del pipeline del worker

1. resolveOrCreate
2. handoff
3. WooCommerce
4. extracción de lead
5. merge de lead
6. readiness
7. sync Zoho
8. respuesta IA
9. envío WhatsApp
10. save outgoing
11. summary
12. opcionalmente update de `Description` si cambió el summary

---

# 14. Regla de readiness

## Criterio confirmado

Un lead queda listo para Zoho cuando tiene:

* móvil
* nombre
* apellido
* oferta de interés

## Función sugerida

```ts
const isReadyForZoho =
  !!lead.phone &&
  !!lead.firstName &&
  !!lead.lastName &&
  !!lead.offerInterest;
```

---

# 15. Flujo conversacional óptimo — Comportamiento PROACTIVO

## Principios confirmados

* **Proactivo:** el bot debe detectar si el usuario es "interesado real" vs "consultante casual"
* No hacer interrogatorio duro
* No pedir todos los datos juntos
* Primero detectar interés académico
* Después identificar al usuario
* Luego enriquecer gradualmente
* Nunca mencionar CRM ni procesos internos

## Clasificación de usuarios

### Interesado real
Menciona interés en:
- Estudiar, cursar, inscribirse
- Averiguar fechas de inicio, costos, modalidades
- Solicitar información para tomar decisión
- Consultar requisitos de ingreso

**Acción:** Capturar datos básicos de forma natural.

### Consultante casual
Solo pregunta:
- Información general
- Horarios de atención
- Ubicación física
- Preguntas genéricas sin intención de inscripción

**Acción:** Responder sin presionar por datos personales.

## Secuencia sugerida para interesados reales

### Paso 1 — detectar oferta

> ¿Qué curso o carrera te interesa?

### Paso 2 — detectar período (opcional, si surge naturalmente)

> ¿Lo estás evaluando para este año o para el próximo?

### Paso 3 — pedir identificación (CRÍTICO)

> Perfecto. ¿Me decís tu nombre y apellido así dejo registrada la consulta?

### ✅ SYNC AUTOMÁTICO A ZOHO

Si ya hay:
* teléfono del canal (siempre presente en WhatsApp)
* nombre
* apellido
* oferta

=> **Sync automático e inmediato a Zoho.**

### Paso 4 — enriquecer modalidad (gradual)

> ¿Preferís modalidad presencial, a distancia o híbrida?

### Paso 5 — enriquecer mail (gradual)

> Si querés, también te puedo dejar asociado un correo para enviarte la info.

### Paso 6 — enriquecer DNI (gradual)

> Y si querés agilizar el seguimiento, también puedo registrar tu DNI.

**Nota:** Los pasos 4, 5 y 6 se actualizan **manualmente** desde el panel con el botón "Actualizar en Zoho".

---

# 16. Ajuste de prompt operativo

Para tenants con captura de leads habilitada, se propone inyectar una regla adicional al prompt.

## Bloque confirmado para inyección

```text
📋 CAPTURA DE LEADS — INSTRUCCIONES IMPORTANTES:

Tu objetivo secundario es identificar si el usuario es un "interesado real" o solo un "consultante casual".

**Interesado real:** menciona interés en estudiar, cursar, inscribirse, averiguar fechas de inicio, costos, modalidades, requisitos de ingreso.
**Consultante casual:** solo pregunta información general, horarios de atención, ubicación, preguntas genéricas sin intención de inscripción.

Si detectás interés real:
1. Primero preguntá qué curso/carrera le interesa (de forma natural, no como formulario).
2. Si ya expresó interés en una oferta, pedí nombre y apellido para "dejar registrada la consulta".
3. No pidas todos los datos juntos. Avanzá gradualmente.
4. Una vez identificado (nombre + apellido + oferta), seguí ayudando normalmente.
5. Completá modalidad, período, correo o DNI solo si surge naturalmente en la conversación.
6. NUNCA menciones CRM, sincronización ni procesos internos.

Sé conversacional, no interrogador. Si el usuario es solo consultante casual, respondé sin presionar por datos personales.
```

---

# 17. Manejo del nombre que llega por WhatsApp

## Regla

`profileName` debe guardarse siempre en:

* `whatsappProfileName`

Puede usarse como pista, pero no como verdad absoluta.

## Recomendación

Si no hay `firstName`/`lastName` confirmados:

* intentar parsearlo
* pero priorizar confirmación natural del usuario

Ejemplo:

> Veo que figurás como Ignacio Prado, ¿ese es tu nombre completo?

---

# 18. Payload de create a Zoho

## Mínimo

```json
{
  "data": [
    {
      "First_Name": "Ignacio",
      "Last_Name": "Prado",
      "Mobile": "5493794789169",
      "Programa": "Curso 1",
      "Fuente_de_aspirante": "Volt IA Chatbot",
      "Fecha_de_contacto": "2026-03-20"
    }
  ]
}
```

## Enriquecido

```json
{
  "data": [
    {
      "First_Name": "Ignacio",
      "Last_Name": "Prado",
      "Mobile": "5493794789169",
      "Email": "ignacio@email.com",
      "DNI": "39196909",
      "Programa": "Curso 1",
      "Modalidad": "A distancia",
      "Periodo": "2026",
      "Description": "Interesado en cursar. Pidió información sobre modalidad y fechas.",
      "Fuente_de_aspirante": "Volt IA Chatbot",
      "Fecha_de_contacto": "2026-03-20"
    }
  ]
}
```

---

# 19. Payload de update a Zoho

```json
{
  "data": [
    {
      "id": "ZOHO_CONTACT_ID",
      "Modalidad": "Presencial",
      "Periodo": "2026",
      "Email": "nuevo@email.com",
      "DNI": "39196909",
      "Description": "Actualización desde chatbot: el usuario confirmó modalidad presencial y dejó correo."
    }
  ]
}
```

---

# 20. Qué debe ser configurable por tenant

## Sí configurable

* si la integración Zoho está activa
* módulo Zoho
* field mapping
* fixed values
* dedupe field
* catálogo de ofertas
* sinónimos de cada oferta
* criterios de readiness
* orden conversacional de captura
* prompts y personalidad

## No configurable en tenant

* estructura técnica del worker
* persistencia de mensajes
* normalización base de teléfono
* retry framework
* outbox / logging base
* arquitectura core de sync

---

# 21. Fases de implementación sugeridas

## Fase 1 — fundación

* ampliar Prisma `Lead`
* agregar `IntegrationType.zoho_crm`
* crear `TenantOffer`
* crear UI básica de catálogo de ofertas
* crear `LeadExtractionService`
* crear `LeadProfileService`
* crear `OfferMatchingService`
* crear `ZohoSyncService`
* insertar lógica en worker

## Fase 2 — robustez

* panel de integración Zoho por tenant
* validación de valores picklist
* logs de sync por lead
* retries controlados
* actualización de `Description` por summary

## Fase 3 — expansión comercial

* creación automática de `Programas`
* asignación de asesor
* scoring
* tareas automáticas
* enriquecimiento de lead desde más canales

---

# 22. Recomendación final para Opus 4.6

## Prioridades de implementación

1. No hardcodear ofertas ni picklists en código.
2. Hacer catálogo de ofertas por tenant como entidad explícita.
3. Usar ese catálogo para matching y extracción.
4. Mantener la sync Zoho aislada en un servicio.
5. Mantener multi-tenant real: integración y captura configurables por tenant.
6. No mezclar demasiado la lógica de respuesta IA con la lógica de extracción estructurada.
7. Mantener el worker resiliente: errores de sync o extracción no deben romper el procesamiento del mensaje.

## Filosofía

El chatbot debe seguir siendo conversacional y útil, pero con una segunda capa silenciosa que convierta conversaciones en leads calificados y sincronizados al CRM sin ensuciar el core.

---

# 23. Resumen ejecutivo

## Regla base del negocio

Un lead entra a Zoho cuando ya es contactable y real.

En este proyecto eso significa:

* WhatsApp ya da el móvil
* si conseguimos nombre + apellido + oferta de interés
* el lead ya es válido para CRM

Todo lo demás se enriquece después.

## Regla base técnica

La oferta no debe depender de strings hardcodeados en el worker.
Debe depender del catálogo activo del tenant, configurable desde panel, con matching robusto y salida controlada hacia el picklist de Zoho.

---

Fin del documento.
