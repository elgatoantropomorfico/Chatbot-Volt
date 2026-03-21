# ROADMAP EJECUTABLE — Integración Zoho CRM para IUDI

## Contexto final confirmado

### Tipo de integración
- **Self Client de Zoho** (no OAuth público)
- Backend controla las credenciales del cliente IUDI
- Renovación automática de `access_token` usando `refresh_token`
- No hay botón "Conectar Zoho" en el panel (integración custom pre-configurada)

### Campos Zoho confirmados (módulo Contacts = "Aspirantes")
- `First_Name` ✅
- `Last_Name` ✅
- `Mobile` ✅ (dedupe field)
- `Email` ✅
- `DNI` ✅
- `Programa` ✅ (picklist: "Curso 1", "Curso 2", "Curso 3", etc.)
- `Modalidad` ✅
- `Periodo` ✅
- `Fuente_de_aspirante` ✅ (fixed value: "Volt IA Chatbot")
- `Fecha_de_contacto` ✅
- ~~`Description`~~ ❌ (descartado)

### Catálogo de ofertas
- IUDI está desarrollando las ofertas
- Los valores del picklist Zoho son: "Curso 1", "Curso 2", "Curso 3", etc.
- El sistema debe permitir cargar desde panel:
  - Nombre visible de la oferta
  - Valor exacto del picklist Zoho
  - Sinónimos y keywords para matching

### Comportamiento conversacional
- **Proactivo**: el bot debe detectar si el usuario es "interesado" vs "consultante casual"
- Si detecta interés real, debe pedir datos básicos (nombre, apellido, oferta)
- Debe ser natural, no interrogatorio

### Sync strategy
- **Create**: cuando hay phone + firstName + lastName + offerInterest
- **Update manual**: botón "Actualizar en Zoho" en el panel de lead
  - Solo visible si hay datos nuevos desde la última sync
  - Muestra error si hubo fallo en la última sync
- Dedupe por `Mobile` (teléfono normalizado E.164)

### Modelo Lead
- Ampliar solo para tenants con integración Zoho activa
- Otros tenants mantienen estructura básica
- Campos específicos por tipo de integración

---

## FASE 1 — Fundación (Backend + DB)

### 1.1 — Ampliar Prisma Schema

**Archivo:** `packages/backend/prisma/schema.prisma`

#### A. Nuevos enums
```prisma
enum IntegrationType {
  woocommerce
  zoho_crm  // ← NUEVO
}

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

#### B. Ampliar modelo Lead
```prisma
model Lead {
  id                  String         @id @default(cuid())
  tenantId            String         @map("tenant_id")
  channelId           String?        @map("channel_id")

  // Teléfono (ya existe)
  phone               String
  phoneRaw            String?        @map("phone_raw")
  phoneE164           String?        @map("phone_e164")
  whatsappProfileName String?        @map("whatsapp_profile_name")

  // Nombre (ampliar)
  name                String?
  firstName           String?        @map("first_name")
  lastName            String?        @map("last_name")
  fullName            String?        @map("full_name")

  // Datos de contacto
  email               String?
  dni                 String?

  // Intereses académicos (IUDI)
  offerInterest       String?        @map("offer_interest")
  modalityInterest    String?        @map("modality_interest")
  periodInterest      String?        @map("period_interest")

  // Clasificación
  stage               LeadStage      @default(nuevo)
  intentLevel         IntentLevel?   @map("intent_level")
  lastDetectedTopic   String?        @map("last_detected_topic")
  needsHumanFollowup  Boolean        @default(false) @map("needs_human_followup")

  // Zoho sync
  zohoContactId       String?        @map("zoho_contact_id")
  zohoSyncStatus      ZohoSyncStatus @default(pending) @map("zoho_sync_status")
  zohoLastSyncAt      DateTime?      @map("zoho_last_sync_at")
  zohoLastError       String?        @map("zoho_last_error")
  zohoSyncHash        String?        @map("zoho_sync_hash")  // hash de datos para detectar cambios

  // Metadata (ya existe)
  assignedUserId      String?        @map("assigned_user_id")
  lastMessageAt       DateTime?      @map("last_message_at")
  createdAt           DateTime       @default(now()) @map("created_at")
  updatedAt           DateTime       @updatedAt @map("updated_at")

  // Relaciones (ya existen)
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

#### C. Nuevo modelo TenantOffer
```prisma
model TenantOffer {
  id                String   @id @default(cuid())
  tenantId          String   @map("tenant_id")
  name              String   // "Tecnicatura en Marketing Digital"
  slug              String   // "tec-marketing-digital"
  zohoPicklistValue String   @map("zoho_picklist_value")  // "Curso 1"
  synonymsJson      Json?    @map("synonyms_json")  // ["marketing", "mkt digital", "tec marketing"]
  keywordsJson      Json?    @map("keywords_json")  // ["marketing", "digital", "tecnicatura"]
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

#### D. Actualizar modelo Tenant
```prisma
model Tenant {
  // ... campos existentes ...
  offers        TenantOffer[]  // ← NUEVO
}
```

**Comandos:**
```bash
npx prisma migrate dev --name add_zoho_integration
npx prisma generate
```

---

### 1.2 — Servicio Zoho CRM

**Archivo:** `packages/backend/src/services/zoho.service.ts`

```typescript
import axios from 'axios';
import { prisma } from '../config/database';

interface ZohoConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  accountsUrl?: string;  // default: https://accounts.zoho.com
  apiUrl?: string;       // default: https://www.zohoapis.com
  moduleApiName: string; // "Contacts"
  dedupeField: string;   // "Mobile"
  fieldMapping: Record<string, string>;
  fixedValues?: Record<string, string>;
}

