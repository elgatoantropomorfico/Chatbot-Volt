# ROADMAP EJECUTABLE — Le Rocher + Pilot Solution CRM + Audio Groq

> Documento de bajada a tierra basado en el código actual de Volt ChatBot (jun 2026).
> Patrón de referencia: **IUDI + Zoho CRM** (ya en producción).

---

## 1. Resumen ejecutivo

### Qué pide el spec (n8n → Volt)
Migrar a Volt el flujo de WhatsApp para **Le rocher - concesionaria formosa**:
- Texto → agente comercial
- Audio → Meta media → Groq Whisper → texto → agente
- Captura progresiva de datos → Lead local → Pilot Solution CRM
- Catálogo Peugeot editable desde panel (sin hardcode)
- Prompt comercial en Prompt Anatomy (sin hardcode en código)
- Panel **Pilot CRM** para campos obligatorios y mapeos

### Qué ya existe en Volt (reutilizable)
| Capacidad | Estado | Referencia |
|-----------|--------|------------|
| Webhook WhatsApp + cola BullMQ | ✅ | `webhook.routes.ts`, `worker.ts` |
| Routing tenant por `phone_number_id` | ✅ | `conversation.service.ts` |
| Lead upsert por `(tenantId, phone)` | ✅ | `Lead` model |
| Prompt Anatomy (`promptBuilderJson`) | ✅ | `bot-settings/page.tsx`, `openai.service.ts` |
| Extracción estructurada post-mensaje | ✅ | `lead-extraction.service.ts` |
| Sync CRM automático + manual | ✅ solo Zoho | `zoho-sync.service.ts`, `leads/page.tsx` |
| Config campos CRM por tenant | ✅ solo Zoho | `ZohoFieldConfig`, `/dashboard/offers` |
| Integración por tenant | ✅ | `Integration` model |
| Imágenes WhatsApp → R2 | ✅ | `whatsapp.service.ts`, worker |
| Audio WhatsApp | ❌ | Se salta en webhook |
| Groq Whisper | ❌ | No existe |
| Pilot CRM | ❌ | No existe |
| Catálogo en Bot > Productos (Prompt Anatomy) | ⚠️ parcial | 4 textareas; ampliar tab existente, no nueva sección |
| Tool `registrar_lead_pilot` | ❌ | Volt no usa function-calling (IUDI tampoco) |
| Tenant Le Rocher en seeds | ❌ | Existe en prod DB (crear vía superadmin) |

### Decisión arquitectónica clave
**No implementar `registrar_lead_pilot` como OpenAI tool** en la primera entrega.

IUDI registra en Zoho con:
1. `LeadExtractionService` (GPT extrae JSON del chat)
2. `LeadProfileService.mergeExtractedData`
3. `ZohoSyncService.syncLeadToZoho` cuando hay campos obligatorios

Replicar ese patrón para Pilot. Funcionalmente cumple el spec; la “tool” queda como **servicio interno** `PilotSyncService.syncLeadToPilot()` invocado por el worker (auto) y por API (manual).

---

## 2. Ajustes del spec vs realidad del código

| Spec | Realidad Volt | Resolución |
|------|---------------|------------|
| Tool `registrar_lead_pilot` | Sin function-calling | `PilotSyncService` + auto-sync al cumplir campos |
| Catálogo en Bot > Productos | Tab Productos = 4 textareas en `promptBuilderJson` | **Ampliar tab existente**: campo `catalog` (textarea grande) + `priceRange` para planes/financiación. Sin `TenantProduct` ni `TenantOffer` |
| `TenantOffer` | Solo picklists Zoho (IUDI) | **No usar** para Le Rocher — catálogo multi-marca vive en Prompt Anatomy > Productos |
| `LeadFieldConfig` para captura | Activa flujo CardioCor/TallerAlfa | **No usar** en Le Rocher (choca con flujo Zoho/Pilot) |
| `ZohoFieldConfig` panel | UI en `/dashboard/offers` | Crear `PilotFieldConfig` + `/dashboard/pilot-crm` |
| Credenciales Pilot en `.env` | Zoho usa `Integration.configEncrypted` | Híbrido: secretos en Railway env + params editables en Integration |
| Memoria Redis `{tenantId}:{phone}` | No existe | Lead DB + últimos N mensajes + `existingLeadData` en prompt |
| `needs_update` sync status | Zoho solo: pending/synced/error | Agregar `needs_update` en enum Pilot |
| Token WhatsApp por canal | Token global `WHATSAPP_ACCESS_TOKEN` | Fase 0: usar env global (como hoy). Fase futura: token por `Channel` |
| `action=create` update Pilot | API oficial solo documenta **create** | Ver sección 2.1 — no hay update documentado |
| Página "Flujo de consulta" | **No existe** hoy | Nueva tab en Bot / IA (Fase 5b) — preview read-only |

