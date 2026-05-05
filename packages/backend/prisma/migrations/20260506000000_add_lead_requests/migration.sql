-- ============================================================
-- Add LeadRequest support: a lead can accumulate multiple turnos /
-- presupuestos / pedidos, each with its own captured data and photos.
-- Backfills existing customData + lead_photos into a single completed
-- request per lead so nothing is lost.
-- ============================================================

-- 1) New enum.
CREATE TYPE "LeadRequestStatus" AS ENUM ('in_progress', 'completed', 'cancelled');

-- 2) lead_requests table.
CREATE TABLE "lead_requests" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "status" "LeadRequestStatus" NOT NULL DEFAULT 'in_progress',
    "data" JSONB NOT NULL DEFAULT '{}',
    "label" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "lead_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "lead_requests_lead_id_status_idx" ON "lead_requests"("lead_id", "status");
CREATE INDEX "lead_requests_tenant_id_idx" ON "lead_requests"("tenant_id");

ALTER TABLE "lead_requests"
    ADD CONSTRAINT "lead_requests_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "lead_requests"
    ADD CONSTRAINT "lead_requests_lead_id_fkey"
    FOREIGN KEY ("lead_id") REFERENCES "leads"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- 3) lead_field_configs: scope flag (lead | request, default request).
ALTER TABLE "lead_field_configs"
    ADD COLUMN "scope" TEXT NOT NULL DEFAULT 'request';

-- 4) lead_photos: optional foreign key to a request.
ALTER TABLE "lead_photos"
    ADD COLUMN "request_id" TEXT;

CREATE INDEX "lead_photos_request_id_idx" ON "lead_photos"("request_id");

ALTER TABLE "lead_photos"
    ADD CONSTRAINT "lead_photos_request_id_fkey"
    FOREIGN KEY ("request_id") REFERENCES "lead_requests"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- 5) Backfill: for every lead that already has any captured data
--    (custom_data OR at least one lead_photo), create one historical
--    LeadRequest carrying that data and re-attach photos to it.
WITH inserted AS (
    INSERT INTO "lead_requests" (
        "id",
        "tenant_id",
        "lead_id",
        "status",
        "data",
        "label",
        "created_at",
        "updated_at",
        "completed_at"
    )
    SELECT
        gen_random_uuid()::text AS "id",
        l."tenant_id",
        l."id" AS "lead_id",
        'completed'::"LeadRequestStatus" AS "status",
        COALESCE(l."custom_data", '{}'::jsonb) AS "data",
        'Solicitud histórica' AS "label",
        l."created_at" AS "created_at",
        NOW() AS "updated_at",
        NOW() AS "completed_at"
    FROM "leads" l
    WHERE
        (l."custom_data" IS NOT NULL AND l."custom_data" <> '{}'::jsonb)
        OR EXISTS (
            SELECT 1 FROM "lead_photos" p WHERE p."lead_id" = l."id"
        )
    RETURNING "id", "lead_id"
)
UPDATE "lead_photos" p
SET "request_id" = ins."id"
FROM inserted ins
WHERE p."lead_id" = ins."lead_id" AND p."request_id" IS NULL;

-- 6) Mark fieldKey='dni' as scope='lead' for any tenant where it exists.
--    DNI is identity, not per-request.
UPDATE "lead_field_configs"
SET "scope" = 'lead'
WHERE "field_key" = 'dni';