interface ZohoTokens {
  accessToken: string;
  expiresAt: number;  // timestamp
}

export class ZohoService {
  private config: ZohoConfig;
  private tokens: ZohoTokens | null = null;

  constructor(config: ZohoConfig) {
    this.config = {
      accountsUrl: 'https://accounts.zoho.com',
      apiUrl: 'https://www.zohoapis.com',
      ...config,
    };
  }

  /**
   * Obtiene access token válido (renueva si está vencido)
   */
  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    
    // Si tenemos token válido, usarlo
    if (this.tokens && this.tokens.expiresAt > now + 60000) {
      return this.tokens.accessToken;
    }

    // Renovar token
    console.log('🔄 Renovando Zoho access token...');
    const response = await axios.post(
      `${this.config.accountsUrl}/oauth/v2/token`,
      null,
      {
        params: {
          refresh_token: this.config.refreshToken,
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          grant_type: 'refresh_token',
        },
      }
    );

    this.tokens = {
      accessToken: response.data.access_token,
      expiresAt: now + (response.data.expires_in * 1000),
    };

    console.log('✅ Zoho access token renovado');
    return this.tokens.accessToken;
  }

  /**
   * Busca contacto por campo dedupe (Mobile)
   */
  async searchContact(phoneE164: string): Promise<any | null> {
    const accessToken = await this.getAccessToken();
    const searchField = this.config.dedupeField;

    try {
      const response = await axios.get(
        `${this.config.apiUrl}/crm/v2/${this.config.moduleApiName}/search`,
        {
          headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
          params: {
            criteria: `(${searchField}:equals:${phoneE164})`,
          },
        }
      );

      if (response.data.data && response.data.data.length > 0) {
        return response.data.data[0];
      }
      return null;
    } catch (err: any) {
      if (err.response?.status === 404 || err.response?.data?.code === 'NO_DATA') {
        return null;
      }
      throw err;
    }
  }

  /**
   * Crea contacto en Zoho
   */
  async createContact(leadData: Record<string, any>): Promise<string> {
    const accessToken = await this.getAccessToken();
    const payload = this.buildPayload(leadData);

    const response = await axios.post(
      `${this.config.apiUrl}/crm/v2/${this.config.moduleApiName}`,
      { data: [payload] },
      {
        headers: {
          Authorization: `Zoho-oauthtoken ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.data.data && response.data.data[0].code === 'SUCCESS') {
      return response.data.data[0].details.id;
    }

    throw new Error(`Zoho create failed: ${JSON.stringify(response.data)}`);
  }

  /**
   * Actualiza contacto en Zoho
   */
  async updateContact(zohoContactId: string, leadData: Record<string, any>): Promise<void> {
    const accessToken = await this.getAccessToken();
    const payload = this.buildPayload(leadData);

    const response = await axios.put(
      `${this.config.apiUrl}/crm/v2/${this.config.moduleApiName}/${zohoContactId}`,
      { data: [payload] },
      {
        headers: {
          Authorization: `Zoho-oauthtoken ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.data.data && response.data.data[0].code === 'SUCCESS') {
      return;
    }

    throw new Error(`Zoho update failed: ${JSON.stringify(response.data)}`);
  }

  /**
   * Construye payload para Zoho según field mapping
   */
  private buildPayload(leadData: Record<string, any>): Record<string, any> {
    const payload: Record<string, any> = {};

    // Mapear campos
    for (const [localField, zohoField] of Object.entries(this.config.fieldMapping)) {
      if (leadData[localField] !== undefined && leadData[localField] !== null) {
        payload[zohoField] = leadData[localField];
      }
    }

    // Agregar valores fijos
    if (this.config.fixedValues) {
      Object.assign(payload, this.config.fixedValues);
    }

    // Agregar fecha de contacto si no existe
    if (!payload.Fecha_de_contacto) {
      payload.Fecha_de_contacto = new Date().toISOString().split('T')[0];
    }

    return payload;
  }
}
```

---

### 1.3 — Servicio de extracción de Lead

**Archivo:** `packages/backend/src/services/lead-extraction.service.ts`

```typescript
import { OpenAIService } from './openai.service';
import { prisma } from '../config/database';

export interface ExtractedLeadData {
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  email?: string | null;
  dni?: string | null;
  offerInterest?: string | null;
  modalityInterest?: string | null;
  periodInterest?: string | null;
  intentLevel?: 'low' | 'medium' | 'high' | null;
}

export class LeadExtractionService {
  /**
   * Extrae datos estructurados del lead desde la conversación
   */
  static async extract(params: {
    tenantId: string;
    conversationId: string;
    leadId: string;
    latestMessage: string;
    profileName: string | null;
  }): Promise<ExtractedLeadData> {
    const { tenantId, conversationId, latestMessage, profileName } = params;

    // Cargar últimos 6 mensajes de la conversación
    const messages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: 6,
    });

    const conversationText = messages
      .reverse()
      .map((m) => `${m.direction === 'in' ? 'Usuario' : 'Bot'}: ${m.text}`)
      .join('\n');

    // Cargar catálogo de ofertas activas del tenant
    const offers = await prisma.tenantOffer.findMany({
      where: { tenantId, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });

    const offersCatalog = offers.map((o) => ({
      name: o.name,
      slug: o.slug,
      zohoValue: o.zohoPicklistValue,
      synonyms: (o.synonymsJson as string[]) || [],
      keywords: (o.keywordsJson as string[]) || [],
    }));

    // Prompt de extracción
    const extractionPrompt = `Eres un extractor de datos estructurados de conversaciones de WhatsApp.

Conversación:
${conversationText}

Nombre de perfil WhatsApp: ${profileName || 'no disponible'}

Catálogo de ofertas académicas:
${offersCatalog.map((o, i) => `${i + 1}. ${o.name} (valor Zoho: "${o.zohoValue}")\n   Sinónimos: ${o.synonyms.join(', ')}`).join('\n')}

Extrae la siguiente información si está presente en la conversación:
- firstName: nombre del usuario
- lastName: apellido del usuario
- email: correo electrónico
- dni: documento de identidad
- offerInterest: slug de la oferta que le interesa (debe coincidir con el catálogo)
- modalityInterest: modalidad (presencial, a distancia, híbrida, etc.)
- periodInterest: período (2026, 2027, etc.)
- intentLevel: nivel de intención (low, medium, high)

Responde SOLO con un JSON válido. Si un campo no está presente, usa null.

Ejemplo:
{
  "firstName": "Ignacio",
  "lastName": "Prado",
  "email": null,
  "dni": null,
  "offerInterest": "tec-marketing-digital",
  "modalityInterest": "a distancia",
  "periodInterest": "2026",
  "intentLevel": "high"
}`;

    try {
      const response = await OpenAIService.generateResponse(
        [{ role: 'system', content: extractionPrompt }],
        latestMessage
      );

      const extracted = JSON.parse(response);
      return extracted as ExtractedLeadData;
    } catch (err) {
      console.error('⚠️ Error en extracción de lead:', err);
      return {};
    }
  }
}
```

---

### 1.4 — Servicio de merge de Lead

**Archivo:** `packages/backend/src/services/lead-profile.service.ts`

```typescript
import { prisma } from '../config/database';
import { ExtractedLeadData } from './lead-extraction.service';
import crypto from 'crypto';

