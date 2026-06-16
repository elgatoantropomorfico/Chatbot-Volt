-- Move booking notify config from bot_settings to booking_settings
ALTER TABLE "booking_settings" ADD COLUMN "confirm_notify_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "booking_settings" ADD COLUMN "confirm_notify_email" TEXT;

UPDATE "booking_settings" bs
SET
  "confirm_notify_enabled" = COALESCE(bot."booking_notify_enabled", false),
  "confirm_notify_email" = bot."booking_notify_email"
FROM "bot_settings" bot
WHERE bs."tenant_id" = bot."tenant_id";

ALTER TABLE "bot_settings" DROP COLUMN IF EXISTS "booking_notify_enabled";
ALTER TABLE "bot_settings" DROP COLUMN IF EXISTS "booking_notify_email";
