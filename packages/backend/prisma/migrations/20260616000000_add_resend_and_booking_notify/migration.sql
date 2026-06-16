-- AlterEnum
ALTER TYPE "IntegrationType" ADD VALUE 'resend';

-- AlterTable
ALTER TABLE "bot_settings" ADD COLUMN "booking_notify_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "bot_settings" ADD COLUMN "booking_notify_email" TEXT;