export class LeadProfileService {
  /**
   * Mergea datos extraídos sobre el lead existente
   * Regla: no sobreescribir datos buenos con datos débiles
   */
  static async mergeExtractedData(leadId: string, extracted: ExtractedLeadData) {
    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) throw new Error('Lead not found');

    const updates: any = {};

    // Nombre: solo actualizar si no existe o si el nuevo es más completo
    if (extracted.firstName && !lead.firstName) {
      updates.firstName = extracted.firstName;
    }
    if (extracted.lastName && !lead.lastName) {
      updates.lastName = extracted.lastName;
    }
    if (extracted.fullName && !lead.fullName) {
      updates.fullName = extracted.fullName;
    }

    // Email: solo actualizar si no existe
    if (extracted.email && !lead.email) {
      updates.email = extracted.email;
    }

    // DNI: solo actualizar si no existe
    if (extracted.dni && !lead.dni) {
      updates.dni = extracted.dni;
    }

    // Oferta: actualizar siempre si viene nueva
    if (extracted.offerInterest) {
      updates.offerInterest = extracted.offerInterest;
    }

    // Modalidad: actualizar siempre si viene nueva
    if (extracted.modalityInterest) {
      updates.modalityInterest = extracted.modalityInterest;
    }

    // Período: actualizar siempre si viene nueva
    if (extracted.periodInterest) {
      updates.periodInterest = extracted.periodInterest;
    }

