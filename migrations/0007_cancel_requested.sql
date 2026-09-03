-- Cancellation used to live in an in-memory Set, which never reached the
-- worker: on serverless the request and the worker run in separate instances.
ALTER TABLE "bulk_upload_jobs" ADD COLUMN IF NOT EXISTS "cancel_requested_at" timestamp;