---

## 2.1 Pilot Solution API — hallazgos oficiales (F2)

Fuente: [pilotsolution.net/es/como-integrarse](https://www.pilotsolution.net/es/como-integrarse)

| Tema | Detalle |
|------|---------|
| Endpoint | `POST https://api.pilotsolution.net/webhooks/welcome.php` |
| Content-Type | `application/x-www-form-urlencoded` |
| action | **Siempre `create`** (único valor documentado) |
| appkey | Obligatorio — desde env `PILOT_APPKEY` |
| debug | `0` = inserta lead; `1` = prueba sin insertar |
| HTTP | Cualquier status ≠ 200 = error |
| Respuesta OK | `{ success: true, data: { id: 8855, success: true, message: "..." } }` |
| ID externo | Guardar `data.id` en `Lead.pilotContactId` |
| Update | **No documentado** — no inventar `action=update` |
| Duplicados | No hay dedupe en la API — **solo crear si `!pilotContactId`** |
| Sync manual posterior | Si lead ya tiene `pilotContactId`: mostrar en UI "Ya registrado en Pilot (ID: X)". Opcional: segundo create solo si Pilot confirma que dedupea por celular |

**Campos Pilot relevantes para Le Rocher:**

| Parámetro | Uso Le Rocher |
|-----------|---------------|
| pilot_firstname | fname |
| pilot_lastname | lname |
| pilot_cellphone | phone normalizado |
| pilot_contact_type_id | env `PILOT_CONTACT_TYPE_ID` (=1 electrónico) |
| pilot_business_type_id | biz (1=0km, 2=usado) o env default |
| pilot_product_of_interest | modelo/plan detectado |
| pilot_car_brand | opcional — PEUGEOT, CITROËN, JEEP, RAM |
| pilot_car_modelo | opcional — versión específica |
| pilot_notes | resumen + campos includeInNotes |
| pilot_suborigin_id | env `PILOT_SUBORIGIN_ID` |
| pilot_provider_service | env `PILOT_PROVIDER_SERVICE` |
| pilot_product_code | opcional futuro — código lista Pilot (`masters/read.php`) |

**Implementación `pilot-solution.service.ts`:**
```typescript
// POST urlencoded, parse JSON response
// success → return { pilotId: data.data.id }
// fail → throw con message seguro (sin appkey)
```

---

## 2.2 Memoria conversacional — sin Redis

**IUDI hoy no usa Redis.** Usa tres capas:

| Capa | Qué guarda | Dónde |
|------|------------|-------|
| Historial | Últimos N mensajes (default 15) | `Message` + `maxContextMessages` |
| Resumen | Cada ~10 mensajes | `conversation.summary` |
| Persistencia lead | Nombre, email, programa, sync | `Lead` + `LeadExtractionService` post-mensaje |

**Para Le Rocher — misma estrategia (recomendado):**
1. No agregar Redis en v1
2. `Lead` como fuente de verdad (`firstName`, `offerInterest`, `customData.biz`, etc.)
3. Bloque `existingLeadData` inyectado en `buildContext` (como IUDI hace con datos Zoho parcialmente)
4. `LeadExtractionService` actualiza lead cada mensaje
5. Pilot capture prompt generado dinámicamente desde `PilotFieldConfig` (como Zoho)

Redis solo tendría sentido si hubiera latencia alta en DB o sesiones efímeras sin lead — no es el caso.

---

## 2.3 Página "Flujo de consulta" (nueva — Fase 5b)

**Hoy no existe** ninguna vista que muestre cómo está compuesto el flujo. El flujo vive disperso en:
- `openai.service.ts` — bloques hardcodeados PASO 0–6 (Zoho) o generados (LeadFieldConfig)
- `PilotFieldConfig` — orden de campos (futuro)
- `promptBuilderJson` — contexto de negocio
- Worker — extracción + auto-sync

**Propuesta:** nueva tab en **Bot / IA** llamada **"Flujo"** (`/dashboard/bot-settings?tab=flow`)

Vista read-only que muestra:

```
┌─ Contexto del bot ─────────────────────────┐
│ [NEGOCIO] [PERSONALIDAD] [PRODUCTOS] ...   │  ← secciones con contenido
├─ Captura de datos ─────────────────────────┤
│ PASO 0: Responder consulta                 │
│ PASO 1: Confirmar nombre                   │
│ PASO 2: Nombre (Pilot — obligatorio)         │  ← desde PilotFieldConfig
│ PASO 3: Modelo de interés                  │
│ ...                                        │
├─ Sincronización CRM ──────────────────────┤
│ Auto-sync cuando: fname + lname + phone +  │
│ product + notes completos                  │
│ Manual: botón en detalle Lead              │
├─ Audio ────────────────────────────────────┤
│ Audio → Groq Whisper → texto → agente      │  ← solo si Groq configurado
└────────────────────────────────────────────┘
```

**Backend:** `GET /api/bot-settings/flow-preview` — ensambla el mismo prompt que usaría `buildContext` (sin llamar OpenAI) y devuelve JSON estructurado para la UI.

**Beneficio:** el admin de Le Rocher ve qué pasos sigue el bot sin leer código. Cambios en Pilot CRM o Prompt Anatomy se reflejan al recargar.

---

## 3. Credenciales y configuración

### ⚠️ Seguridad (urgente)
Las credenciales fueron compartidas en chat. **Rotar antes de producción:**
- `PILOT_APPKEY` → regenerar en Pilot Solution si es posible
- `GROQ_API_KEY` → revocar y crear nueva en console.groq.com

**Nunca commitear** al repo. Solo en Railway → servicio **Chatbot-Volt** (backend).

### Variables Railway (backend) — nuevas

```env
# Pilot Solution CRM
PILOT_APPKEY=<rotar>
PILOT_API_URL=https://api.pilotsolution.net/webhooks/welcome.php
PILOT_SUBORIGIN_ID=G4XEQHACXU9M8IYV5
PILOT_PROVIDER_SERVICE=Bot WhatsApp LeRocher
PILOT_CONTACT_TYPE_ID=1
PILOT_BUSINESS_TYPE_DEFAULT=1
PILOT_DEBUG=0

# Groq Whisper
GROQ_API_KEY=<rotar>
GROQ_API_BASE=https://api.groq.com/openai/v1
GROQ_WHISPER_MODEL=whisper-large-v3-turbo
GROQ_WHISPER_LANGUAGE=es
```

### Variables ya existentes (verificar en Railway)
```env
WHATSAPP_ACCESS_TOKEN=...      # envío + descarga media
WHATSAPP_API_VERSION=v21.0     # spec dice v18; usar la del env (v21)
OPENAI_API_KEY=...
DATABASE_URL=...
REDIS_URL=...
```

### Credenciales por tenant (DB, no env)
Configurar en superadmin para Le Rocher:
- **Channel WhatsApp**: `phoneNumberId`, `wabaId`, `displayPhone` (ya en modelo `Channel`)
- **Integration** `pilot_crm`: parámetros no secretos editables desde panel
- **BotSettings**: `promptBuilderJson` + `systemPrompt`
- **PilotFieldConfig**: 7 campos iniciales (ver sección 6)
- **Catálogo** en `promptBuilderJson.products.catalog`

### Dónde NO van secretos
- Frontend (`packages/web`)
- Seeds commiteados
- Logs de producción
- Prompt Anatomy / Productos

---

## 4. Modelo de datos propuesto

### 4.1 Nuevos enums
```prisma
enum IntegrationType {
  woocommerce
  zoho_crm
  pilot_crm        // NUEVO
}

enum PilotSyncStatus {
  pending
  synced
  error
  needs_update     // NUEVO vs Zoho
}
```

### 4.2 Lead — columnas Pilot (espejo de Zoho, sin romper IUDI)
```prisma
pilotContactId      String?         @map("pilot_contact_id")
pilotSyncStatus     PilotSyncStatus @default(pending) @map("pilot_sync_status")
pilotLastSyncAt     DateTime?       @map("pilot_last_sync_at")
pilotLastError      String?         @map("pilot_last_error")
pilotSyncHash       String?         @map("pilot_sync_hash")
```

Campos de negocio Le Rocher en columnas existentes + `customData`:
| Concepto | Almacenamiento |
|----------|----------------|
| fname | `firstName` |
| lname | `lastName` |
| phone | `phone` (ya viene de WA) |
| product | `offerInterest` |
| biz | `customData.biz` (1=0km, 2=usado) |
| has_trade_in | `customData.has_trade_in` |
| notes | `customData.pilot_notes` o campo notes en payload |

### 4.3 PilotFieldConfig (espejo ZohoFieldConfig)
```prisma
model PilotFieldConfig {
  id             String   @id @default(cuid())
  tenantId       String
  localKey       String   // fname, lname, phone, product, biz, has_trade_in, notes
  pilotField     String   // pilot_firstname, pilot_cellphone, etc.
  label          String
  fieldType      String   // text, phone, select, boolean, textarea
  isRequired     Boolean  @default(false)
  isActive       Boolean  @default(true)
  sortOrder      Int      @default(0)
  defaultValue   String?
  includeInNotes Boolean  @default(false)
  optionsJson    Json?    // para select (biz: 0km/usado)
  @@unique([tenantId, localKey])
}
```

### 4.4 Catálogo en Prompt Anatomy > Productos (sin tabla nueva)

**Decisión acordada:** no crear `TenantProduct` ni reutilizar `TenantOffer`. El catálogo multi-marca (Peugeot, Citroën, Jeep, RAM, utilitarios, versiones y equipamiento) vive en el **tab Productos** de Bot / IA, que ya compila a `[PRODUCTOS/SERVICIOS]` en `openai.service.ts`.

Ampliar `promptBuilderJson.products`:

```typescript
products: {
  catalog: string;      // NUEVO — textarea grande, catálogo completo editable
  priceRange: string;   // planes de financiación (anticipos, cuotas, 70/30, beneficios)
  description: string;  // opcional — resumen corto
  categories: string;   // opcional — marcas: Peugeot, Citroën, Jeep, RAM
  notes: string;        // beneficios generales, condiciones
}
```

**UI (`bot-settings/page.tsx` tab Productos):**
- Campo principal **"Catálogo de vehículos"** (`catalog`) — textarea alto, monospace opcional
- Campo **"Planes y financiación"** (`priceRange`) — anticipos, cuotas, planes 70/30, tasa 0%
- Ocultar o colapsar campos secundarios si el tenant tiene `pilot_crm` activo
- Hint actualizado: ya no decir "eso va por WooCommerce" para tenants concesionarios

**Backend:** `buildContext` inyecta `catalog` + `priceRange` + `notes` en `[PRODUCTOS/SERVICIOS]`. Sin query extra a DB.

---

## 5. Flujo end-to-end (objetivo)

```
WhatsApp inbound (Le Rocher channel)
  → webhook: aceptar text | audio | image
  → si audio: downloadMedia → groqTranscription → text
  → worker: resolveOrCreate lead/conversation
  → LeadExtractionService (PilotFieldConfig)
  → LeadProfileService.merge + pilotSyncHash
  → si pilot_crm activo Y campos obligatorios OK Y (sin pilotContactId O pending):
       PilotSyncService.syncLeadToPilot()
  → OpenAIService.buildContext:
       - promptBuilderJson (Prompt Anatomy)
       - catálogo desde promptBuilderJson.products.catalog
       - existingLeadData block
       - reglas Pilot (qué pedir según PilotFieldConfig)
  → generateResponse → WhatsApp reply (siempre responde)
```

Manual desde panel Lead:
`POST /api/leads/:id/sync-pilot` → mismo `PilotSyncService`

---

## 6. Configuración inicial Le Rocher (datos, no código)

### 6.1 Tenant
- Nombre: `Le rocher - concesionaria formosa`
- Timezone: `America/Argentina/Buenos_Aires`
- Canal WhatsApp: vincular `phoneNumberId` real de Meta

### 6.2 PilotFieldConfig (seed `seed-le-rocher-pilot.js`)

| localKey | label | required | pilotField | type | default | includeInNotes |
|----------|-------|----------|------------|------|---------|----------------|
| fname | Nombre | sí | pilot_firstname | text | — | no |
| lname | Apellido | sí | pilot_lastname | text | — | no |
| phone | Celular | sí | pilot_cellphone | phone | — | no |
| product | Modelo o plan | sí | pilot_product_of_interest | text | — | sí |
| biz | Tipo operación | sí | pilot_business_type_id | select | 1 | no |
| has_trade_in | Usado para entregar | no | notes | boolean | — | sí |
| notes | Resumen conversación | sí | pilot_notes | textarea | — | no |

Opciones `biz`: `{1: "0km", 2: "Usado"}`

### 6.3 Catálogo inicial (cargar en Bot / IA > Productos)

**Campo `catalog`** — pegar el listado completo multi-marca (Peugeot 208/2008, utilitarios, Citroën, Jeep, RAM con versiones y equipamiento). El texto que proporcionó el cliente es la fuente de verdad inicial.

**Campo `priceRange`** — planes de financiación por modelo (208 EASY, PLUS, 2008 ACTIVE, etc.) con anticipo, cuotas y plan 70/30 u 80/20.

**Campo `notes`** — beneficios generales:
- Tomamos usado llave por llave
- Tasa 0%
- Hasta 84 cuotas

**Campo `categories`** — Peugeot, Citroën, Jeep, RAM, Utilitarios

Al Pilot CRM, el campo `product` / `pilot_product_of_interest` recibe el modelo o versión detectado en conversación (ej. "208 Allure PK T200", "C3 Aircross").

### 6.4 Prompt Anatomy (cargar en panel Bot / IA)
Secciones a completar manualmente en superadmin/tenant admin:

**[PERSONALIDAD]**
- Asistente comercial Le Rocher Peugeot / PeugeotOnline
- Español argentino, claro, breve, una pregunta por vez

**[NEGOCIO]**
- Objetivo: captar interesados en Peugeot, informar con catálogo, registrar en CRM

**[POLÍTICAS]**
- No inventar precios/modelos/planes
- Usar solo catálogo de Productos
- Si modelo no está cargado → derivar a asesor
- No repetir datos ya en Lead
- Nunca quedar en silencio post-registro

**[FAQ] / instrucciones captura**
- Pedir campos según Pilot CRM (el sistema inyecta lista dinámica)
- Saludo: "Hola, soy el asistente de Le Rocher Peugeot. ¿En qué modelo o plan estás interesado?"
- Post-registro: "Perfecto, ya dejé tus datos registrados. Un asesor te va a contactar..."

**NO poner** precios ni modelos hardcodeados en Prompt Anatomy.

---

## 7. Roadmap por fases

### FASE 0 — Preparación (sin código de negocio)
**Objetivo:** tenant listo en prod, credenciales seguras.

- [ ] Rotar `PILOT_APPKEY` y `GROQ_API_KEY`
- [ ] Agregar env vars en Railway backend
- [ ] Confirmar `tenantId` real de Le Rocher en prod (superadmin)
- [ ] Confirmar canal WhatsApp activo y `phoneNumberId`
- [ ] Probar POST manual a `PILOT_API_URL` con curl (validar respuesta success + id)
- [ ] Documentar si Pilot soporta update o solo create

**Entregable:** checklist OK + respuesta API Pilot documentada.

---

### FASE 1 — Fundación DB + env
**Objetivo:** schema listo sin romper IUDI.

**Archivos:**
- `packages/backend/prisma/schema.prisma`
- `packages/backend/src/config/env.ts`
- migración Prisma

**Tareas:**
1. Agregar `pilot_crm` a `IntegrationType`
2. Agregar `PilotSyncStatus` + columnas `pilot*` en `Lead`
3. Crear `PilotFieldConfig`
4. Agregar vars Groq + Pilot a `env.ts` (opcionales, no required global)
6. `npx prisma migrate dev`

**Criterio:** build pasa, IUDI/Zoho sin cambios de comportamiento.

---

### FASE 2 — Servicios backend core
**Objetivo:** Pilot + Groq + audio funcionando aisladamente.

**Archivos nuevos:**
- `packages/backend/src/services/groq-transcription.service.ts`
- `packages/backend/src/services/pilot-solution.service.ts`
- `packages/backend/src/services/pilot-sync.service.ts`

**Archivos a modificar:**
- `packages/backend/src/routes/webhook.routes.ts` — aceptar `audio`
- `packages/backend/src/worker.ts` — rama audio antes de resolve
- `packages/backend/src/services/whatsapp.service.ts` — reutilizar `downloadMedia` para audio

**PilotSolutionService:**
- POST `application/x-www-form-urlencoded` a `PILOT_API_URL`
- Campos: action, appkey, pilot_firstname, pilot_lastname, pilot_cellphone, pilot_contact_type_id, pilot_business_type_id, pilot_notes, pilot_product_of_interest, pilot_provider_service, pilot_suborigin_id, debug
- Normalizar phone: sin espacios/guiones/+
- Log seguro (sin appkey)

**PilotSyncService** (espejo `ZohoSyncService`):
- Cargar `PilotFieldConfig` activos
- Mapear Lead → payload Pilot
- Construir `pilot_notes` con campos `includeInNotes`
- Si `pilotContactId` existe → update (si API lo permite) sino skip create duplicado
- Actualizar `pilotSyncStatus`, `pilotLastSyncAt`, `pilotLastError`, `pilotSyncHash`

**GroqTranscriptionService:**
- multipart a `${GROQ_API_BASE}/audio/transcriptions`
- model + language desde env
- retornar `text`

**Criterio:** test manual audio → texto; test manual sync lead → Pilot.

---

### FASE 3 — Extracción + auto-sync + contexto agente
**Objetivo:** pipeline conversacional completo.

**Archivos:**
- `packages/backend/src/services/lead-extraction.service.ts`
- `packages/backend/src/services/lead-profile.service.ts`
- `packages/backend/src/services/openai.service.ts`
- `packages/backend/src/worker.ts`

**Tareas:**
1. `LeadExtractionService`: rama `pilot_crm` (como rama Zoho, sin `LeadFieldConfig`)
2. `LeadProfileService`:
   - `isReadyForPilot(lead)` según `PilotFieldConfig.isRequired`
   - `calculatePilotSyncHash(lead)`
   - `hasNewDataSinceLastPilotSync(lead)` → marcar `needs_update`
3. Worker: auto-sync Pilot (misma condición que Zoho)
4. `OpenAIService.buildContext`:
   - Inyectar `products.catalog` + `products.priceRange`
   - Bloque `existingLeadData`
   - Instrucciones captura desde `PilotFieldConfig` (no hardcode IUDI-style 6 pasos)
   - **Quitar** flujo Zoho hardcodeado si tenant tiene `pilot_crm` activo

**Criterio:** mensaje WA texto → respuesta comercial usa catálogo; lead se llena; auto-sync al completar campos.

---

### FASE 4 — APIs + Panel Pilot CRM
**Objetivo:** admin configura campos sin código.

**Backend:**
- `packages/backend/src/routes/pilot-field.routes.ts` (CRUD, espejo zoho-field)
- `packages/backend/src/routes/lead.routes.ts` — `POST /:id/sync-pilot`
- `packages/backend/src/routes/integration.routes.ts` — tipo `pilot_crm`
- Registrar en `app.ts`

**Frontend:**
- `packages/web/src/app/dashboard/pilot-crm/page.tsx` (espejo `offers/page.tsx` para Zoho fields)
- `packages/web/src/lib/api.ts` — métodos pilot-fields, products, sync-pilot
- `packages/web/src/app/dashboard/layout.tsx` — nav "Pilot CRM" si integration activa
- `packages/web/src/app/dashboard/integrations/page.tsx` — card Pilot CRM

**Panel Pilot CRM UI:**
- Toggle integración
- CRUD campos (key, label, required, pilotField, type, default, includeInNotes, options)
- Preview campos obligatorios
- **No mostrar** appkey completa (solo "configurada en servidor" o últimos 4 chars)

**Criterio:** admin edita campo obligatorio → bot respeta sin deploy.

---

### FASE 5 — Bot / IA > Productos (catálogo en tab existente)
**Objetivo:** catálogo multi-marca editable sin nueva sección ni tabla DB.

**Archivos:**
- `packages/web/src/app/dashboard/bot-settings/page.tsx` — tab Productos
- `packages/backend/src/services/openai.service.ts` — compilar `products.catalog`

**Tareas:**
1. Agregar campo `catalog` (textarea grande) a `PromptBuilder.products`
2. Renombrar/repriorizar labels: "Catálogo de vehículos", "Planes y financiación"
3. Hint contextual si tenant tiene `pilot_crm` (no mencionar WooCommerce)
4. `buildContext`: inyectar `catalog` completo en `[PRODUCTOS/SERVICIOS]`

**Criterio:** editar catálogo en panel → bot usa texto nuevo sin deploy.

---

### FASE 5b — Tab "Flujo" (preview del flujo de consulta)
**Objetivo:** visibilidad del flujo compuesto sin leer código.

**Archivos:**
- `packages/backend/src/routes/bot-settings.routes.ts` — `GET /flow-preview`
- `packages/web/src/app/dashboard/bot-settings/page.tsx` — tab "Flujo"
- `packages/backend/src/services/openai.service.ts` — extraer `buildFlowPreview(tenantId)` reutilizando lógica de `buildContext`

**Criterio:** admin ve pasos de captura, campos Pilot, condición de sync y secciones de prompt activas.

---

### FASE 6 — Módulo Lead (sync manual + UI)
**Objetivo:** patrón IUDI replicado.

**Archivos:**
- `packages/web/src/app/dashboard/leads/page.tsx`

**Tareas:**
1. Detectar `pilot_crm` activo (como `hasZoho`)
2. Panel campos Pilot desde `PilotFieldConfig`
3. Badge `pilotSyncStatus` (pending/synced/error/needs_update)
4. Botón **"Actualizar en Pilot CRM"**
5. Mostrar `pilotLastError`, `pilotLastSyncAt`
6. Barra progreso campos obligatorios

**Criterio:** operador edita lead → sync manual → Pilot actualizado.

---

### FASE 7 — Seeds + contenido Le Rocher
**Objetivo:** tenant listo para QA prod.

**Archivos:**
- `packages/backend/prisma/seed-le-rocher-pilot.js`
- Documento/script para cargar catálogo en `promptBuilderJson.products`
- Script one-shot o documentación para cargar Prompt Anatomy

**Tareas:**
1. Integration `pilot_crm` para tenant Le Rocher
2. 7 `PilotFieldConfig` iniciales
3. Catálogo completo en `products.catalog` + planes en `products.priceRange`
4. Verificar Prompt Anatomy cargado en DB

**Criterio:** tenant nuevo replica config sin tocar código.

---

### FASE 8 — QA + acceptance criteria
**Checklist del spec:**

| # | Criterio | Fase |
|---|----------|------|
| 1 | Webhook recibe mensajes Le Rocher | 2 |
| 2 | Texto → agente responde | 3 |
| 3 | Audio → Groq → agente | 2+3 |
| 4 | Usa Prompt Anatomy | 3+7 |
| 5 | Sin hardcode contextual | 3+7 |
| 6 | Catálogo en Productos | 5+7 |
| 7 | Panel Pilot CRM en menú | 4 |
| 8 | Campos configurables | 4 |
| 9 | Agente respeta campos Pilot | 3 |
| 10 | Datos en Lead local | 3 |
| 11 | existingLeadData en contexto | 3 |
| 12 | Sync manual desde Lead | 6 |
| 13 | Sync auto al completar campos | 3 |
| 14 | POST urlencoded a Pilot OK | 2 |
| 15 | Respuesta al WA real del cliente | 2+3 |
| 16 | Sin tokens en código | 0+2 |
| 17 | IUDI/Zoho intacto | 1-8 |
| 18 | Errores logueados sin secretos | 2 |
| 19 | Listo para prod | 8 |

---

## 8. Orden de implementación recomendado

```
F0 Preparación
  ↓
F1 Schema + env
  ↓
F2 groq + pilot services + audio webhook
  ↓
F3 extraction + openai context + worker auto-sync
  ↓
F4 APIs + panel Pilot CRM
  ↓
F5 Productos estructurado
  ↓
F6 Lead UI sync manual
  ↓
F7 Seeds Le Rocher
  ↓
F8 QA prod
```

**Estimación relativa:** F1-F3 = núcleo (60%), F4-F6 = panel (30%), F7-F8 = datos + QA (10%).

---

## 9. Riesgos y preguntas abiertas

| Riesgo | Mitigación |
|--------|------------|
| Pilot API solo create, no update | Manual sync = re-create con mismo phone; validar con Pilot |
| Token WA global vs por canal | Usar env actual; si Le Rocher tiene token propio, agregar `Channel.accessToken` en fase futura |
| `LeadFieldConfig` accidental en Le Rocher | No crear; documentar en seed |
| Spec pide tool OpenAI | Servicio interno equivalente; documentar desvío |
| Catálogo cambia seguido | Editable en Bot > Productos > catalog |
| Groq falla en audio | Fallback: "No pude escuchar el audio, ¿podés escribirlo?" |
| Pilot falla en sync | Bot responde mensaje comercial; `pilotSyncStatus=error` |

### Preguntas para validar con Pilot / cliente
1. ¿La API devuelve `id` del lead creado? ¿En qué campo?
2. ¿Existe `action=update` o equivalente?
3. ¿Dedupe por `pilot_cellphone`?
4. ¿Qué significa `success=false` típico?

---

## 10. Archivos clave a tocar (índice)

### Nuevos
```
packages/backend/src/services/groq-transcription.service.ts
packages/backend/src/services/pilot-solution.service.ts
packages/backend/src/services/pilot-sync.service.ts
packages/backend/src/routes/pilot-field.routes.ts
packages/backend/src/routes/bot-settings.routes.ts (flow-preview)
packages/backend/prisma/seed-le-rocher-pilot.js
packages/backend/prisma/seed-le-rocher-products.js
packages/web/src/app/dashboard/pilot-crm/page.tsx
```

### Modificar
```
packages/backend/prisma/schema.prisma
packages/backend/src/config/env.ts
packages/backend/src/routes/webhook.routes.ts
packages/backend/src/worker.ts
packages/backend/src/services/lead-extraction.service.ts
packages/backend/src/services/lead-profile.service.ts
packages/backend/src/services/openai.service.ts
packages/backend/src/routes/lead.routes.ts
packages/backend/src/routes/integration.routes.ts
packages/backend/src/app.ts
packages/web/src/app/dashboard/bot-settings/page.tsx
packages/web/src/app/dashboard/leads/page.tsx
packages/web/src/app/dashboard/layout.tsx
packages/web/src/app/dashboard/integrations/page.tsx
packages/web/src/lib/api.ts
```

### No tocar (mantener IUDI)
```
packages/backend/src/services/zoho.service.ts
packages/backend/src/services/zoho-sync.service.ts
packages/backend/prisma/seed-iudi-zoho.js
packages/backend/prisma/seed-zoho-fields.js
```

---

## 11. Próximo paso sugerido

Empezar por **FASE 0 + FASE 1** en una sola PR pequeña:
1. Migración schema
2. env.ts
3. Test curl Pilot manual documentado

Luego **FASE 2** (audio + servicios) como PR separada testeable.

¿Aprobás este roadmap para arrancar implementación por fases?
