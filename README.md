# Volt ChatBot

Plataforma SaaS multi-tenant de chatbot conversacional con IA, integrado a WhatsApp Cloud API.

## Stack

- **Backend**: Node.js + Fastify + TypeScript + Prisma + PostgreSQL + Redis + BullMQ
- **Frontend**: Next.js (App Router) + TypeScript + Radix UI + CSS Modules
- **IA**: OpenAI SDK
- **Messaging**: WhatsApp Cloud API (Meta Graph)
- **E-commerce**: WooCommerce REST API
- **Monorepo**: npm workspaces

## Estructura

```
volt-chatbot/
├── packages/
│   ├── backend/          # API + Worker + Services
│   │   ├── prisma/       # Schema + Migrations + Seed
│   │   └── src/
│   │       ├── config/   # env, database, redis
│   │       ├── plugins/  # auth (JWT)
│   │       ├── middleware/# roles, tenant
│   │       ├── routes/   # auth, tenant, channel, user, lead, conversation, bot-settings, integration, webhook
│   │       ├── services/ # auth, whatsapp, openai, woo, handoff, conversation
│   │       ├── queues/   # BullMQ message queue
│   │       ├── app.ts    # Fastify app builder
│   │       ├── server.ts # Entry point
│   │       └── worker.ts # IA Worker
│   └── web/              # Panel Web (Next.js)
│       └── src/
│           ├── app/      # Pages (App Router)
│           ├── context/  # AuthContext
│           └── lib/      # API client
```

## Setup

### Requisitos
- Node.js >= 18
- PostgreSQL
- Redis

### Instalación

```bash
npm install
```

### Variables de entorno

```bash
cp packages/backend/.env.example packages/backend/.env
# Editar .env con tus credenciales
```

### Base de datos

```bash
npm run db:generate
npm run db:migrate
npm run db:seed
```

### Desarrollo

```bash
# Backend (API en :3001)
npm run dev:backend

# Frontend (Web en :3000)
npm run dev:web

# Worker (procesamiento IA)
npm run dev:worker
```

### Credenciales de prueba (seed)

| Rol | Email | Password |
|-----|-------|----------|
| Super Admin | admin@volt.dev | admin123456 |
| Tenant Admin | tenant@demo.com | tenant123456 |
| Agent | agent@demo.com | agent123456 |

## MVP 1 - Funcionalidades

- **Multi-tenant**: Múltiples clientes bajo un mismo WABA
- **Auth**: JWT con refresh tokens, roles (superadmin, tenant_admin, agent)
- **WhatsApp**: Webhook, recepción/envío de mensajes, ruteo por phone_number_id
- **OpenAI**: Prompt configurable por tenant, contexto conversacional, summary
- **WooCommerce**: Búsqueda de pedidos/productos
- **Inbox**: Lista de conversaciones, chat, estados
- **Leads (pseudo-CRM)**: Stages, notas, asignación de agente
- **Handoff humano**: Triggers automáticos, link wa.me, reactivación
- **SuperAdmin**: CRUD tenants, channels, usuarios, configuración
