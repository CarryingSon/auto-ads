import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";

import { db, pool } from "./db.js";
import {
  jobQueue,
  jobQueueAttempts,
  type JobQueue,
} from "../shared/schema.js";

export type QueueStatus = "queued" | "processing" | "retrying" | "completed" | "failed";
export type QueueAttemptDetails = Record<string, unknown>;

export interface LaunchQueuePayload {
  jobId: string;
  userId: string;
  adAccountId: string;
  campaignId?: string | null;
  campaignName?: string | null;
  adSetName?: string | null;
  copyOverrides?: Record<string, any> | null;
  creativeEnhancements?: any;
  disabledAdSetIds?: string[];
  campaignSettings: Record<string, any>;
  adSetSettings: Record<string, any>;
  adSettings: Record<string, any>;
  effectiveUploadMode: string;
  useSinglePerCombination: boolean;
  isScheduled: boolean;
  scheduledAt?: string | null;
  jobAdsets: any[];
  assets: any[];
  extractedAds: any[];
  pageId?: string;
  pageName?: string | null;
  globalSettingsRecord: any;
}

const DEFAULT_MAX_ATTEMPTS = 3;
const LOCK_WINDOW_MINUTES = 15;
const MONTHLY_COUNTED_STATUSES: QueueStatus[] = ["queued", "processing", "retrying", "completed"];
let ensureQueueTablesPromise: Promise<void> | null = null;

async function ensureQueueTables(): Promise<void> {
  if (!ensureQueueTablesPromise) {
    ensureQueueTablesPromise = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS job_queue (
          id varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
          job_id varchar NOT NULL,
          user_id varchar,
          queue_type text DEFAULT 'launch' NOT NULL,
          status text DEFAULT 'queued' NOT NULL,
          attempts integer DEFAULT 0 NOT NULL,
          max_attempts integer DEFAULT 3 NOT NULL,
          next_run_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
          locked_by text,
          locked_until timestamp,
          payload jsonb NOT NULL,
          last_error text,
          started_at timestamp,
          completed_at timestamp,
          created_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
          updated_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
        );
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS job_queue_attempts (
          id varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
          queue_id varchar NOT NULL,
          attempt_number integer NOT NULL,
          status text NOT NULL,
          error_message text,
          details jsonb,
          created_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
        );
      `);
      await pool.query(`ALTER TABLE job_queue_attempts ADD COLUMN IF NOT EXISTS details jsonb;`);
      await pool.query(`CREATE INDEX IF NOT EXISTS job_queue_status_next_run_idx ON job_queue (status, next_run_at);`);
      await pool.query(`CREATE INDEX IF NOT EXISTS job_queue_job_id_idx ON job_queue (job_id);`);
      await pool.query(`CREATE INDEX IF NOT EXISTS job_queue_locked_until_idx ON job_queue (locked_until);`);
    })().catch((error) => {
      ensureQueueTablesPromise = null;
      throw error;
    });
  }

  await ensureQueueTablesPromise;
}

export async function enqueueLaunchJob(params: {
  jobId: string;
  userId: string;
  payload: LaunchQueuePayload;
  maxAttempts?: number;
}) {
  await ensureQueueTables();

  const [created] = await db
    .insert(jobQueue)
    .values({
      jobId: params.jobId,
      userId: params.userId,
      queueType: "launch",
      status: "queued",
      attempts: 0,
      maxAttempts: params.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
      payload: params.payload as unknown as Record<string, unknown>,
      nextRunAt: new Date(),
    })
    .returning();

  return created;
}

export async function enqueueLaunchJobWithMonthlyQuotaGuard(params: {
  jobId: string;
  userId: string;
  payload: LaunchQueuePayload;
  monthStart: Date;
  monthEnd: Date;
  monthlyLimit: number;
  maxAttempts?: number;
}): Promise<{
  created: JobQueue | null;
  used: number;
  limitReached: boolean;
}> {
  await ensureQueueTables();

  return db.transaction(async (tx) => {
    // Serialize quota checks per user to prevent concurrent over-enqueue.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${params.userId}))`);

    const [usageRow] = await tx
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(jobQueue)
      .where(
        and(
          eq(jobQueue.userId, params.userId),
          inArray(jobQueue.status, MONTHLY_COUNTED_STATUSES),
          gte(jobQueue.createdAt, params.monthStart),
          lt(jobQueue.createdAt, params.monthEnd),
        ),
      );

    const used = Number(usageRow?.count || 0);
    if (used >= params.monthlyLimit) {
      return {
        created: null,
        used,
        limitReached: true,
      };
    }

    const [created] = await tx
      .insert(jobQueue)
      .values({
        jobId: params.jobId,
        userId: params.userId,
        queueType: "launch",
        status: "queued",
        attempts: 0,
        maxAttempts: params.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
        payload: params.payload as unknown as Record<string, unknown>,
        nextRunAt: new Date(),
      })
      .returning();

    return {
      created,
      used: used + 1,
      limitReached: false,
    };
  });
}

