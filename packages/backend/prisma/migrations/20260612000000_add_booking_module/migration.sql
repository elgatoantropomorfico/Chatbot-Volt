-- Booking / Turnera module

CREATE TYPE "AppointmentStatus" AS ENUM (
  'pendiente_datos',
  'pendiente_pago',
  'confirmado',
  'cancelado',
  'reprogramado',
  'completado',
  'no_asistio',
  'vencido'
);

ALTER TYPE "IntegrationType" ADD VALUE IF NOT EXISTS 'mercadopago';

ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "booking_flow_json" JSONB;

CREATE TABLE IF NOT EXISTS "booking_settings" (
  "tenant_id" TEXT NOT NULL,
  "booking_enabled" BOOLEAN NOT NULL DEFAULT false,
  "booking_mode" TEXT NOT NULL DEFAULT 'fixed_slots',
  "session_duration_minutes" INTEGER NOT NULL DEFAULT 80,
  "slot_interval_minutes" INTEGER NOT NULL DEFAULT 90,
  "buffer_minutes" INTEGER NOT NULL DEFAULT 10,
  "timezone" TEXT NOT NULL DEFAULT 'America/Argentina/Cordoba',
  "currency" TEXT NOT NULL DEFAULT 'ARS',
  "price_mode" TEXT NOT NULL DEFAULT 'same_price_for_all_services',
  "base_price" DECIMAL(12,2),
  "deposit_enabled" BOOLEAN NOT NULL DEFAULT true,
  "deposit_percentage" INTEGER NOT NULL DEFAULT 50,
  "deposit_refundable" BOOLEAN NOT NULL DEFAULT false,
  "allow_full_payment" BOOLEAN NOT NULL DEFAULT true,
  "payment_link_expiration_minutes" INTEGER NOT NULL DEFAULT 15,
  "working_days_json" JSONB NOT NULL DEFAULT '[1,2,3,4,5]',
  "cancellation_policy_json" JSONB,
  "messages_json" JSONB,
  "allow_custom_slots" BOOLEAN NOT NULL DEFAULT true,
  "allow_custom_services" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "booking_settings_pkey" PRIMARY KEY ("tenant_id"),
  CONSTRAINT "booking_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "booking_services" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "service_type" TEXT,
  "short_description" TEXT,
  "long_description" TEXT,
  "duration_minutes" INTEGER NOT NULL DEFAULT 80,
  "price" DECIMAL(12,2),
  "uses_base_price" BOOLEAN NOT NULL DEFAULT true,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "recommendation_tags" JSONB NOT NULL DEFAULT '[]',
  "recommended_when" JSONB NOT NULL DEFAULT '[]',
  "bot_summary" TEXT,
  "bot_recommendation_text" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "booking_services_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "booking_services_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "booking_services_tenant_id_slug_key" ON "booking_services"("tenant_id", "slug");
CREATE INDEX IF NOT EXISTS "booking_services_tenant_id_is_active_idx" ON "booking_services"("tenant_id", "is_active");

CREATE TABLE IF NOT EXISTS "booking_slots" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "time" TEXT NOT NULL,
  "duration_minutes" INTEGER NOT NULL DEFAULT 80,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "booking_slots_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "booking_slots_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "booking_slots_tenant_id_time_key" ON "booking_slots"("tenant_id", "time");
CREATE INDEX IF NOT EXISTS "booking_slots_tenant_id_is_active_idx" ON "booking_slots"("tenant_id", "is_active");

CREATE TABLE IF NOT EXISTS "booking_blocks" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "time" TEXT,
  "reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "booking_blocks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "booking_blocks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "booking_blocks_tenant_id_date_idx" ON "booking_blocks"("tenant_id", "date");

CREATE TABLE IF NOT EXISTS "booking_price_rules" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "rule_type" TEXT NOT NULL,
  "value" DECIMAL(12, 2) NOT NULL,
  "valid_from" TIMESTAMP(3),
  "valid_until" TIMESTAMP(3),
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "booking_price_rules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "booking_price_rules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "booking_price_rules_tenant_id_is_active_idx" ON "booking_price_rules"("tenant_id", "is_active");

CREATE TABLE IF NOT EXISTS "appointments" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "lead_id" TEXT NOT NULL,
  "conversation_id" TEXT,
  "service_id" TEXT NOT NULL,
  "customer_name" TEXT,
  "customer_phone" TEXT NOT NULL,
  "appointment_date" DATE NOT NULL,
  "appointment_time" TEXT NOT NULL,
  "status" "AppointmentStatus" NOT NULL DEFAULT 'pendiente_datos',
  "list_price" DECIMAL(12,2) NOT NULL,
  "final_price" DECIMAL(12,2) NOT NULL,
  "price_rule_id" TEXT,
  "discount_label" TEXT,
  "amount_total" DECIMAL(12,2) NOT NULL,
  "amount_paid" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "balance_due" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "payment_type" TEXT,
  "mp_preference_id" TEXT,
  "mp_payment_id" TEXT,
  "mp_status" TEXT,
  "mp_payment_link" TEXT,
  "receipt_token" TEXT,
  "customer_notes" TEXT,
  "is_first_time" BOOLEAN,
  "hold_expires_at" TIMESTAMP(3),
  "confirmed_at" TIMESTAMP(3),
  "cancelled_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "appointments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "appointments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "appointments_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "appointments_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "appointments_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "booking_services"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "appointments_price_rule_id_fkey" FOREIGN KEY ("price_rule_id") REFERENCES "booking_price_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "appointments_receipt_token_key" ON "appointments"("receipt_token");
CREATE INDEX IF NOT EXISTS "appointments_tenant_id_appointment_date_appointment_time_idx" ON "appointments"("tenant_id", "appointment_date", "appointment_time");
CREATE INDEX IF NOT EXISTS "appointments_tenant_id_status_idx" ON "appointments"("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "appointments_lead_id_idx" ON "appointments"("lead_id");
