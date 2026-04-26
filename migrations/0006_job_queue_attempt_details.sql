ALTER TABLE "job_queue_attempts" ADD COLUMN IF NOT EXISTS "details" jsonb;
