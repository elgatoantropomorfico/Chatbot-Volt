-- CreateEnum
CREATE TYPE "PilotSyncStatus" AS ENUM ('pending', 'synced', 'error', 'needs_update');

-- AlterEnum
ALTER TYPE "IntegrationType" ADD VALUE 'pilot_crm';

-- AlterTable
ALTER TABLE "leads" ADD COLUMN "pilot_contact_id" TEXT,
ADD COLUMN "pilot_sync_status" "PilotSyncStatus" NOT NULL DEFAULT 'pending',
ADD COLUMN "pilot_last_sync_at" TIMESTAMP(3),
ADD COLUMN "pilot_last_error" TEXT,
ADD COLUMN "pilot_sync_hash" TEXT;

-- CreateTable
CREATE TABLE "pilot_field_configs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "local_key" TEXT NOT NULL,
    "pilot_field" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "field_type" TEXT NOT NULL DEFAULT 'text',
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "default_value" TEXT,
    "include_in_notes" BOOLEAN NOT NULL DEFAULT false,
    "options_json" JSONB,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pilot_field_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pilot_field_configs_tenant_id_local_key_key" ON "pilot_field_configs"("tenant_id", "local_key");

-- CreateIndex
CREATE INDEX "leads_tenant_id_pilot_contact_id_idx" ON "leads"("tenant_id", "pilot_contact_id");

-- AddForeignKey
ALTER TABLE "pilot_field_configs" ADD CONSTRAINT "pilot_field_configs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