    // Intent level: actualizar siempre
    if (extracted.intentLevel) {
      updates.intentLevel = extracted.intentLevel;
    }

    // Calcular si está listo para Zoho
    const readyForZoho = this.checkReadiness({
      ...lead,
      ...updates,
    });

    // Calcular hash de datos para detectar cambios
    const syncHash = this.calculateSyncHash({
      ...lead,
      ...updates,
    });

    updates.zohoSyncHash = syncHash;

    // Si no hay cambios, no actualizar
    if (Object.keys(updates).length === 0) {
      return lead;
    }

    // Actualizar lead
    const updatedLead = await prisma.lead.update({
      where: { id: leadId },
      data: updates,
    });

    return updatedLead;
  }

  /**
   * Verifica si el lead está listo para sincronizar a Zoho
   */
  private static checkReadiness(lead: any): boolean {
    return !!(
      lead.phone &&
      lead.firstName &&
      lead.lastName &&
      lead.offerInterest
    );
  }

  /**
   * Calcula hash de datos relevantes para detectar cambios
   */
  private static calculateSyncHash(lead: any): string {
    const relevantData = {
      firstName: lead.firstName,
      lastName: lead.lastName,
      email: lead.email,
      dni: lead.dni,
      offerInterest: lead.offerInterest,
      modalityInterest: lead.modalityInterest,
      periodInterest: lead.periodInterest,
    };

    return crypto
      .createHash('md5')
      .update(JSON.stringify(relevantData))
      .digest('hex');
  }
}
```

---

### 1.5 — Servicio de sync a Zoho

**Archivo:** `packages/backend/src/services/zoho-sync.service.ts`

```typescript
import { prisma } from '../config/database';
import { ZohoService } from './zoho.service';

