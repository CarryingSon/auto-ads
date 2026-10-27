-- One-time pricing offers, one row per user who took one.
-- server/billing.ts creates the same table at runtime if it is missing.
CREATE TABLE IF NOT EXISTS "billing_offer_redemptions" (
  "user_id" varchar PRIMARY KEY NOT NULL,
  "offer" text NOT NULL,
  "stripe_subscription_id" text,
  "redeemed_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Same baseline as 0005: server-side access only.
ALTER TABLE "billing_offer_redemptions" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON "billing_offer_redemptions" FROM anon, authenticated;
