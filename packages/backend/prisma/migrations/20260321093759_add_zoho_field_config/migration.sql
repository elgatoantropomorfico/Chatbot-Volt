-- CreateTable
CREATE TABLE "zoho_field_configs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "local_key" TEXT NOT NULL,
    "zoho_field" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "field_type" TEXT NOT NULL DEFAULT 'single_line',
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "fixed_value" TEXT,
    "options_json" JSONB NOT NULL DEFAULT '[]',
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "zoho_field_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "zoho_field_configs_tenant_id_idx" ON "zoho_field_configs"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "zoho_field_configs_tenant_id_local_key_key" ON "zoho_field_configs"("tenant_id", "local_key");

-- AddForeignKey
ALTER TABLE "zoho_field_configs" ADD CONSTRAINT "zoho_field_configs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