export class ZohoSyncService {
  /**
   * Sincroniza lead a Zoho (create o update según corresponda)
   */
  static async syncLeadToZoho(leadId: string, tenantId: string): Promise<void> {
    // Cargar lead
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: { tenant: true },
    });

    if (!lead) throw new Error('Lead not found');

    // Verificar que el lead esté listo
    const isReady = !!(
      lead.phone &&
      lead.firstName &&
      lead.lastName &&
      lead.offerInterest
    );

    if (!isReady) {
      console.log(`⏸️ Lead ${leadId} no está listo para Zoho`);
      return;
    }

    // Cargar integración Zoho del tenant
    const integration = await prisma.integration.findUnique({
      where: {
        tenantId_type: {
          tenantId,
          type: 'zoho_crm',
        },
      },
    });

    if (!integration || integration.status !== 'active') {
      console.log(`⏸️ Integración Zoho no activa para tenant ${tenantId}`);
      return;
    }

    const config = JSON.parse(integration.configEncrypted);
    const zohoService = new ZohoService(config);

    try {
      // Normalizar teléfono a E.164
      const phoneE164 = lead.phoneE164 || lead.phone;

      // Resolver oferta a valor Zoho
      const offer = await prisma.tenantOffer.findFirst({
        where: {
          tenantId,
          slug: lead.offerInterest!,
        },
      });

      const zohoOfferValue = offer?.zohoPicklistValue || lead.offerInterest;

      // Preparar datos
      const leadData = {
        firstName: lead.firstName,
        lastName: lead.lastName,
        phone: phoneE164,
        email: lead.email,
        dni: lead.dni,
        offerInterest: zohoOfferValue,
        modalityInterest: lead.modalityInterest,
        periodInterest: lead.periodInterest,
      };

      // Buscar si ya existe en Zoho
      const existingContact = await zohoService.searchContact(phoneE164);

      if (existingContact) {
        // Update
        console.log(`🔄 Actualizando contacto Zoho ${existingContact.id}`);
        await zohoService.updateContact(existingContact.id, leadData);

        await prisma.lead.update({
          where: { id: leadId },
          data: {
            zohoContactId: existingContact.id,
            zohoSyncStatus: 'synced',
            zohoLastSyncAt: new Date(),
            zohoLastError: null,
          },
        });
      } else {
        // Create
        console.log(`✨ Creando nuevo contacto en Zoho`);
        const zohoContactId = await zohoService.createContact(leadData);

        await prisma.lead.update({
          where: { id: leadId },
          data: {
            zohoContactId,
            zohoSyncStatus: 'synced',
            zohoLastSyncAt: new Date(),
            zohoLastError: null,
          },
        });
      }

      console.log(`✅ Lead ${leadId} sincronizado a Zoho`);
    } catch (err: any) {
      console.error(`❌ Error sincronizando lead ${leadId} a Zoho:`, err);

      await prisma.lead.update({
        where: { id: leadId },
        data: {
          zohoSyncStatus: 'error',
          zohoLastError: err.message || 'Unknown error',
        },
      });

      throw err;
    }
  }
}
```

---

### 1.6 — Inserción en el worker

**Archivo:** `packages/backend/src/worker.ts`

Después de la línea:
```typescript
const { conversation, channel, tenant, lead } = resolved;
console.log(`✅ Resolved: tenant=${tenant.name}, lead=${lead.id}, conversation=${conversation.id}`);
```

Insertar:

```typescript
// ============================================
// LEAD EXTRACTION & ZOHO SYNC (non-blocking)
// ============================================
try {
  const extracted = await LeadExtractionService.extract({
    tenantId: tenant.id,
    conversationId: conversation.id,
    leadId: lead.id,
    latestMessage: data.text,
    profileName: data.profileName,
  });

  const enrichedLead = await LeadProfileService.mergeExtractedData(lead.id, extracted);

  // Si el lead está listo y nunca se sincronizó, hacerlo ahora
  const isReady = !!(
    enrichedLead.phone &&
    enrichedLead.firstName &&
    enrichedLead.lastName &&
    enrichedLead.offerInterest
  );

  if (isReady && enrichedLead.zohoSyncStatus === 'pending') {
    await ZohoSyncService.syncLeadToZoho(enrichedLead.id, tenant.id);
  }
} catch (err) {
  console.error('⚠️ Lead extraction/sync error (non-fatal):', err);
}
```

---

## FASE 2 — Frontend (Panel de administración)

### 2.1 — Panel de ofertas del tenant

**Archivo:** `packages/web/src/app/dashboard/offers/page.tsx`

Crear página para gestionar ofertas:
- Listar ofertas activas/inactivas
- Crear nueva oferta
- Editar oferta (nombre, slug, valor Zoho, sinónimos, keywords)
- Activar/desactivar
- Ordenar (drag & drop o botones arriba/abajo)

### 2.2 — Panel de integración Zoho

**Archivo:** `packages/web/src/app/dashboard/integrations/page.tsx`

Sección para configurar integración Zoho:
- Client ID
- Client Secret
- Refresh Token
- Módulo API name (default: "Contacts")
- Dedupe field (default: "Mobile")
- Field mapping (JSON editor o form)
- Fixed values (JSON editor)
- Botón "Probar conexión"
- Botón "Guardar"

### 2.3 — Vista de Lead con botón "Actualizar en Zoho"

**Archivo:** `packages/web/src/app/dashboard/leads/[id]/page.tsx`

En la vista de detalle del lead, agregar:

```tsx
{lead.zohoContactId && (
  <div>
    <p>Zoho Contact ID: {lead.zohoContactId}</p>
    <p>Última sync: {lead.zohoLastSyncAt ? formatDate(lead.zohoLastSyncAt) : 'Nunca'}</p>
    <p>Estado: {lead.zohoSyncStatus}</p>
    
    {lead.zohoSyncStatus === 'error' && (
      <div className="error-banner">
        ⚠️ Error en última sincronización: {lead.zohoLastError}
      </div>
    )}
    
    {hasNewDataSinceLastSync(lead) && (
      <button onClick={() => handleManualSync(lead.id)}>
        🔄 Actualizar en Zoho
      </button>
    )}
  </div>
)}
```

Lógica:
```typescript
function hasNewDataSinceLastSync(lead: Lead): boolean {
  if (!lead.zohoLastSyncAt) return false;
  
  // Comparar hash actual vs hash en última sync
  const currentHash = calculateSyncHash(lead);
  return currentHash !== lead.zohoSyncHash;
}

