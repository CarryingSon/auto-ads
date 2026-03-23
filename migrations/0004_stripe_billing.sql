CREATE TABLE IF NOT EXISTS "billing_subscriptions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"status" text DEFAULT 'inactive' NOT NULL,
	"interval" text,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"current_period_start" timestamp,
	"current_period_end" timestamp,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "billing_payments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"amount" real NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"status" text DEFAULT 'paid' NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"plan_type" text DEFAULT 'free' NOT NULL,
	"invoice_url" text,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "billing_subscriptions_user_id_unique" ON "billing_subscriptions" USING btree ("user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "billing_subscriptions_customer_unique" ON "billing_subscriptions" USING btree ("stripe_customer_id") WHERE "stripe_customer_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "billing_subscriptions_subscription_unique" ON "billing_subscriptions" USING btree ("stripe_subscription_id") WHERE "stripe_subscription_id" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "billing_payments" ADD COLUMN IF NOT EXISTS "stripe_invoice_id" text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "billing_payments_invoice_id_unique" ON "billing_payments" USING btree ("stripe_invoice_id") WHERE "stripe_invoice_id" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "global_settings" ALTER COLUMN "uploads_remaining" SET DEFAULT 3;
