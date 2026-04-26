# Vercel Observability Runbook

This app now writes launch diagnostics in three places:

- `bulk_upload_jobs.logs`: compact strings used by the UI activity feed.
- `job_logs`: structured per-job events with `level`, `message`, `adset_id`, and JSON `details`.
- Vercel runtime logs: structured JSON lines for request lifecycle and launch worker events.

## What To Check First

1. In the app database, inspect `job_logs` for the failing `job_id`.
2. Check `job_queue_attempts.details` for retry/fail metadata such as `workerId`, `durationMs`, `assetCount`, and `nextRunAt`.
3. Use Vercel runtime logs for request-level failures when they are available.

## Useful Queries

```sql
SELECT created_at, level, message, details
FROM job_logs
WHERE job_id = '<job-id>'
ORDER BY created_at ASC;
```

```sql
SELECT attempt_number, status, error_message, details, created_at
FROM job_queue_attempts
WHERE queue_id = '<queue-id>'
ORDER BY created_at ASC;
```

```sql
SELECT id, status, attempts, max_attempts, last_error, locked_by, locked_until, updated_at
FROM job_queue
WHERE job_id = '<job-id>'
ORDER BY created_at DESC;
```

## Vercel Log Drain

Configure a Vercel Log Drain in the Vercel dashboard so runtime logs persist outside Vercel's short retention window:

1. Open Vercel dashboard for `auto-ads`.
2. Go to Settings -> Log Drains.
3. Add the chosen destination, such as Datadog, Axiom, New Relic, Better Stack, or a custom HTTPS endpoint.
4. Filter/search for JSON fields like `source: "bulk-ads"`, `jobId`, `queueId`, `event`, and `errorMessage`.

Recommended saved searches:

- `source:bulk-ads event:video_upload_failed`
- `source:bulk-ads event:launch_no_ads_created`
- `source:express statusCode:500`
- `source:bulk-ads message:"Worker will retry launch job"`