export async function claimLaunchQueueItems(workerId: string, limit = 1): Promise<JobQueue[]> {
  await ensureQueueTables();

  const rawResult = await db.execute<{ id: string }>(sql`
    WITH candidate AS (
      SELECT id
      FROM job_queue
      WHERE queue_type = 'launch'
        AND status IN ('queued', 'retrying')
        AND next_run_at <= NOW()
        AND (locked_until IS NULL OR locked_until < NOW())
      ORDER BY created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    )
    UPDATE job_queue AS q
    SET
      status = 'processing',
      attempts = q.attempts + 1,
      locked_by = ${workerId},
      locked_until = NOW() + (${LOCK_WINDOW_MINUTES} * INTERVAL '1 minute'),
      started_at = COALESCE(q.started_at, NOW()),
      updated_at = NOW()
    FROM candidate
    WHERE q.id = candidate.id
    RETURNING q.id;
  `);

  const claimedIds = rawResult.rows.map((row) => row.id);
  if (claimedIds.length === 0) {
    return [];
  }

  const claimedRows = await db
    .select()
    .from(jobQueue)
    .where(inArray(jobQueue.id, claimedIds))
    .orderBy(asc(jobQueue.createdAt));

  for (const row of claimedRows) {
    await recordAttempt(row.id, row.attempts, "processing", undefined, {
      jobId: row.jobId,
      userId: row.userId,
      workerId,
      lockedUntil: row.lockedUntil?.toISOString?.() ?? row.lockedUntil,
    });
  }

  return claimedRows;
}

export async function completeQueueItem(queueId: string, details: QueueAttemptDetails = {}): Promise<void> {
  await ensureQueueTables();

  await db
    .update(jobQueue)
    .set({
      status: "completed",
      completedAt: new Date(),
      lockedBy: null,
      lockedUntil: null,
      updatedAt: new Date(),
      lastError: null,
    })
    .where(eq(jobQueue.id, queueId));

  const latest = await getQueueItemById(queueId);
  if (latest) {
    await recordAttempt(queueId, latest.attempts, "completed", undefined, {
      jobId: latest.jobId,
      ...details,
    });
  }
}

export async function failOrRetryQueueItem(queueId: string, errorMessage: string, details: QueueAttemptDetails = {}): Promise<{
  status: "retrying" | "failed";
  attempts: number;
  nextRunAt: Date | null;
}> {
  await ensureQueueTables();

  const current = await getQueueItemById(queueId);
  if (!current) {
    throw new Error(`Queue item not found: ${queueId}`);
  }

  const attempts = current.attempts;
  const shouldRetry = attempts < current.maxAttempts;
  const backoffSeconds = Math.min(300, 15 * Math.pow(2, Math.max(0, attempts - 1)));
  const nextRunAt = shouldRetry ? new Date(Date.now() + backoffSeconds * 1000) : null;
  const status: "retrying" | "failed" = shouldRetry ? "retrying" : "failed";

  await db
    .update(jobQueue)
    .set({
      status,
      attempts,
      nextRunAt: nextRunAt ?? current.nextRunAt,
      lockedBy: null,
      lockedUntil: null,
      updatedAt: new Date(),
      lastError: errorMessage.slice(0, 4000),
      completedAt: shouldRetry ? null : new Date(),
    })
    .where(eq(jobQueue.id, queueId));

  await recordAttempt(queueId, attempts, status, errorMessage, {
    jobId: current.jobId,
    userId: current.userId,
    willRetry: shouldRetry,
    nextRunAt: nextRunAt?.toISOString() ?? null,
    ...details,
  });
  return { status, attempts, nextRunAt };
}

export async function markQueueFailed(queueId: string, errorMessage: string, details: QueueAttemptDetails = {}): Promise<void> {
  await ensureQueueTables();

  const current = await getQueueItemById(queueId);
  if (!current) return;

  await db
    .update(jobQueue)
    .set({
      status: "failed",
      lockedBy: null,
      lockedUntil: null,
      updatedAt: new Date(),
      lastError: errorMessage.slice(0, 4000),
      completedAt: new Date(),
    })
    .where(eq(jobQueue.id, queueId));

  await recordAttempt(queueId, current.attempts, "failed", errorMessage, {
    jobId: current.jobId,
    userId: current.userId,
    ...details,
  });
}

export async function getLatestQueueForJob(jobId: string) {
  await ensureQueueTables();

  const [row] = await db
    .select()
    .from(jobQueue)
    .where(eq(jobQueue.jobId, jobId))
    .orderBy(desc(jobQueue.createdAt))
    .limit(1);
  return row ?? null;
}

export async function getQueueItemById(queueId: string) {
  await ensureQueueTables();

  const [row] = await db
    .select()
    .from(jobQueue)
    .where(eq(jobQueue.id, queueId))
    .limit(1);
  return row;
}

async function recordAttempt(
  queueId: string,
  attemptNumber: number,
  status: "processing" | "completed" | "retrying" | "failed",
  errorMessage?: string,
  details?: QueueAttemptDetails,
) {
  await ensureQueueTables();

  await db.insert(jobQueueAttempts).values({
    queueId,
    attemptNumber,
    status,
    errorMessage: errorMessage?.slice(0, 4000),
    details,
  });
}

export async function clearQueueForJob(jobId: string): Promise<void> {
  await ensureQueueTables();

  await db
    .delete(jobQueue)
    .where(and(eq(jobQueue.jobId, jobId), inArray(jobQueue.status, ["queued", "retrying"])));
}
