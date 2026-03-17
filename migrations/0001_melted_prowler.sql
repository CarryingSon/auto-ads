CREATE TABLE "ad_account_settings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"ad_account_id" text NOT NULL,
	"ad_account_name" text,
	"campaign_objective" text,
	"budget_type" text,
	"budget_amount" real,
	"pixel_id" text,
	"pixel_name" text,
	"audience_type" text,
	"audience_id" text,
	"audience_name" text,
	"geo_targeting" text[] DEFAULT '{}',
	"age_min" integer DEFAULT 18,
	"age_max" integer DEFAULT 65,
	"gender" text DEFAULT 'ALL',
	"daily_min_spend_target" real,
	"daily_spend_cap" real,
	"lifetime_spend_cap" real,
	"website_url" text,
	"default_cta" text,
	"default_url" text,
	"display_link" text,
	"creative_enhancements" jsonb,
	"is_configured" boolean DEFAULT false,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bulk_upload_jobs" ADD COLUMN "ad_upload_mode" text DEFAULT 'single';--> statement-breakpoint
ALTER TABLE "meta_assets" ADD COLUMN "pending_ad_accounts_json" jsonb DEFAULT '[]'::jsonb;