-- Conversation attention / unread tracking for dashboard + inbox

ALTER TABLE "conversations"
  ADD COLUMN IF NOT EXISTS "needs_attention" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "attention_read_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "last_customer_message_at" TIMESTAMP(3);

-- Existing human-attention chats stay alerting until someone opens them
UPDATE "conversations"
SET "needs_attention" = true
WHERE "status" = 'pending_human'
  AND "is_archived" = false;

CREATE INDEX IF NOT EXISTS "conversations_tenant_id_needs_attention_idx"
  ON "conversations"("tenant_id", "needs_attention");

CREATE INDEX IF NOT EXISTS "conversations_tenant_id_status_needs_attention_idx"
  ON "conversations"("tenant_id", "status", "needs_attention");
