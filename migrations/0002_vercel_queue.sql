CREATE TABLE "job_queue" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" varchar NOT NULL,
	"user_id" varchar,
	"queue_type" text DEFAULT 'launch' NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"next_run_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"locked_by" text,
	"locked_until" timestamp,
	"payload" jsonb NOT NULL,
	"last_error" text,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_queue_attempts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"queue_id" varchar NOT NULL,
	"attempt_number" integer NOT NULL,
	"status" text NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX "job_queue_status_next_run_idx" ON "job_queue" USING btree ("status","next_run_at");
--> statement-breakpoint
CREATE INDEX "job_queue_job_id_idx" ON "job_queue" USING btree ("job_id");
--> statement-breakpoint
CREATE INDEX "job_queue_locked_until_idx" ON "job_queue" USING btree ("locked_until");
