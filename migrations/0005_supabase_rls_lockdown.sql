-- Supabase security baseline hardening:
-- 1) enable RLS on public tables that are exposed to PostgREST
-- 2) revoke broad anon/authenticated grants on existing + future objects
-- This app uses a server-side DB connection, so anon/authenticated API access
-- should be denied unless explicit policies/grants are added later.

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'ad_account_settings',
    'ad_copy_overrides',
    'adsets',
    'billing_payments',
    'billing_subscriptions',
    'bulk_upload_jobs',
    'connections',
    'conversations',
    'docx_uploads',
    'extracted_ads',
    'global_settings',
    'google_drive_links',
    'job_logs',
    'job_queue',
    'job_queue_attempts',
    'launch_schedules',
    'messages',
    'meta_account_cache',
    'meta_ads',
    'meta_adsets',
    'meta_assets',
    'meta_campaigns',
    'meta_insights',
    'meta_objects',
    'oauth_connections',
    'oauth_states',
    'session',
    'sync_logs',
    'uploaded_assets',
    'user_settings',
    'users'
  ] LOOP
    EXECUTE format('ALTER TABLE IF EXISTS public.%I ENABLE ROW LEVEL SECURITY;', table_name);
  END LOOP;
END
$$;

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM authenticated;

REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM authenticated;

REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM anon;
REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM authenticated;
