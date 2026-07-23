-- AlterTable
ALTER TABLE "booking_settings" ADD COLUMN IF NOT EXISTS "catalog_config_v2" BOOLEAN NOT NULL DEFAULT false;

-- Enable catalog v2 for Gabinete tenants and migrate shared basePrice → per-service price
UPDATE "booking_settings" bs
SET
  "catalog_config_v2" = true,
  "price_mode" = 'per_service'
FROM "tenants" t
WHERE bs."tenant_id" = t."id"
  AND (
    t."name" ILIKE '%gabinete%'
    OR COALESCE(t."display_name", '') ILIKE '%gabinete%'
  );

UPDATE "booking_services" svc
SET
  "price" = COALESCE(svc."price", bs."base_price"),
  "uses_base_price" = false
FROM "booking_settings" bs
WHERE svc."tenant_id" = bs."tenant_id"
  AND bs."catalog_config_v2" = true
  AND (svc."uses_base_price" = true OR svc."price" IS NULL);
