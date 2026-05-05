-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "custom_data" JSONB;

-- CreateTable
CREATE TABLE "lead_field_configs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "field_key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "field_type" TEXT NOT NULL DEFAULT 'text',
    "step" INTEGER NOT NULL DEFAULT 1,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "options_json" JSONB NOT NULL DEFAULT '[]',
    "prompt_hint" TEXT,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_field_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_photos" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "field_key" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mime_type" TEXT,
    "file_size" INTEGER,
    "caption" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lead_field_configs_tenant_id_idx" ON "lead_field_configs"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "lead_field_configs_tenant_id_field_key_key" ON "lead_field_configs"("tenant_id", "field_key");

-- CreateIndex
CREATE INDEX "lead_photos_lead_id_field_key_idx" ON "lead_photos"("lead_id", "field_key");

-- AddForeignKey
ALTER TABLE "lead_field_configs" ADD CONSTRAINT "lead_field_configs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_photos" ADD CONSTRAINT "lead_photos_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