async function handleManualSync(leadId: string) {
  try {
    await api.syncLeadToZoho(leadId);
    alert('Lead actualizado en Zoho');
    reload();
  } catch (err) {
    alert('Error al sincronizar: ' + err.message);
  }
}
```

---

## FASE 3 — Prompt conversacional proactivo

### 3.1 — Inyección de instrucciones de captura

**Archivo:** `packages/backend/src/services/openai.service.ts`

En el método `buildContext`, después de inyectar guardrails, agregar:

```typescript
// Si el tenant tiene integración Zoho activa, inyectar instrucciones de captura
const zohoIntegration = await prisma.integration.findUnique({
  where: {
    tenantId_type: {
      tenantId: botSettings.tenantId,
      type: 'zoho_crm',
    },
  },
});

if (zohoIntegration && zohoIntegration.status === 'active') {
  systemPrompt += `\n\n📋 CAPTURA DE LEADS — INSTRUCCIONES IMPORTANTES:

Tu objetivo secundario es identificar si el usuario es un "interesado real" o solo un "consultante casual".

**Interesado real:** menciona interés en estudiar, cursar, inscribirse, averiguar fechas de inicio, costos, modalidades.
**Consultante casual:** solo pregunta información general, horarios de atención, ubicación.

Si detectás interés real:
1. Primero preguntá qué curso/carrera le interesa (de forma natural, no como formulario).
2. Si ya expresó interés en una oferta, pedí nombre y apellido para "dejar registrada la consulta".
3. No pidas todos los datos juntos. Avanzá gradualmente.
4. Una vez identificado (nombre + apellido + oferta), seguí ayudando normalmente.
5. Completá modalidad, período, correo o DNI solo si surge naturalmente en la conversación.
6. NUNCA menciones CRM, sincronización ni procesos internos.

Sé conversacional, no interrogador.`;
}
```

---

## FASE 4 — Testing y ajustes

### 4.1 — Seed de ofertas IUDI

**Archivo:** `packages/backend/prisma/seed.ts`

Agregar seed de ofertas para IUDI (tenant de prueba):

```typescript
// Crear ofertas para IUDI
const iudiTenant = await prisma.tenant.findFirst({ where: { name: 'IUDI' } });

