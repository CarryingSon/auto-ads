-- Pro granted by hand, without payment. Active while revoked_at is null.
-- server/billing.ts creates the same table at runtime if it is missing.
-- Grant:  insert into complimentary_pro (user_id, note) values ('<user id>', '<why>');
-- Revoke: update complimentary_pro set revoked_at = now() where user_id = '<user id>';
CREATE TABLE IF NOT EXISTS "complimentary_pro" (
  "user_id" varchar PRIMARY KEY NOT NULL,
  "note" text,
  "granted_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "revoked_at" timestamp
);

-- Same baseline as 0005: server-side access only.
ALTER TABLE "complimentary_pro" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON "complimentary_pro" FROM anon, authenticated;
