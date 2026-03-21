-- CreateEnum
CREATE TYPE "IntentLevel" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "ZohoSyncStatus" AS ENUM ('pending', 'synced', 'error');

-- AlterEnum
ALTER TYPE "IntegrationType" ADD VALUE 'zoho_crm';

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "dni" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "first_name" TEXT,
ADD COLUMN     "full_name" TEXT,
ADD COLUMN     "intent_level" "IntentLevel",
ADD COLUMN     "last_detected_topic" TEXT,
ADD COLUMN     "last_name" TEXT,
ADD COLUMN     "modality_interest" TEXT,
ADD COLUMN     "needs_human_followup" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "offer_interest" TEXT,
ADD COLUMN     "period_interest" TEXT,
ADD COLUMN     "whatsapp_profile_name" TEXT,
ADD COLUMN     "zoho_contact_id" TEXT,
ADD COLUMN     "zoho_last_error" TEXT,
ADD COLUMN     "zoho_last_sync_at" TIMESTAMP(3),
ADD COLUMN     "zoho_sync_hash" TEXT,
ADD COLUMN     "zoho_sync_status" "ZohoSyncStatus" NOT NULL DEFAULT 'pending';

-- CreateTable
CREATE TABLE "tenant_offers" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "zoho_picklist_value" TEXT NOT NULL,
    "synonyms_json" JSONB,
    "keywords_json" JSONB,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_offers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tenant_offers_tenant_id_is_active_idx" ON "tenant_offers"("tenant_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_offers_tenant_id_slug_key" ON "tenant_offers"("tenant_id", "slug");

-- CreateIndex
CREATE INDEX "leads_tenant_id_zoho_contact_id_idx" ON "leads"("tenant_id", "zoho_contact_id");

-- AddForeignKey
ALTER TABLE "tenant_offers" ADD CONSTRAINT "tenant_offers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