if (iudiTenant) {
  await prisma.tenantOffer.createMany({
    data: [
      {
        tenantId: iudiTenant.id,
        name: 'Curso 1',
        slug: 'curso-1',
        zohoPicklistValue: 'Curso 1',
        synonymsJson: ['curso uno', 'primer curso', 'c1'],
        keywordsJson: ['curso', '1', 'uno'],
        isActive: true,
        sortOrder: 1,
      },
      {
        tenantId: iudiTenant.id,
        name: 'Curso 2',
        slug: 'curso-2',
        zohoPicklistValue: 'Curso 2',
        synonymsJson: ['curso dos', 'segundo curso', 'c2'],
        keywordsJson: ['curso', '2', 'dos'],
        isActive: true,
        sortOrder: 2,
      },
      {
        tenantId: iudiTenant.id,
        name: 'Curso 3',
        slug: 'curso-3',
        zohoPicklistValue: 'Curso 3',
        synonymsJson: ['curso tres', 'tercer curso', 'c3'],
        keywordsJson: ['curso', '3', 'tres'],
        isActive: true,
        sortOrder: 3,
      },
    ],
  });
}
```

### 4.2 — Crear integración Zoho para IUDI

Desde el panel o directamente en DB:

```sql
INSERT INTO integrations (tenant_id, type, config_encrypted, status)
VALUES (
  'IUDI_TENANT_ID',
  'zoho_crm',
  '{
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
  }',
  'active'
);
```

---

## CHECKLIST FINAL

### Backend
- [ ] Migración Prisma con nuevos campos en Lead
- [ ] Modelo TenantOffer
- [ ] Enum IntegrationType.zoho_crm
- [ ] Enums IntentLevel y ZohoSyncStatus
- [ ] ZohoService con renovación automática de token
- [ ] LeadExtractionService
- [ ] LeadProfileService
- [ ] ZohoSyncService
- [ ] Inserción en worker.ts
- [ ] Rutas API para ofertas (CRUD)
- [ ] Ruta API para sync manual de lead
- [ ] Seed de ofertas IUDI

### Frontend
- [ ] Página de gestión de ofertas
- [ ] Página de configuración de integración Zoho
- [ ] Botón "Actualizar en Zoho" en vista de lead
- [ ] Indicador de estado de sync en lead
- [ ] Manejo de errores de sync

### Testing
- [ ] Probar extracción de datos desde conversación
- [ ] Probar matching de ofertas con sinónimos
- [ ] Probar create en Zoho
- [ ] Probar update en Zoho
- [ ] Probar renovación automática de token
- [ ] Probar detección de cambios (hash)
- [ ] Probar comportamiento proactivo del bot

---

## NOTAS IMPORTANTES

1. **Credenciales Zoho:** Necesitás conseguir de IUDI:
   - Client ID
   - Client Secret
   - Refresh Token (generado desde Zoho Developer Console)

2. **Normalización de teléfono:** Asegurate de que `phoneE164` se calcule correctamente en `ConversationService.resolveOrCreate`

3. **Ofertas dinámicas:** IUDI puede agregar/editar ofertas desde el panel sin tocar código

4. **Sync manual:** El botón "Actualizar en Zoho" solo aparece si hay datos nuevos desde la última sync

5. **Errores no fatales:** Si falla la extracción o sync, el mensaje se procesa igual (no se rompe el worker)

6. **Multi-tenant:** Otros tenants no se ven afectados. Solo IUDI tiene campos Zoho en sus leads.

---

Fin del roadmap.
