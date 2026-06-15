ALTER TABLE "booking_settings" ADD COLUMN IF NOT EXISTS "cancel_enabled" BOOLEAN NOT NULL DEFAULT true;
