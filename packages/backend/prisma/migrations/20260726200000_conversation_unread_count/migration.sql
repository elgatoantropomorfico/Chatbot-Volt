-- Unread count + last activity for WhatsApp-like inbox order

ALTER TABLE "conversations"
  ADD COLUMN IF NOT EXISTS "last_message_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "unread_count" INTEGER NOT NULL DEFAULT 0;

-- Backfill last_message_at from latest message
UPDATE "conversations" c
SET "last_message_at" = sub.max_created
FROM (
  SELECT conversation_id, MAX(created_at) AS max_created
  FROM messages
  GROUP BY conversation_id
) sub
WHERE c.id = sub.conversation_id
  AND c.last_message_at IS NULL;

UPDATE "conversations"
SET "last_message_at" = COALESCE("last_message_at", "updated_at")
WHERE "last_message_at" IS NULL;

CREATE INDEX IF NOT EXISTS "conversations_tenant_id_last_message_at_idx"
  ON "conversations"("tenant_id", "last_message_at" DESC);
