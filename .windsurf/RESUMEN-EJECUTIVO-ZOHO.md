# RESUMEN EJECUTIVO — Integración Zoho CRM para IUDI

## ✅ Directrices confirmadas

### 1. Tipo de integración
- **Self Client de Zoho** (no OAuth público)
- Backend controla credenciales de IUDI
- Renovación automática de `access_token` usando `refresh_token`
- No hay botón "Conectar Zoho" en panel (integración custom pre-configurada)

### 2. Campos Zoho (módulo Contacts = "Aspirantes")
- ✅ `First_Name`, `Last_Name`, `Mobile` (dedupe), `Email`, `DNI`
- ✅ `Programa` (picklist: "Curso 1", "Curso 2", "Curso 3", etc.)
- ✅ `Modalidad`, `Periodo`
- ✅ `Fuente_de_aspirante` (fixed: "Volt IA Chatbot"), `Fecha_de_contacto`
- ❌ `Description` (descartado)

### 3. Catálogo de ofertas
- IUDI está desarrollando las ofertas → valores dinámicos
- Sistema debe permitir cargar desde panel:
  - Nombre visible
  - Valor exacto del picklist Zoho
  - Sinónimos y keywords para matching
- **No hardcodear** "Curso 1", "Curso 2", etc. en código

### 4. Comportamiento conversacional
- **Proactivo**: detectar "interesado real" vs "consultante casual"
- Si detecta interés real → pedir datos básicos (nombre, apellido, oferta)
- Natural, no interrogatorio

### 5. Estrategia de sync
- **Create automático**: cuando hay phone + firstName + lastName + offerInterest
- **Update manual**: botón "Actualizar en Zoho" en panel de lead
  - Solo visible si hay datos nuevos (comparación por hash)
  - Muestra error si hubo fallo en última sync
- **Dedupe**: por `Mobile` (teléfono normalizado E.164)

### 6. Modelo Lead
- Ampliar solo para tenants con integración Zoho activa
- Otros tenants mantienen estructura básica
- Campos específicos por tipo de integración

---

## 📋 Checklist de implementación

### Backend — Base de datos
- [ ] Migración Prisma: nuevos campos en `Lead`
- [ ] Modelo `TenantOffer`
- [ ] Enum `IntegrationType.zoho_crm`
- [ ] Enums `IntentLevel` y `ZohoSyncStatus`

### Backend — Servicios
- [ ] `ZohoService` (renovación automática de token)
- [ ] `LeadExtractionService` (extracción de datos desde conversación)
- [ ] `LeadProfileService` (merge de datos + cálculo de hash)
- [ ] `ZohoSyncService` (create/update en Zoho)
- [ ] `OfferMatchingService` (matching de ofertas con sinónimos)

### Backend — Worker
- [ ] Insertar lógica de extracción después de `resolveOrCreate`
- [ ] Sync automático cuando lead esté listo
- [ ] Manejo de errores no fatales

### Backend — API Routes
- [ ] CRUD de ofertas (`/api/offers`)
- [ ] Endpoint de sync manual (`/api/leads/:id/sync-zoho`)
- [ ] Endpoint de configuración Zoho (`/api/integrations/zoho`)

### Frontend — Panel
- [ ] Página de gestión de ofertas
- [ ] Página de configuración de integración Zoho
- [ ] Botón "Actualizar en Zoho" en vista de lead
- [ ] Indicador de estado de sync
- [ ] Manejo de errores de sync

### Prompt conversacional
- [ ] Inyección de instrucciones de captura en `buildContext`
- [ ] Clasificación de "interesado" vs "consultante"
- [ ] Comportamiento proactivo para captura de datos

### Testing
- [ ] Probar extracción de datos
- [ ] Probar matching de ofertas con sinónimos
- [ ] Probar create en Zoho
- [ ] Probar update en Zoho
- [ ] Probar renovación automática de token
- [ ] Probar detección de cambios (hash)

---

## 🎯 Orden de ejecución recomendado

### Sprint 1 — Fundación (Backend)
1. Migración Prisma (Lead + TenantOffer + enums)
2. ZohoService con renovación de token
3. LeadExtractionService básico
4. LeadProfileService con hash
5. ZohoSyncService (create/update)
6. Inserción en worker
7. Seed de ofertas IUDI

### Sprint 2 — Panel (Frontend)
1. API routes para ofertas
2. Página de gestión de ofertas
3. API routes para integración Zoho
4. Página de configuración Zoho
5. Botón "Actualizar en Zoho" en lead
6. Indicadores de estado de sync

### Sprint 3 — Prompt proactivo
1. Inyección de instrucciones en buildContext
2. Ajuste de prompt para clasificación
3. Testing conversacional

### Sprint 4 — Testing y ajustes
1. Testing end-to-end
2. Ajustes de matching de ofertas
3. Ajustes de prompt
4. Documentación

---

## ⚠️ Puntos críticos a validar

### Antes de empezar
1. **Credenciales Zoho de IUDI:**
   - Client ID
   - Client Secret
   - Refresh Token
   - ¿Ya las tenés o necesitás que IUDI las genere?

2. **Normalización de teléfono:**
   - ¿`phoneE164` se calcula correctamente en `ConversationService.resolveOrCreate`?
   - ¿O necesitamos implementar esa normalización?

3. **Ofertas iniciales de IUDI:**
   - ¿Empezamos con "Curso 1", "Curso 2", "Curso 3" hardcodeados en el seed?
   - ¿O esperamos a que IUDI defina nombres reales?

### Durante implementación
1. **Matching de ofertas:**
   - ¿Usamos matching determinístico (exact + fuzzy) o LLM como árbitro?
   - ¿Qué nivel de confianza mínimo para asignar oferta?

2. **Extracción de datos:**
   - ¿Usamos GPT-4o-mini para extracción o un modelo más barato?
   - ¿Cuántos mensajes de contexto tomamos (6, 10, 15)?

3. **Prompt proactivo:**
   - ¿Qué tan agresivo debe ser el bot pidiendo datos?
   - ¿Debe preguntar nombre/apellido en el primer mensaje si detecta interés?

---

## 🚀 Próximos pasos

1. **Validar credenciales Zoho:** Conseguir Client ID, Client Secret y Refresh Token de IUDI
2. **Validar normalización de teléfono:** Verificar que `phoneE164` se calcule correctamente
3. **Definir ofertas iniciales:** Confirmar si empezamos con "Curso 1, 2, 3" o esperamos nombres reales
4. **Ejecutar Sprint 1:** Implementar fundación backend

---

## 📚 Documentos de referencia

- **Especificación completa:** `.windsurf/integracion-custom-zoho.md`
- **Roadmap ejecutable:** `.windsurf/ROADMAP-ZOHO-IUDI.md`
- **Este resumen:** `.windsurf/RESUMEN-EJECUTIVO-ZOHO.md`

---

Fin del resumen.
