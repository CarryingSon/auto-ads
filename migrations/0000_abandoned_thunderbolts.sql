CREATE TABLE "ad_copy_overrides" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" varchar NOT NULL,
	"adset_id" varchar NOT NULL,
	"creative_index" integer NOT NULL,
	"primary_text" text,
	"headline" text,
	"description" text,
	"cta" text,
	"url" text,
	"utm" text,
	"is_manual_override" boolean DEFAULT true,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "adsets" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" varchar NOT NULL,
	"drive_folder_id" text NOT NULL,
	"drive_folder_name" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"use_defaults" boolean DEFAULT true NOT NULL,
	"override_settings" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"video_count" integer DEFAULT 0,
	"has_docx" boolean DEFAULT false,
	"docx_file_id" text,
	"docx_file_name" text,
	"validation_errors" text[],
	"meta_adset_id" text,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bulk_upload_jobs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"drive_root_folder_id" text,
	"drive_root_folder_url" text,
	"drive_root_folder_name" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"current_step" integer DEFAULT 1 NOT NULL,
	"default_settings" jsonb,
	"ad_account_id" text,
	"campaign_id" text,
	"campaign_name" text,
	"page_id" text,
	"pixel_id" text,
	"total_adsets" integer DEFAULT 0,
	"completed_adsets" integer DEFAULT 0,
	"total_ads" integer DEFAULT 0,
	"completed_ads" integer DEFAULT 0,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"completed_at" timestamp,
	"error_message" text,
	"logs" jsonb DEFAULT '[]'::jsonb
);
--> statement-breakpoint
CREATE TABLE "connections" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"provider" text NOT NULL,
	"status" text DEFAULT 'disconnected' NOT NULL,
	"account_name" text,
	"account_email" text,
	"scopes" text[],
	"connected_at" timestamp,
	"last_tested_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "docx_uploads" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" varchar NOT NULL,
	"adset_id" varchar,
	"drive_file_id" text,
	"filename" text NOT NULL,
	"original_filename" text NOT NULL,
	"size" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"raw_text" text,
	"parsed_at" timestamp,
	"parsing_method" text,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extracted_ads" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" varchar NOT NULL,
	"adset_id" varchar,
	"index" integer NOT NULL,
	"primary_text" text,
	"headline" text,
	"description" text,
	"cta" text DEFAULT 'LEARN_MORE',
	"url" text,
	"utm" text,
	"is_valid" boolean DEFAULT false,
	"validation_errors" text[],
	"parsing_method" text,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "global_settings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"facebook_page_id" text,
	"facebook_page_name" text,
	"instagram_page_id" text,
	"instagram_page_name" text,
	"use_instagram_from_facebook" boolean DEFAULT true,
	"beneficiary_name" text,
	"payer_name" text,
	"use_dynamic_creative" boolean DEFAULT true,
	"primary_text_variations" text[] DEFAULT '{}',
	"headline_variations" text[] DEFAULT '{}',
	"description_variations" text[] DEFAULT '{}',
	"default_cta" text DEFAULT 'LEARN_MORE',
	"default_website_url" text,
	"default_utm_template" text,
	"plan_type" text DEFAULT 'free',
	"uploads_remaining" integer DEFAULT 15,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "google_drive_links" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"last_drive_root_url" text,
	"last_drive_root_folder_id" text,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" varchar NOT NULL,
	"adset_id" varchar,
	"level" text DEFAULT 'info' NOT NULL,
	"message" text NOT NULL,
	"details" jsonb,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "launch_schedules" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" varchar NOT NULL,
	"user_id" varchar,
	"schedule_type" text DEFAULT 'immediate' NOT NULL,
	"scheduled_start_time" timestamp,
	"scheduled_end_time" timestamp,
	"timezone" text DEFAULT 'UTC',
	"run_on_days" text[],
	"daily_start_hour" integer,
	"daily_end_hour" integer,
	"launch_status" text DEFAULT 'pending' NOT NULL,
	"active_on_launch" boolean DEFAULT false,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meta_ads" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar,
	"ad_account_id" text NOT NULL,
	"campaign_id" text,
	"adset_id" text NOT NULL,
	"name" text NOT NULL,
	"status" text,
	"creative_json" jsonb,
	"raw_data" jsonb,
	"last_synced_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meta_adsets" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar,
	"ad_account_id" text NOT NULL,
	"campaign_id" text NOT NULL,
	"name" text NOT NULL,
	"status" text,
	"daily_budget" text,
	"lifetime_budget" text,
	"targeting_json" jsonb,
	"start_time" timestamp,
	"end_time" timestamp,
	"raw_data" jsonb,
	"last_synced_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meta_assets" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"meta_user_id" text,
	"ad_accounts_json" jsonb DEFAULT '[]'::jsonb,
	"pages_json" jsonb DEFAULT '[]'::jsonb,
	"businesses_json" jsonb DEFAULT '[]'::jsonb,
	"business_owned_pages_json" jsonb DEFAULT '[]'::jsonb,
	"selected_ad_account_id" text,
	"selected_page_id" text,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meta_campaigns" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar,
	"ad_account_id" text NOT NULL,
	"name" text NOT NULL,
	"status" text,
	"objective" text,
	"daily_budget" text,
	"lifetime_budget" text,
	"start_time" timestamp,
	"stop_time" timestamp,
	"created_time" timestamp,
	"updated_time" timestamp,
	"raw_data" jsonb,
	"last_synced_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meta_insights" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"ad_account_id" text NOT NULL,
	"object_id" text NOT NULL,
	"object_type" text NOT NULL,
	"date_start" text NOT NULL,
	"date_stop" text NOT NULL,
	"impressions" integer DEFAULT 0,
	"clicks" integer DEFAULT 0,
	"spend" text,
	"reach" integer DEFAULT 0,
	"cpc" text,
	"cpm" text,
	"ctr" text,
	"conversions" integer DEFAULT 0,
	"raw_data" jsonb,
	"last_synced_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meta_objects" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" varchar NOT NULL,
	"adset_id" varchar,
	"ad_index" integer,
	"object_type" text NOT NULL,
	"meta_id" text NOT NULL,
	"name" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_connections" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"provider" text NOT NULL,
	"status" text DEFAULT 'disconnected' NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"token_expires_at" timestamp,
	"account_name" text,
	"account_email" text,
	"meta_user_id" text,
	"scopes" text[],
	"connected_at" timestamp,
	"last_tested_at" timestamp,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_states" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"state" text NOT NULL,
	"provider" text NOT NULL,
	"user_id" varchar,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"expires_at" timestamp NOT NULL,
	CONSTRAINT "oauth_states_state_unique" UNIQUE("state")
);
--> statement-breakpoint
CREATE TABLE "sync_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"sync_type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"started_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"completed_at" timestamp,
	"records_processed" integer DEFAULT 0,
	"error_message" text,
	"error_details" jsonb,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "uploaded_assets" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" varchar NOT NULL,
	"adset_id" varchar,
	"index" integer NOT NULL,
	"filename" text NOT NULL,
	"original_filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" integer NOT NULL,
	"duration" integer,
	"width" integer,
	"height" integer,
	"aspect_ratio" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"validation_errors" text[],
	"drive_file_id" text,
	"meta_creative_id" text,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"campaign_settings" jsonb DEFAULT '{}'::jsonb,
	"adset_settings" jsonb DEFAULT '{}'::jsonb,
	"ad_settings" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "user_settings_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;