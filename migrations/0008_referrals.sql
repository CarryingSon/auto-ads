-- Free plan launch credits and the referral program.
-- server/referrals.ts creates the same tables at runtime if they are missing.
CREATE TABLE IF NOT EXISTS "referral_codes" (
  "user_id" varchar PRIMARY KEY NOT NULL,
  "code" text NOT NULL UNIQUE,
  "created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS "referrals" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "referrer_user_id" varchar NOT NULL,
  "referred_user_id" varchar NOT NULL UNIQUE,
  "created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "rewarded_at" timestamp
);

CREATE INDEX IF NOT EXISTS "referrals_referrer_user_id_idx" ON "referrals" ("referrer_user_id");

-- Same baseline as 0005: server-side access only.
ALTER TABLE "referral_codes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "referrals" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON "referral_codes", "referrals" FROM anon, authenticated;
