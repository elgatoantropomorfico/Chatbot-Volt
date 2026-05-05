-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "media_url" TEXT,
ADD COLUMN     "message_type" TEXT NOT NULL DEFAULT 'text';
