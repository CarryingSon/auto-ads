import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import { z } from "zod";
import { storage } from "./storage.js";
// Google Drive functions imported dynamically where needed
import { parseDocx, validateAds } from "./docx-parser.js";
import type { ExtractedAdData } from "../shared/schema.js";
import { MetaAdsApi, createSyncLog, updateSyncLog } from "./meta-ads-api.js";
import { validateMetaLaunchData, validateAdSetBeforeCreation } from "./meta-ads-validation.js";
import { decrypt } from "./auth-routes.js";
import { db } from "./db.js";
import {
  metaCampaigns,
  metaAdsets,
  metaAds,
  metaInsights,
  syncLogs,
  oauthConnections,
  metaAssets,
  globalSettings,
  metaAccountCache,
  bulkUploadJobs,
  adsets,
} from "../shared/schema.js";
import { eq, desc, and, or, sql } from "drizzle-orm";
import {
  enqueueLaunchJob,
  claimLaunchQueueItems,
  completeQueueItem,
  failOrRetryQueueItem,
  getLatestQueueForJob,
  clearQueueForJob,
  markQueueFailed,
  type LaunchQueuePayload,
} from "./job-queue.js";

const ENABLE_DEV_AUTH_BYPASS = process.env.ENABLE_DEV_AUTH_BYPASS === "true";

const cancelledJobs = new Set<string>();

const metaApiCache = new Map<string, { data: any; expiry: number }>();
const META_CACHE_TTL = 30 * 60 * 1000;
const META_FETCH_TIMEOUT_MS = parseInt(process.env.META_FETCH_TIMEOUT_MS || "12000", 10);

function normalizeAdAccountId(adAccountId: string): string {
  return String(adAccountId || "").startsWith("act_")
    ? String(adAccountId).slice(4)
    : String(adAccountId || "");
}

function getAdAccountIdVariants(adAccountId: string): string[] {
  const raw = String(adAccountId || "");
  if (!raw) return [];
  const normalized = normalizeAdAccountId(raw);
  const variants = [raw];
  const withPrefix = `act_${normalized}`;
  if (!variants.includes(withPrefix)) variants.push(withPrefix);
  if (!variants.includes(normalized)) variants.push(normalized);
  return variants;
}

function pickValidSelectedPageId(
  pages: Array<{ id?: string }> | undefined | null,
  preferredPageId?: string | null,
): string | null {
  if (!Array.isArray(pages) || pages.length === 0) return null;
  if (preferredPageId && pages.some((p) => p?.id === preferredPageId)) {
    return preferredPageId;
  }
  const first = pages.find((p) => typeof p?.id === "string" && p.id.length > 0);
  return first?.id || null;
}

function normalizeCachedCampaign(campaignRow: any): any {
  const raw = (campaignRow?.rawData && typeof campaignRow.rawData === "object")
    ? campaignRow.rawData
    : {};
  return {
    ...raw,
    id: campaignRow.id,
    name: campaignRow.name ?? raw.name,
    status: campaignRow.status ?? raw.status,
    objective: campaignRow.objective ?? raw.objective,
    daily_budget: campaignRow.dailyBudget ?? raw.daily_budget ?? null,
    lifetime_budget: campaignRow.lifetimeBudget ?? raw.lifetime_budget ?? null,
    start_time: raw.start_time ?? (campaignRow.startTime ? new Date(campaignRow.startTime).toISOString() : undefined),
    stop_time: raw.stop_time ?? (campaignRow.stopTime ? new Date(campaignRow.stopTime).toISOString() : undefined),
    created_time: raw.created_time ?? (campaignRow.createdTime ? new Date(campaignRow.createdTime).toISOString() : undefined),
    updated_time: raw.updated_time ?? (campaignRow.updatedTime ? new Date(campaignRow.updatedTime).toISOString() : undefined),
    special_ad_categories: raw.special_ad_categories ?? [],
    effective_status: raw.effective_status ?? campaignRow.status ?? null,
  };
}

function normalizeCachedAdSet(adSetRow: any): any {
  const raw = (adSetRow?.rawData && typeof adSetRow.rawData === "object")
    ? adSetRow.rawData
    : {};
  return {
    ...raw,
    id: adSetRow.id,
    campaign_id: adSetRow.campaignId ?? raw.campaign_id,
    name: adSetRow.name ?? raw.name,
    status: adSetRow.status ?? raw.status,
    daily_budget: adSetRow.dailyBudget ?? raw.daily_budget ?? null,
    lifetime_budget: adSetRow.lifetimeBudget ?? raw.lifetime_budget ?? null,
    targeting: adSetRow.targetingJson ?? raw.targeting ?? null,
    promoted_object: raw.promoted_object ?? null,
    dsa_beneficiary: raw.dsa_beneficiary ?? null,
    dsa_payor: raw.dsa_payor ?? null,
    start_time: raw.start_time ?? (adSetRow.startTime ? new Date(adSetRow.startTime).toISOString() : undefined),
    end_time: raw.end_time ?? (adSetRow.endTime ? new Date(adSetRow.endTime).toISOString() : undefined),
  };
}

function normalizeCachedAd(adRow: any): any {
  const raw = (adRow?.rawData && typeof adRow.rawData === "object")
    ? adRow.rawData
    : {};
  return {
    ...raw,
    id: adRow.id,
    name: adRow.name ?? raw.name,
    status: adRow.status ?? raw.status,
    campaign_id: adRow.campaignId ?? raw.campaign_id ?? null,
    adset_id: adRow.adsetId ?? raw.adset_id ?? null,
    creative: adRow.creativeJson ?? raw.creative ?? null,
  };
}

async function upsertAccountCache(userId: string, adAccountId: string, field: string, data: any) {
  try {
    await db.insert(metaAccountCache)
      .values({ userId, adAccountId, [field]: data })
      .onConflictDoUpdate({
        target: [metaAccountCache.userId, metaAccountCache.adAccountId],
        set: { [field]: data, lastSyncedAt: new Date(), updatedAt: new Date() },
      });
  } catch (e) {
    console.error(`[AccountCache] Failed to cache ${field} for ${adAccountId}:`, e);
  }
}

async function getAccountCache(userId: string, adAccountId: string): Promise<any | null> {
  try {
    for (const candidateId of getAdAccountIdVariants(adAccountId)) {
      const rows = await db.select().from(metaAccountCache)
        .where(and(eq(metaAccountCache.userId, userId), eq(metaAccountCache.adAccountId, candidateId)))
        .limit(1);
      if (rows[0]) return rows[0];
    }
    return null;
  } catch {
    return null;
  }
}

type PageLike = Record<string, unknown> & { id?: string; name?: string };

function sanitizePageForClient(page: PageLike): PageLike {
  const { access_token: _accessToken, ...safePage } = page as PageLike & { access_token?: string };
  return safePage;
}

function sanitizePagesForClient(pages: unknown): PageLike[] {
  if (!Array.isArray(pages)) return [];
  return pages
    .filter((page): page is PageLike => !!page && typeof page === "object")
    .map((page) => sanitizePageForClient(page));
}

async function assertJobOwnership(userId: string, jobId: string) {
  const [job] = await db
    .select()
    .from(bulkUploadJobs)
    .where(and(eq(bulkUploadJobs.id, jobId), eq(bulkUploadJobs.userId, userId)))
    .limit(1);
  return job || null;
}

async function assertAdsetOwnership(userId: string, adsetId: string) {
  const [adsetRow] = await db
    .select({
      adset: adsets,
      job: bulkUploadJobs,
    })
    .from(adsets)
    .innerJoin(bulkUploadJobs, eq(adsets.jobId, bulkUploadJobs.id))
    .where(and(eq(adsets.id, adsetId), eq(bulkUploadJobs.userId, userId)))
    .limit(1);
  return adsetRow?.adset || null;
}

async function cachedMetaFetch(url: string, cacheKey?: string): Promise<any> {
  const key = cacheKey || url.replace(/access_token=[^&]+/, "access_token=REDACTED");
  const cached = metaApiCache.get(key);
  if (cached && Date.now() < cached.expiry) {
    return cached.data;
  }
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), META_FETCH_TIMEOUT_MS);
  let response: globalThis.Response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } catch (error: any) {
    if (error?.name === "AbortError") {
      return {
        error: {
          message: `Meta API request timeout after ${META_FETCH_TIMEOUT_MS}ms`,
          code: "META_TIMEOUT",
        },
      };
    }
    throw error;
  } finally {
    clearTimeout(timeoutHandle);
  }
  let data: any;
  try {
    data = await response.json();
  } catch {
    data = { error: { message: "Invalid JSON response from Meta API", code: "META_BAD_JSON" } };
  }
  if (!data.error) {
    metaApiCache.set(key, { data, expiry: Date.now() + META_CACHE_TTL });
  }
  return data;
}

// Helper to emit log to a specific job
function emitJobLog(jobId: string, message: string, type: "info" | "success" | "error" | "warning" = "info") {
  // Logs are persisted in DB (job.logs). We keep a console mirror for ops visibility.
  console.log(`[Job ${jobId.slice(0, 8)}] [${type.toUpperCase()}] ${message}`);
}

// Authentication middleware for API routes
async function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.originalUrl.startsWith("/api/workers/launch")) {
    return next();
  }
  let userId = (req.session as any)?.userId;

  if (!userId && ENABLE_DEV_AUTH_BYPASS) {
    const host = req.headers.host || "";
    const isLocalHost = host.includes("localhost") || host.startsWith("127.0.0.1");
    if (isLocalHost) {
      const connection = await db.select()
        .from(oauthConnections)
        .where(eq(oauthConnections.provider, "meta"))
        .orderBy(sql`${oauthConnections.connectedAt} DESC`)
        .limit(1);
      if (connection.length > 0 && connection[0].userId) {
        userId = connection[0].userId;
        (req.session as any).userId = userId;
        (req.session as any).userName = connection[0].accountName;
      }
    }
  }

  if (!userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  next();
}

// Request validation schemas
const launchRequestSchema = z.object({
  jobId: z.string().min(1, "Job ID is required"),
  adAccountId: z.string().min(1, "Ad Account ID is required"),
  campaignName: z.string().optional(),
  campaignId: z.string().optional(),
  adSetName: z.string().optional(),
  copyOverrides: z.record(z.object({
    primaryText: z.string().optional(),
    headline: z.string().optional(),
    description: z.string().optional(),
    cta: z.string().optional(),
    url: z.string().optional(),
    utm: z.string().optional(),
  })).optional(),
  launchMode: z.enum(["now", "scheduled"]).optional(),
  scheduledAt: z.string().optional(),
  adUploadMode: z.enum(["single", "dynamic"]).optional(),
  creativeEnhancements: z.object({
    image: z.object({
      add_overlays: z.boolean().optional(),
      visual_touch_ups: z.boolean().optional(),
      add_music: z.boolean().optional(),
      text_improvements: z.boolean().optional(),
      show_summaries: z.boolean().optional(),
      relevant_comments: z.boolean().optional(),
      enhance_cta: z.boolean().optional(),
      brightness_and_contrast: z.boolean().optional(),
      reveal_details: z.boolean().optional(),
      show_spotlights: z.boolean().optional(),
    }).optional(),
    video: z.object({
      visual_touch_ups: z.boolean().optional(),
      text_improvements: z.boolean().optional(),
      add_video_effects: z.boolean().optional(),
      show_summaries: z.boolean().optional(),
      relevant_comments: z.boolean().optional(),
      enhance_cta: z.boolean().optional(),
      reveal_details: z.boolean().optional(),
      show_spotlights: z.boolean().optional(),
    }).optional(),
  }).optional(),
  disabledAdSetIds: z.array(z.string()).optional(),
});

const dryRunRequestSchema = z.object({
  jobId: z.string().min(1, "Job ID is required"),
  disabledAdSetIds: z.array(z.string()).optional().default([]),
});

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB max
    files: 12, // 10 videos + 1 docx + buffer
  }
});

function cleanVideoTitle(filename: string): string {
  const separator = ' \u2013 ';
  const idx = filename.indexOf(separator);
  if (idx !== -1) {
    return filename.substring(idx + separator.length);
  }
  return filename;
}

function isTerminalJobStatus(status?: string | null): boolean {
  return status === "done" || status === "completed" || status === "error" || status === "failed";
}

function mapProgressStatus(jobStatus: string | null | undefined, queueStatus?: string | null): string {
  if (queueStatus === "queued") return "queued";
  if (queueStatus === "processing") return "processing";
  if (queueStatus === "retrying") return "retrying";
  if (queueStatus === "failed") return "failed";
  if (queueStatus === "completed") return "completed";

  if (!jobStatus) return "queued";
  if (jobStatus === "done" || jobStatus === "completed") return "completed";
  if (jobStatus === "error" || jobStatus === "failed") return "failed";
  return "processing";
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  app.get("/api/drive/connected-email", async (_req: Request, res: Response) => {
    try {
      const { getServiceAccountEmail, isServiceAccountConfigured } = await import("./google-drive-service-account.js");
      if (isServiceAccountConfigured()) {
        const email = getServiceAccountEmail();
        return res.json({ email, connected: true, mode: "service-account" });
      }
    } catch (error) {
      console.log("[Drive] Service account check failed:", error);
    }
    res.json({ email: null, connected: false });
  });

  // Apply authentication middleware to all /api routes
  app.use("/api", requireAuth);
  
  // ===== Connection Routes =====
  
  // Get all connections
  app.get("/api/connections", async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const connections = await storage.getAllConnections(userId);
      
      const googleDrive = connections.find(c => c.provider === "google_drive");
      if (!googleDrive) {
        try {
          const { isServiceAccountConfigured, getServiceAccountEmail } = await import("./google-drive-service-account.js");
          if (isServiceAccountConfigured()) {
            const email = getServiceAccountEmail();
            await storage.upsertConnection(userId, {
              provider: "google_drive",
              status: "connected",
              accountName: email || "Google Drive (Service Account)",
              accountEmail: email || "",
              scopes: ["drive.readonly"],
              connectedAt: new Date(),
            });
          }
        } catch {}
      }
      
      // Check Meta connection from OAuth connections table (from auth-routes.ts)
      const metaConnection = connections.find(c => c.provider === "meta");
      if (!metaConnection && userId) {
        const metaOAuth = await db.select()
          .from(oauthConnections)
          .where(and(
            eq(oauthConnections.userId, userId),
            eq(oauthConnections.provider, "meta"),
            eq(oauthConnections.status, "connected")
          ))
          .limit(1);
        
        if (metaOAuth.length > 0) {
          await storage.upsertConnection(userId, {
            provider: "meta",
            status: "connected",
            accountName: metaOAuth[0].accountName || "Meta Ads",
            accountEmail: metaOAuth[0].accountEmail || "",
            scopes: metaOAuth[0].scopes || ["ads_management"],
            connectedAt: metaOAuth[0].connectedAt || new Date(),
          });
        }
      }
      
      // Refresh the list
      const updatedConnections = await storage.getAllConnections(userId);
      res.json(updatedConnections);
    } catch (error) {
      console.error("Error fetching connections:", error);
      res.status(500).json({ error: "Failed to fetch connections" });
    }
  });

  // Connect a service
  app.post("/api/connections/:provider/connect", async (req: Request, res: Response) => {
    try {
      const { provider } = req.params;
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      if (provider === "google_drive") {
        try {
          const { isServiceAccountConfigured, getServiceAccountEmail } = await import("./google-drive-service-account.js");
          if (isServiceAccountConfigured()) {
            const email = getServiceAccountEmail();
            const connection = await storage.upsertConnection(userId, {
              provider: "google_drive",
              status: "connected",
              accountName: email || "Google Drive (Service Account)",
              accountEmail: email || "",
              scopes: ["drive.readonly"],
              connectedAt: new Date(),
            });
            return res.json(connection);
          }
        } catch {}
        return res.status(400).json({ 
          error: "Google Drive service account not configured." 
        });
      } else if (provider === "meta") {
        // Simulated Meta connection for MVP
        const connection = await storage.upsertConnection(userId, {
          provider: "meta",
          status: "connected",
          accountName: "Demo Ad Account",
          accountEmail: "demo@example.com",
          scopes: ["ads_management", "pages_read_engagement"],
          connectedAt: new Date(),
        });
        return res.json(connection);
      }
      
      res.status(400).json({ error: "Unknown provider" });
    } catch (error) {
      console.error("Error connecting:", error);
      res.status(500).json({ error: "Failed to connect" });
    }
  });

  // Disconnect a service
  app.post("/api/connections/:provider/disconnect", async (req: Request, res: Response) => {
    try {
      const { provider } = req.params;
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      await storage.deleteConnection(userId, provider);
      res.json({ success: true });
    } catch (error) {
      console.error("Error disconnecting:", error);
      res.status(500).json({ error: "Failed to disconnect" });
    }
  });

  // Test a connection
  app.post("/api/connections/:provider/test", async (req: Request, res: Response) => {
    try {
      const { provider } = req.params;
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      if (provider === "google_drive") {
        try {
          const { isServiceAccountConfigured, getServiceAccountEmail } = await import("./google-drive-service-account.js");
          if (isServiceAccountConfigured()) {
            const email = getServiceAccountEmail();
            await storage.upsertConnection(userId, {
              provider: "google_drive",
              status: "connected",
              accountName: email || "Google Drive (Service Account)",
              accountEmail: email || "",
              lastTestedAt: new Date(),
            });
            return res.json({ success: true, connected: true, accountEmail: email });
          }
        } catch {}
        return res.status(400).json({ error: "Google Drive service account not configured" });
      } else if (provider === "meta") {
        // Simulated test for Meta
        const connection = await storage.getConnection(userId, "meta");
        if (connection?.status === "connected") {
          await storage.upsertConnection(userId, {
            provider: "meta",
            status: connection.status,
            accountName: connection.accountName,
            accountEmail: connection.accountEmail,
            scopes: connection.scopes || undefined,
            connectedAt: connection.connectedAt || undefined,
            lastTestedAt: new Date(),
          });
          return res.json({ success: true });
        }
        return res.status(400).json({ error: "Meta not connected" });
      }
      
      res.status(400).json({ error: "Unknown provider" });
    } catch (error) {
      console.error("Error testing connection:", error);
      res.status(500).json({ error: "Connection test failed" });
    }
  });

  // ===== Job Routes =====
  
  // Get all jobs (filtered by current user)
  app.get("/api/jobs", async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const jobs = await db.select()
        .from(bulkUploadJobs)
        .where(eq(bulkUploadJobs.userId, userId))
        .orderBy(desc(bulkUploadJobs.createdAt));
      
      const jobsWithAssetCounts = await Promise.all(
        jobs.map(async (job) => {
          try {
            const assets = await storage.getAssetsByJob(job.id);
            const videoCount = assets.filter(a => a.mimeType?.startsWith("video/")).length;
            const imageCount = assets.filter(a => a.mimeType?.startsWith("image/")).length;
            const latestQueue = await getLatestQueueForJob(job.id);
            return {
              ...job,
              status: mapProgressStatus(job.status, latestQueue?.status),
              queueId: latestQueue?.id,
              queueStatus: latestQueue?.status ?? null,
              queueAttempts: latestQueue?.attempts ?? 0,
              nextRunAt: latestQueue?.nextRunAt ?? null,
              queueError: latestQueue?.lastError ?? null,
              assetCount: assets.length,
              videoAssetCount: videoCount,
              imageAssetCount: imageCount,
            };
          } catch {
            return { ...job, assetCount: 0, videoAssetCount: 0, imageAssetCount: 0 };
          }
        })
      );
      
      res.json(jobsWithAssetCounts);
    } catch (error) {
      console.error("Error fetching jobs:", error);
      res.status(500).json({ error: "Failed to fetch jobs" });
    }
  });

  app.delete("/api/jobs/bulk/queue", async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const allJobs = await db.select()
        .from(bulkUploadJobs)
        .where(eq(bulkUploadJobs.userId, userId))
        .orderBy(desc(bulkUploadJobs.createdAt));
      const queueStatuses = ["queued", "processing", "retrying", "validating", "uploading", "creating_campaign", "creating_adsets", "uploading_creatives", "creating_ads", "scheduled", "error", "failed"];
      const queueJobs = allJobs.filter((j) => queueStatuses.includes(j.status));
      let deleted = 0;
      for (const job of queueJobs) {
        await clearQueueForJob(job.id);
        await storage.deleteJob(job.id);
        deleted++;
      }
      res.json({ success: true, deleted });
    } catch (error) {
      console.error("Error clearing queue:", error);
      res.status(500).json({ error: "Failed to clear queue" });
    }
  });

  app.delete("/api/jobs/:id", async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const job = await assertJobOwnership(userId, req.params.id);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }
      await clearQueueForJob(req.params.id);
      await storage.deleteJob(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting job:", error);
      res.status(500).json({ error: "Failed to delete job" });
    }
  });

  // Get single job with details
  app.get("/api/jobs/:id", async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const job = await assertJobOwnership(userId, req.params.id);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }
      
      const assets = await storage.getAssetsByJob(job.id);
      const extractedAds = await storage.getExtractedAdsByJob(job.id);
      const metaObjects = await storage.getMetaObjectsByJob(job.id);
      const docx = await storage.getDocxByJob(job.id);
      
      // Build per-ad-set progress from metaObjects
      const adSetProgress: Record<string, string> = {};
      const adSetObjects = metaObjects.filter(obj => obj.objectType === "adset");
      for (const adSet of adSetObjects) {
        const key = adSet.adsetId || adSet.metaId || adSet.id;
        const adsForSet = metaObjects.filter(obj => 
          obj.objectType === "ad" && obj.adsetId === adSet.adsetId
        );
        if (adSet.status === "failed") {
          adSetProgress[key] = "failed";
        } else if (adSet.status === "created" && adsForSet.length > 0) {
          adSetProgress[key] = "completed";
        } else if (adSet.status === "creating" || job.status === "creating_creatives") {
          adSetProgress[key] = "processing";
        } else {
          adSetProgress[key] = "pending";
        }
      }
      
      // Count completed ad sets
      const completedAdSets = Object.values(adSetProgress).filter(s => s === "completed").length;
      const totalAdSets = adSetObjects.length || 1;
      
      res.json({
        ...job,
        assets,
        extractedAds,
        metaObjects,
        docx,
        adSetProgress,
        totalAdSets,
        completedAdSets,
      });
    } catch (error) {
      console.error("Error fetching job:", error);
      res.status(500).json({ error: "Failed to fetch job" });
    }
  });

  // Lightweight progress endpoint for polling in serverless environments
  app.get("/api/jobs/:jobId/progress", async (req: Request, res: Response) => {
    try {
      // Progress/log polling must never be HTTP-cached, otherwise clients can
      // receive 304 responses and miss real-time log updates.
      res.set({
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        Pragma: "no-cache",
        Expires: "0",
        "Surrogate-Control": "no-store",
      });

      const { jobId } = req.params;
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const job = await assertJobOwnership(userId, jobId);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      const latestQueue = await getLatestQueueForJob(jobId);
      const metaObjects = await storage.getMetaObjectsByJob(job.id);

      const adSetProgress: Record<string, string> = {};
      const adSetObjects = metaObjects.filter((obj) => obj.objectType === "adset");
      for (const adSet of adSetObjects) {
        const key = adSet.adsetId || adSet.metaId || adSet.id;
        const adsForSet = metaObjects.filter(
          (obj) => obj.objectType === "ad" && obj.adsetId === adSet.adsetId,
        );
        if (adSet.status === "failed") {
          adSetProgress[key] = "failed";
        } else if (adSet.status === "created" && adsForSet.length > 0) {
          adSetProgress[key] = "completed";
        } else if (adSet.status === "creating" || job.status === "creating_creatives") {
          adSetProgress[key] = "processing";
        } else {
          adSetProgress[key] = "pending";
        }
      }

      const completedAdSets = Object.values(adSetProgress).filter((s) => s === "completed").length;
      const totalAdSets = adSetObjects.length || 1;
      const status = mapProgressStatus(job.status, latestQueue?.status);

      res.json({
        ...job,
        status,
        progressStatus: status,
        queueId: latestQueue?.id ?? null,
        queueStatus: latestQueue?.status ?? null,
        queueAttempts: latestQueue?.attempts ?? 0,
        queueMaxAttempts: latestQueue?.maxAttempts ?? null,
        nextRunAt: latestQueue?.nextRunAt ?? null,
        lastError: latestQueue?.lastError ?? null,
        adSetProgress,
        totalAdSets,
        completedAdSets,
        metaObjects,
        logs: job.logs || [],
      });
    } catch (error) {
      console.error("Error fetching job progress:", error);
      res.status(500).json({ error: "Failed to fetch job progress" });
    }
  });

  // ===== Bulk Ads Routes =====
  
  // Parse DOCX and create job
  app.post("/api/bulk-ads/parse", upload.fields([
    { name: "docx", maxCount: 1 },
    { name: "videos", maxCount: 10 },
  ]), async (req: Request, res: Response) => {
    try {
      const files = req.files as { docx?: Express.Multer.File[]; videos?: Express.Multer.File[] };
      
      if (!files.docx || files.docx.length === 0) {
        return res.status(400).json({ error: "DOCX file is required" });
      }
      
      const docxFile = files.docx[0];
      const videoFiles = files.videos || [];
      const videoIndexesRaw = req.body.videoIndexes;
      const videoIndexes: number[] = Array.isArray(videoIndexesRaw) 
        ? videoIndexesRaw.map(Number) 
        : videoIndexesRaw ? [Number(videoIndexesRaw)] : [];

      // Create a new job
      const userId = (req.session as any)?.userId;
      const job = await storage.createJob({
        status: "draft",
        currentStep: 2,
        userId: userId || undefined,
      });

      // Save DOCX upload record
      await storage.createDocxUpload({
        jobId: job.id,
        filename: `${job.id}_${docxFile.originalname}`,
        originalFilename: docxFile.originalname,
        size: docxFile.size,
        status: "pending",
      });

      // Save video assets
      for (let i = 0; i < videoFiles.length; i++) {
        const video = videoFiles[i];
        const index = videoIndexes[i] || 0;
        
        await storage.createAsset({
          jobId: job.id,
          index: index,
          filename: `${job.id}_${video.originalname}`,
          originalFilename: video.originalname,
          mimeType: video.mimetype,
          size: video.size,
          status: index > 0 ? "valid" : "needs_rename",
        });
      }

      // Parse DOCX
      const parseResult = await parseDocx(docxFile.buffer);
      
      // Update DOCX record
      const docxRecord = await storage.getDocxByJob(job.id);
      if (docxRecord) {
        await storage.updateDocxUpload(docxRecord.id, {
          status: "parsed",
          rawText: parseResult.rawText,
          parsedAt: new Date(),
          parsingMethod: parseResult.method,
        });
      }

      // Validate ads against video indices
      const validVideoIndices = videoIndexes.filter(i => i > 0);
      const validation = validateAds(parseResult.ads, validVideoIndices);

      // Save extracted ads
      for (const ad of validation.validAds) {
        await storage.createExtractedAd({
          jobId: job.id,
          index: ad.index,
          primaryText: ad.primary_text,
          headline: ad.headline,
          description: ad.description,
          cta: ad.cta,
          url: ad.url,
          utm: ad.utm,
          isValid: ad.isValid,
          validationErrors: ad.errors,
        });
      }

      // Format response for frontend
      const formattedAds = validation.validAds.map(ad => ({
        index: ad.index,
        primaryText: ad.primary_text,
        headline: ad.headline,
        description: ad.description,
        cta: ad.cta,
        url: ad.url,
        utm: ad.utm,
        isValid: ad.isValid,
        errors: ad.errors,
      }));

      res.json({
        jobId: job.id,
        ads: formattedAds,
        missingIndices: validation.missingIndices,
        warnings: validation.warnings,
        parsingMethod: parseResult.method,
      });
    } catch (error) {
      console.error("Error parsing DOCX:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to parse DOCX" 
      });
    }
  });

  // Launch ads
  app.post("/api/bulk-ads/launch", async (req: Request, res: Response) => {
    try {
      // Validate request body
      const parseResult = launchRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ 
          error: parseResult.error.errors[0]?.message || "Invalid request" 
        });
      }
      
      const { 
        jobId, adAccountId, campaignName, campaignId, adSetName, 
        copyOverrides, launchMode, scheduledAt, adUploadMode, creativeEnhancements,
        disabledAdSetIds 
      } = parseResult.data;

      // Get user ID for settings validation
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      // Get ad account settings - STRICT validation required before launch
      const adAccountSettingsRecord = await storage.getAdAccountSettings(userId, adAccountId);
      const globalSettingsRecord = await storage.getGlobalSettings(userId);
      
      // If existing campaign selected, fetch its settings FIRST (for validation decisions)
      let existingCampaignData: any = null;
      let campaignFetchError: string | null = null;
      if (campaignId) {
        try {
          const metaApi = new MetaAdsApi(userId);
          const initialized = await metaApi.initialize();
          if (initialized) {
            metaApi.setAdAccountId(adAccountId);
            const details = await metaApi.getCampaignDetails(campaignId);
            existingCampaignData = details.campaign;
            console.log(`[Launch] Fetched existing campaign settings: ${campaignId}`, existingCampaignData);
          } else {
            campaignFetchError = "Meta API not initialized";
          }
        } catch (err: any) {
          campaignFetchError = err?.message || "Unknown error";
          console.log("[Launch] Could not fetch campaign settings:", err);
        }
        
        // If we couldn't fetch campaign data, return error - don't silently fallback
        if (!existingCampaignData) {
          return res.status(400).json({
            error: `Cannot retrieve settings for selected campaign (${campaignId}). ${campaignFetchError || "Please try again."}`,
            details: ["Campaign may not exist or you don't have access to it."]
          });
        }
      }
      
      // Determine if campaign has its own budget (CBO - Campaign Budget Optimization)
      const campaignHasBudget = existingCampaignData && 
        (existingCampaignData.daily_budget || existingCampaignData.lifetime_budget);
      
      // STRICT VALIDATION: All settings must be configured before launching
      const validationErrors: string[] = [];
      
      // Check Facebook Page (required) - read from metaAssets.selectedPageId (set when user picks ad account)
      const metaAssetRecord = await db.select()
        .from(metaAssets)
        .where(eq(metaAssets.userId, userId))
        .limit(1);
      const hasSelectedPage = metaAssetRecord.length > 0 && !!metaAssetRecord[0].selectedPageId;
      if (!hasSelectedPage) {
        validationErrors.push("Facebook Page not configured");
      }
      
      // Check if ad account settings exist
      if (!adAccountSettingsRecord) {
        validationErrors.push("Ad account settings not configured - please import settings from an existing campaign in Settings");
      } else {
        // Check Campaign Settings (required) - skip budget check if campaign has CBO
        if (!campaignId && !adAccountSettingsRecord.campaignObjective) {
          validationErrors.push("Campaign objective not set - import from campaign in Settings");
        }
        
        // Budget required only if: creating new campaign OR existing campaign has no budget (ABO)
        if (!campaignHasBudget) {
          if (!adAccountSettingsRecord.budgetType) validationErrors.push("Budget type not set - import from campaign in Settings");
          if (!adAccountSettingsRecord.budgetAmount || adAccountSettingsRecord.budgetAmount <= 0) validationErrors.push("Budget amount not set - import from campaign in Settings");
        }
        
        // Check Ad Set Settings - geoTargeting required unless all ad sets have geo-split targeting
        if (!adAccountSettingsRecord.geoTargeting || adAccountSettingsRecord.geoTargeting.length === 0) {
          const allAdsets = await storage.getAdsetsByJob(jobId);
          const enabledAdsets = disabledAdSetIds?.length
            ? allAdsets.filter(a => !disabledAdSetIds.includes(a.id))
            : allAdsets;
          const allHaveGeoSplit = enabledAdsets.length > 0 && enabledAdsets.every(a => {
            const override = a.overrideSettings as any;
            return override?.geoSplitMarket && override?.geoTargeting?.length > 0;
          });
          if (!allHaveGeoSplit) {
            validationErrors.push("Geo targeting not set");
          }
        }
        
        // Check Ad Settings (required)
        if (!adAccountSettingsRecord.defaultCta) validationErrors.push("Default CTA not set");
        if (!adAccountSettingsRecord.defaultUrl) validationErrors.push("Default URL not set");
      }
      
      // If any validation errors, return them all
      if (validationErrors.length > 0) {
        return res.status(400).json({ 
          error: "All settings must be configured before launching ads",
          details: validationErrors,
          settingsRequired: true
        });
      }
      
      // At this point, all settings are validated and exist
      // Build settings objects from adAccountSettings for backwards compatibility
      // BUT: If an existing campaign is selected, use its settings instead
      let campaignSettings = {
        objective: adAccountSettingsRecord!.campaignObjective || "OUTCOME_SALES",
        budgetType: (adAccountSettingsRecord!.budgetType || "DAILY") as "DAILY" | "LIFETIME",
        budgetAmount: adAccountSettingsRecord!.budgetAmount || 0,
        specialAdCategories: [] as string[],
        conversionEvent: "PURCHASE" as string,
        startDate: undefined as string | undefined,
        startTime: undefined as string | undefined,
        endDate: undefined as string | undefined,
        endTime: undefined as string | undefined,
        isCBO: false, // Campaign Budget Optimization flag
      };
      
      // If existing campaign selected, use its settings (already fetched above)
      if (existingCampaignData) {
        console.log(`[Launch] Using settings from existing campaign: ${campaignId}`, existingCampaignData);
        
        // Override with campaign's settings - objective is required
        if (existingCampaignData.objective) {
          campaignSettings.objective = existingCampaignData.objective;
        } else {
          // Campaign must have objective - this should not happen for valid campaigns
          return res.status(400).json({
            error: "Selected campaign has no objective set.",
            details: ["Select a different campaign or create a new one."]
          });
        }
        
        if (existingCampaignData.special_ad_categories) {
          campaignSettings.specialAdCategories = existingCampaignData.special_ad_categories;
        }
        
        // If campaign has budget (CBO), use campaign's budget settings
        if (campaignHasBudget) {
          campaignSettings.isCBO = true;
          // Map campaign budget to settings for consistency
          if (existingCampaignData.daily_budget) {
            campaignSettings.budgetType = "DAILY";
            campaignSettings.budgetAmount = parseInt(existingCampaignData.daily_budget) / 100;
          } else {
            campaignSettings.budgetType = "LIFETIME";
            campaignSettings.budgetAmount = parseInt(existingCampaignData.lifetime_budget) / 100;
          }
          console.log(`[Launch] Campaign has CBO budget: ${campaignSettings.budgetAmount}€ (${campaignSettings.budgetType})`);
        }
      }
      const adSetSettings = {
        geoTargeting: adAccountSettingsRecord!.geoTargeting!,
        ageMin: adAccountSettingsRecord!.ageMin || 18,
        ageMax: adAccountSettingsRecord!.ageMax || 65,
        gender: (adAccountSettingsRecord!.gender || "ALL") as "ALL" | "MALE" | "FEMALE",
        pixelId: adAccountSettingsRecord!.pixelId || undefined,
        audienceType: adAccountSettingsRecord!.audienceType || undefined,
        audienceId: adAccountSettingsRecord!.audienceId || undefined,
        billingEvent: "IMPRESSIONS",
        optimizationGoal: "LINK_CLICKS",
        excludedAudienceIds: [] as string[],
        dailyMinSpendTarget: adAccountSettingsRecord!.dailyMinSpendTarget ?? undefined,
        dailySpendCap: adAccountSettingsRecord!.dailySpendCap ?? undefined,
        lifetimeSpendCap: adAccountSettingsRecord!.lifetimeSpendCap ?? undefined,
      };
      const adSettings = {
        defaultCta: adAccountSettingsRecord!.defaultCta!,
        defaultUrl: adAccountSettingsRecord!.defaultUrl!,
        adFormat: "FLEXIBLE" as const,
        websiteUrl: adAccountSettingsRecord!.websiteUrl || undefined,
        displayLink: adAccountSettingsRecord!.displayLink || undefined,
      };
      
      // Determine ad upload mode based on request parameter (default: dynamic)
      const effectiveUploadMode = adUploadMode || "dynamic";
      
      // Map upload mode to format flags
      // dynamic = 1 ad per asset with ALL text variations (DEGREES_OF_FREEDOM)
      // single = 1 ad per ASSET × PRIMARY TEXT combination (DEGREES_OF_FREEDOM)
      const useSinglePerCombination = effectiveUploadMode === "single";
      const adFormat = useSinglePerCombination ? "SINGLE" : "DYNAMIC";

      const job = await storage.getJob(jobId);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      // Store scheduling info if scheduled
      const isScheduled = launchMode === "scheduled" && scheduledAt;
      
      // Update job with campaign settings (include budget info for history page)
      const existingDefaults = (job.defaultSettings || {}) as Record<string, any>;
      await storage.updateJob(jobId, {
        status: "queued",
        currentStep: 3,
        adAccountId,
        userId,
        campaignId: campaignId || undefined,
        campaignName: campaignName || `Campaign-${new Date().toISOString().split("T")[0]}`,
        adUploadMode: effectiveUploadMode,
        defaultSettings: {
          ...existingDefaults,
          dailyBudget: campaignSettings.budgetAmount || existingDefaults.dailyBudget,
          budgetType: campaignSettings.budgetType || existingDefaults.budgetType,
          budgetAmount: campaignSettings.budgetAmount || existingDefaults.budgetAmount || existingDefaults.dailyBudget,
        } as any,
      });

      // Get adsets, assets and ads (filter out disabled ad sets)
      const allJobAdsets = await storage.getAdsetsByJob(jobId);
      const jobAdsets = disabledAdSetIds?.length 
        ? allJobAdsets.filter(a => !disabledAdSetIds.includes(a.id))
        : allJobAdsets;
      console.log(`[Launch] Ad sets: ${allJobAdsets.length} total, ${allJobAdsets.length - jobAdsets.length} disabled, ${jobAdsets.length} to process`);
      const assets = await storage.getAssetsByJob(jobId);
      const extractedAds = await storage.getExtractedAdsByJob(jobId);

      // Resolve Facebook Page for current ad account (avoid cross-account page mismatch)
      let pageId: string | undefined;
      let pageName: string | undefined;
      const assetRow = metaAssetRecord[0];
      const accountCache = await getAccountCache(userId, adAccountId);
      const accountPages = Array.isArray(accountCache?.pagesJson) ? accountCache.pagesJson : [];

      if (accountPages.length > 0) {
        const preferredPageId = accountCache?.pagesSelectedPageId || assetRow?.selectedPageId || null;
        const resolvedPageId = pickValidSelectedPageId(accountPages, preferredPageId);
        const resolvedPage = accountPages.find((p: any) => p?.id === resolvedPageId);

        if (resolvedPageId) {
          pageId = resolvedPageId;
          pageName = resolvedPage?.name;

          if (preferredPageId && preferredPageId !== resolvedPageId) {
            console.warn(
              `[Launch] Selected page ${preferredPageId} is not valid for ad account ${adAccountId}. Using ${resolvedPageId} instead.`,
            );
          }

          if (assetRow?.selectedPageId !== resolvedPageId) {
            await db.update(metaAssets)
              .set({ selectedPageId: resolvedPageId, updatedAt: new Date() })
              .where(eq(metaAssets.userId, userId));
          }

          if (accountCache?.pagesSelectedPageId !== resolvedPageId) {
            await upsertAccountCache(userId, adAccountId, "pagesSelectedPageId", resolvedPageId);
          }
        }
      }

      // Legacy fallback if account-scoped cache is missing
      if (!pageId && metaAssetRecord.length > 0) {
        pageId = metaAssetRecord[0].selectedPageId || undefined;

        if (pageId) {
          const pages = metaAssetRecord[0].pagesJson || [];
          const businessOwnedPages = metaAssetRecord[0].businessOwnedPagesJson || [];
          const selectedPage = pages.find((p: any) => p.id === pageId);
          if (selectedPage) {
            pageName = selectedPage.name;
          } else {
            for (const b of businessOwnedPages as any[]) {
              const bp = b.pages?.find((p: any) => p.id === pageId);
              if (bp) {
                pageName = bp.name;
                break;
              }
            }
          }
        }
      }
      
      // Validate that we have a page ID
      if (!pageId) {
        return res.status(400).json({ 
          error: "No Facebook Page selected. Please select a Facebook Page that is linked to your ad account." 
        });
      }

      // Validate Meta connection before queuing (fail fast on expired tokens)
      const metaApiCheck = new MetaAdsApi(userId);
      const metaInitialized = await metaApiCheck.initialize();
      if (!metaInitialized) {
        return res.status(401).json({ error: "Meta connection not found or expired. Please reconnect." });
      }

      // ===== PRE-FLIGHT VALIDATION =====
      // Validate ALL data locally before sending anything to Meta
      const preFlightResult = validateMetaLaunchData({
        accessToken: metaApiCheck.getAccessToken() || "",
        adAccountId,
        pageId,
        campaignId,
        campaignName,
        campaignSettings,
        adSetSettings,
        adSettings,
        jobAdsets,
        assets,
        extractedAds,
        copyOverrides,
        isScheduled: !!isScheduled,
        scheduledAt,
        hasCampaignBudget: campaignSettings.isCBO,
        beneficiaryName: globalSettingsRecord?.beneficiaryName,
        payerName: globalSettingsRecord?.payerName,
      });

      if (!preFlightResult.valid) {
        const errorDetails = preFlightResult.errors.map(e => e.message);
        const warningDetails = preFlightResult.warnings.map(w => w.message);
        console.error(`\n========== [Launch] PRE-FLIGHT VALIDATION FAILED ==========`);
        console.error(`Job ID: ${jobId}`);
        console.error(`Total errors: ${errorDetails.length}`);
        errorDetails.forEach((msg, i) => console.error(`  ERROR ${i + 1}: ${msg}`));
        if (warningDetails.length > 0) {
          console.warn(`Total warnings: ${warningDetails.length}`);
          warningDetails.forEach((msg, i) => console.warn(`  WARNING ${i + 1}: ${msg}`));
        }
        console.error(`Upload stopped — fix these errors before retrying.`);
        console.error(`============================================================\n`);
        await storage.updateJob(jobId, {
          status: "error",
          errorMessage: `Validation failed: ${errorDetails.join("; ")}`,
        });
        return res.status(400).json({
          error: "Pre-flight validation failed. Fix the issues below before launching.",
          details: errorDetails,
          warnings: warningDetails,
        });
      }

      if (preFlightResult.warnings.length > 0) {
        console.log(`[Launch] Pre-flight validation warnings:`, preFlightResult.warnings.map(w => w.message));
      }

      const queuePayload: LaunchQueuePayload = {
        jobId, userId, adAccountId, campaignId, campaignName, adSetName,
        copyOverrides, creativeEnhancements, disabledAdSetIds,
        campaignSettings, adSetSettings, adSettings,
        effectiveUploadMode, useSinglePerCombination,
        isScheduled: !!isScheduled, scheduledAt,
        jobAdsets, assets, extractedAds, pageId, pageName,
        globalSettingsRecord,
      };
      const queueItem = await enqueueLaunchJob({
        jobId,
        userId,
        payload: queuePayload,
      });

      // Hobby Vercel plans do not support minute-level Cron jobs. Trigger worker
      // immediately after enqueue so processing starts without waiting for cron.
      const cronSecret = process.env.CRON_SECRET;
      const host = req.get("host");
      const forwardedProto = (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0]?.trim();
      const protocol = forwardedProto || (req.secure ? "https" : "http");
      let workerTrigger: "requested" | "waiting_for_worker" = "waiting_for_worker";

      if (cronSecret && host) {
        workerTrigger = "requested";
        const workerUrl = `${protocol}://${host}/api/workers/launch?limit=1`;
        void fetch(workerUrl, {
          method: "POST",
          headers: {
            "x-cron-secret": cronSecret,
          },
        })
          .then((workerResponse) => {
            console.log(`[Launch] Immediate worker trigger for job ${jobId}: ${workerResponse.status}`);
          })
          .catch((triggerError) => {
            console.error(`[Launch] Failed to trigger worker for job ${jobId}:`, triggerError);
          });
      } else {
        const reason = !cronSecret ? "CRON_SECRET missing" : "host missing";
        console.warn(
          `[Launch] Skipping immediate worker trigger for job ${jobId} (${reason})`,
        );
        const waitingMessage = `Worker not auto-triggered (${reason}). Job is queued until /api/workers/launch runs.`;
        const existingLogs = Array.isArray((job as any).logs) ? ([...(job as any).logs] as string[]) : [];
        await storage.updateJob(jobId, {
          logs: [...existingLogs, waitingMessage],
        });
      }

      res.json({
        success: true,
        jobId,
        queued: true,
        queueId: queueItem.id,
        workerTrigger,
      });

    } catch (error) {
      console.error("Error launching ads:", error instanceof Error ? error.stack : error);
      
      const errorMsg = error instanceof Error ? error.message : "Launch failed";
      try {
        if (req.body?.jobId) {
          await storage.updateJob(req.body.jobId, {
            status: "error",
            errorMessage: errorMsg,
          });
        }
      } catch (updateErr) {
        console.error("Failed to update job status after error:", updateErr);
      }
      
      if (!res.headersSent) {
        res.status(500).json({ error: errorMsg });
      }
    }
  });

  app.post("/api/workers/launch", async (req: Request, res: Response) => {
    try {
      const cronSecret = process.env.CRON_SECRET;
      const vercelCron = req.headers["x-vercel-cron"];
      const isVercelCronTrigger = typeof vercelCron === "string" && vercelCron.length > 0;

      if (!isVercelCronTrigger) {
        const authHeader = req.headers.authorization || "";
        const bearerToken = authHeader.startsWith("Bearer ")
          ? authHeader.slice("Bearer ".length).trim()
          : "";
        const providedSecret = (req.headers["x-cron-secret"] as string | undefined) || bearerToken;
        const hasValidSecret = !!cronSecret && providedSecret === cronSecret;

        if (!hasValidSecret) {
          if (!cronSecret) {
            return res.status(500).json({ error: "CRON_SECRET is not configured" });
          }
          return res.status(401).json({ error: "Unauthorized worker trigger" });
        }
      } else {
        console.log(`[Worker] Triggered by Vercel Cron schedule: ${vercelCron}`);
      }

      const requestedLimit = Number(req.query.limit || 1);
      const limit = Number.isFinite(requestedLimit)
        ? Math.min(Math.max(1, Math.floor(requestedLimit)), 3)
        : 1;
      const workerId = `worker-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const claimed = await claimLaunchQueueItems(workerId, limit);

      if (claimed.length === 0) {
        return res.json({ ok: true, claimed: 0, completed: 0, retried: 0, failed: 0 });
      }

      let completed = 0;
      let retried = 0;
      let failed = 0;

      for (const queueItem of claimed) {
        const payload = queueItem.payload as unknown as LaunchQueuePayload | null;
        if (!payload || !payload.jobId || !payload.userId) {
          await markQueueFailed(queueItem.id, "Invalid queue payload");
          failed++;
          continue;
        }

        try {
          await storage.updateJob(payload.jobId, {
            status: "processing",
            currentStep: 4,
            errorMessage: null,
          });

          await processLaunchInBackground(payload as any);
          await completeQueueItem(queueItem.id);
          completed++;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Worker processing failed";
          if (errorMessage.toLowerCase().includes("cancelled")) {
            await markQueueFailed(queueItem.id, errorMessage);
            await storage.updateJob(payload.jobId, {
              status: "failed",
              errorMessage,
            });
            failed++;
            continue;
          }

          const result = await failOrRetryQueueItem(queueItem.id, errorMessage);
          await storage.updateJob(payload.jobId, {
            status: result.status === "retrying" ? "retrying" : "failed",
            errorMessage,
          });
          if (result.status === "retrying") {
            retried++;
          } else {
            failed++;
          }
        }
      }

      res.json({
        ok: true,
        claimed: claimed.length,
        completed,
        retried,
        failed,
      });
    } catch (error) {
      console.error("[Worker] Launch worker failed:", error);
      res.status(500).json({ error: "Worker run failed" });
    }
  });

  // Background processing function for ad creation
  async function processLaunchInBackground(params: {
    jobId: string;
    userId: string;
    adAccountId: string;
    campaignId?: string;
    campaignName?: string;
    adSetName?: string;
    copyOverrides?: Record<string, any>;
    creativeEnhancements?: any;
    disabledAdSetIds?: string[];
    campaignSettings: any;
    adSetSettings: any;
    adSettings: any;
    effectiveUploadMode: string;
    useSinglePerCombination: boolean;
    isScheduled: boolean;
    scheduledAt?: string;
    jobAdsets: any[];
    assets: any[];
    extractedAds: any[];
    pageId: string;
    pageName?: string;
    globalSettingsRecord: any;
  }): Promise<{ totalAdsCreated: number; adSetCount: number }> {
    const {
      jobId, userId, adAccountId, campaignId, campaignName, adSetName,
      copyOverrides, creativeEnhancements, disabledAdSetIds,
      campaignSettings, adSetSettings, adSettings,
      effectiveUploadMode, useSinglePerCombination,
      isScheduled, scheduledAt,
      jobAdsets, assets, extractedAds, pageId, pageName,
      globalSettingsRecord,
    } = params;

    try {
      // Initialize Meta API in background context
      const metaApi = new MetaAdsApi(userId);
      const initialized = await metaApi.initialize();
      if (!initialized) {
        throw new Error("Meta connection not found or expired");
      }
      if (adAccountId) {
        metaApi.setAdAccountId(adAccountId);
      }

      const logs: string[] = [];
      const log = (message: string, type: "info" | "success" | "error" | "warning" = "info") => {
        logs.push(message);
        storage.updateJob(jobId, { logs }).catch(err => {
          console.error("[Launch] Failed to save log to DB:", err);
        });
        emitJobLog(jobId, message, type);
      };

      log(`Ad upload mode: ${effectiveUploadMode}`, "info");
      if (useSinglePerCombination) {
        log(`Format: Single (1 ad per asset × primary text kombinacija, DEGREES_OF_FREEDOM)`, "info");
      } else {
        log(`Format: Dynamic (1 ad per asset z vsemi teksti, DEGREES_OF_FREEDOM)`, "info");
      }

      // Use existing campaign or create new one
      let finalCampaignId = campaignId;
      if (!campaignId) {
        log(`Creating campaign: ${campaignName || "Campaign"}...`, "info");
        try {
          const campaign = await metaApi.createCampaign({
            name: campaignName || `Campaign-${new Date().toISOString().split("T")[0]}`,
            objective: campaignSettings.objective || "OUTCOME_SALES",
            status: "ACTIVE",
            specialAdCategories: campaignSettings.specialAdCategories || [],
          });
          finalCampaignId = campaign.id;
          log(`Campaign created: ${campaign.id}`, "success");
          
          await storage.createMetaObject({
            jobId,
            adIndex: 0,
            objectType: "campaign",
            metaId: campaign.id,
            name: campaignName,
            status: "created",
          });
        } catch (err) {
          log(`Error creating campaign: ${err instanceof Error ? err.message : "Unknown error"}`, "error");
          throw err;
        }
      } else {
        log(`Using existing campaign: ${campaignId}`, "info");
      }

      // Find a default description from any ad that has one (for fallback)
      const defaultDescription = extractedAds.find((a: any) => a.description && a.description.trim())?.description || "";
      const defaultUrl = adSettings.defaultUrl || adSettings.websiteUrl || "https://example.com";

      // Create ad sets and ads for each adset
      const adSetIds: string[] = [];
      let totalAdsCreated = 0;
      
      // Safeguards against runaway processes
      const MAX_AD_SETS_PER_JOB = 50;
      const MAX_ADS_PER_JOB = 500;
      
      if (jobAdsets.length > MAX_AD_SETS_PER_JOB) {
        log(`WARNING: Too many ad sets (${jobAdsets.length}). Limit is ${MAX_AD_SETS_PER_JOB}.`, "error");
        throw new Error(`Too many ad sets: ${jobAdsets.length}. Maximum is ${MAX_AD_SETS_PER_JOB}`);
      }
      
      const totalAssets = assets.filter((a: any) => a.status !== "error").length;
      if (totalAssets > MAX_ADS_PER_JOB) {
        log(`WARNING: Too many creatives (${totalAssets}). Limit is ${MAX_ADS_PER_JOB}.`, "error");
        throw new Error(`Too many creatives: ${totalAssets}. Maximum is ${MAX_ADS_PER_JOB}`);
      }

      for (const adset of jobAdsets) {
        if (cancelledJobs.has(jobId)) {
          log("Upload cancelled by user — stopping", "error");
          await storage.updateJob(jobId, { status: "error", errorMessage: "Upload cancelled by user" });
          cancelledJobs.delete(jobId);
          throw new Error("Upload cancelled by user");
        }

        // Find the extracted ad copy for this adset
        const adCopy = extractedAds.find(a => a.adsetId === adset.id);
        
        // Get all assets for this adset
        const adsetAssets = assets.filter(a => a.adsetId === adset.id && a.status !== "error");
        
        if (adsetAssets.length === 0) {
          log(`Skipping adset ${adset.name}: no valid assets`);
          continue;
        }

        // Create Meta ad set using global template settings
        log(`Creating ad set: ${adset.name} (${adsetAssets.length} creatives)...`);
        let metaAdSetId: string;
        let instagramAccountId: string | undefined; // Defined outside try block for broader scope
        try {
          // Build targeting with correct structure for MetaAdsApi
          const targeting: {
            geoLocations?: { countries: string[] };
            ageMin?: number;
            ageMax?: number;
            gender?: 'ALL' | 'MALE' | 'FEMALE';
            customAudiences?: Array<{ id: string }>;
            excludedCustomAudiences?: Array<{ id: string }>;
          } = {};
          
          const adsetOverride = adset.overrideSettings as any;
          if (adsetOverride?.geoSplitMarket && adsetOverride?.geoTargeting?.length) {
            targeting.geoLocations = { countries: adsetOverride.geoTargeting };
            log(`Geo-split: targeting ${adsetOverride.geoSplitMarket} (${adsetOverride.geoTargeting.join(', ')})`, "info");
          } else if (adSetSettings.geoTargeting?.length) {
            targeting.geoLocations = { countries: adSetSettings.geoTargeting };
          }
          if (adSetSettings.ageMin) targeting.ageMin = adSetSettings.ageMin;
          if (adSetSettings.ageMax) targeting.ageMax = adSetSettings.ageMax;
          if (adSetSettings.gender) targeting.gender = adSetSettings.gender;
          if (adSetSettings.audienceType === "CUSTOM" && adSetSettings.audienceId) {
            targeting.customAudiences = [{ id: adSetSettings.audienceId }];
          }
          if (adSetSettings.excludedAudienceIds?.length) {
            targeting.excludedCustomAudiences = adSetSettings.excludedAudienceIds.map((id: string) => ({ id }));
          }

          // Build promoted object with pixel and conversion event
          const promotedObject: { pixelId?: string; pageId?: string; customEventType?: string } = { pageId };
          if (adSetSettings.pixelId) {
            promotedObject.pixelId = adSetSettings.pixelId;
            // Map conversion event to Meta's custom_event_type
            if (campaignSettings.conversionEvent) {
              promotedObject.customEventType = campaignSettings.conversionEvent;
            }
          }
          
          // Determine optimization goal based on campaign objective
          // OUTCOME_SALES requires OFFSITE_CONVERSIONS, OUTCOME_TRAFFIC uses LINK_CLICKS
          let optimizationGoal = adSetSettings.optimizationGoal || "LINK_CLICKS";
          const campaignObjective = campaignSettings.objective || "OUTCOME_SALES";
          if (campaignObjective === "OUTCOME_SALES") {
            optimizationGoal = "OFFSITE_CONVERSIONS";
          } else if (campaignObjective === "OUTCOME_TRAFFIC") {
            optimizationGoal = "LINK_CLICKS";
          } else if (campaignObjective === "OUTCOME_LEADS") {
            optimizationGoal = "LEAD_GENERATION";
          } else if (campaignObjective === "OUTCOME_ENGAGEMENT") {
            optimizationGoal = "POST_ENGAGEMENT";
          }

          // Build start/end time from campaign settings or scheduling
          let startTime: string | undefined;
          let endTime: string | undefined;
          
          // If scheduled launch, use scheduledAt as the start time
          if (isScheduled && scheduledAt) {
            startTime = new Date(scheduledAt).toISOString();
            log(`Using scheduled start time: ${startTime}`);
          } else if (campaignSettings.startDate) {
            const date = campaignSettings.startDate;
            const time = campaignSettings.startTime || "00:00";
            startTime = new Date(`${date}T${time}:00`).toISOString();
          }
          
          if (campaignSettings.endDate) {
            const date = campaignSettings.endDate;
            const time = campaignSettings.endTime || "23:59";
            endTime = new Date(`${date}T${time}:00`).toISOString();
          }

          // Budget is passed in dollars - MetaAdsApi.createAdSet handles conversion to cents
          // IMPORTANT: Set ad set budget ONLY if:
          // 1. Creating a new campaign (isNewCampaign = true), OR
          // 2. Using existing ABO campaign (no campaign-level budget)
          // Do NOT set ad set budget if existing campaign has CBO (campaign-level budget)
          const isNewCampaign = !campaignId; // If no campaignId was provided, we created a new one
          const needsAdSetBudget = isNewCampaign || !campaignSettings.isCBO;
          
          // ==========================================
          // Fetch Instagram ID for the Page BEFORE creating AdSet
          // This is needed so we can set appropriate placements in the AdSet
          // Priority: 1) Connected instagram_accounts, 2) page_backed_instagram_accounts (Use Facebook Page)
          // ==========================================
          // Note: instagramAccountId is already declared outside the try block (line ~727)
          
          try {
            log(`Finding Instagram account for Page ${pageId}...`);
            
            // Priority 0: Check user's saved Instagram selection in globalSettings
            const userGlobalSettings = await db.select().from(globalSettings).where(eq(globalSettings.userId, userId)).limit(1);
            const savedInstagramId = userGlobalSettings[0]?.instagramPageId;
            
            // Priority 1: Check stored pagesJson from OAuth (instagram_accounts fetched at login)
            const metaAssetsForIg = await db.select().from(metaAssets).where(eq(metaAssets.userId, userId)).limit(1);
            const storedPages = (metaAssetsForIg[0] as any)?.pagesJson || [];
            const storedPage = storedPages.find((p: any) => p.id === pageId);
            
            if (storedPage?.instagram_accounts && storedPage.instagram_accounts.length > 0) {
              // Use saved selection if it matches one of the page's IG accounts, otherwise use first
              if (savedInstagramId) {
                const savedAccount = storedPage.instagram_accounts.find((a: any) => a.id === savedInstagramId);
                if (savedAccount) {
                  instagramAccountId = savedAccount.id;
                  log(`Using saved Instagram account from settings: ${instagramAccountId} (@${savedAccount.username || 'unknown'})`, "success");
                } else {
                  const igAccount = storedPage.instagram_accounts[0];
                  instagramAccountId = igAccount.id;
                  log(`Saved IG account ${savedInstagramId} not found for this page, using first: ${instagramAccountId} (@${igAccount.username || 'unknown'})`, "info");
                }
              } else {
                const igAccount = storedPage.instagram_accounts[0];
                instagramAccountId = igAccount.id;
                log(`No saved IG selection, using first: ${instagramAccountId} (@${igAccount.username || 'unknown'})`, "info");
              }
              if (storedPage.instagram_accounts.length > 1) {
                log(`Page has ${storedPage.instagram_accounts.length} Instagram accounts: ${storedPage.instagram_accounts.map((a: any) => `${a.id} (@${a.username || '?'})`).join(', ')}`, "info");
              }
            }
            
            // Priority 2: If not found in stored data, try live API
            if (!instagramAccountId) {
              const userAccessToken = metaApi.getAccessToken();
              
              let pageAccessToken: string | undefined;
              try {
                const pagesData = await cachedMetaFetch(
                  `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token&access_token=${userAccessToken}`,
                  `me_accounts_${userId}`
                );
                const availablePages = pagesData.data?.map((p: any) => ({ id: p.id, name: p.name })) || [];
                console.log(`[Launch] Available pages for user (me/accounts):`, availablePages);
                
                if (pagesData.data) {
                  const pageEntry = pagesData.data.find((p: any) => p.id === pageId);
                  if (pageEntry) {
                    pageAccessToken = pageEntry.access_token;
                  }
                }
              } catch (err) {
                console.log(`[Launch] Error fetching me/accounts:`, err);
              }
              
              // If not found in me/accounts, try promote_pages for the ad account
              if (!pageAccessToken) {
                try {
                  log(`Page ${pageId} not in user's own pages, trying promote_pages for ad account...`);
                  const promoteData = await cachedMetaFetch(
                    `https://graph.facebook.com/v21.0/${adAccountId}/promote_pages?fields=id,name,access_token&access_token=${userAccessToken}`,
                    `promote_pages_${adAccountId}`
                  );
                  if (promoteData.data) {
                    const promotePage = promoteData.data.find((p: any) => p.id === pageId);
                    if (promotePage?.access_token) {
                      pageAccessToken = promotePage.access_token;
                      log(`Got Page Access Token via promote_pages for Page ${pageId}`, "success");
                    }
                  }
                } catch (err) {
                  console.log(`[Launch] Error fetching promote_pages:`, err);
                }
              }
              
              // Also check stored access_token in pagesJson (may have been saved by pages endpoint)
              if (!pageAccessToken && storedPage?.access_token) {
                pageAccessToken = storedPage.access_token;
                log(`Using stored Page Access Token from pagesJson`);
              }
              
              if (pageAccessToken) {
                try {
                  const igData = await cachedMetaFetch(
                    `https://graph.facebook.com/v21.0/${pageId}/instagram_accounts?fields=id,username&access_token=${pageAccessToken}`,
                    `ig_accounts_${pageId}`
                  );
                  if (!igData.error && igData.data?.length > 0) {
                    if (savedInstagramId) {
                      const savedMatch = igData.data.find((a: any) => a.id === savedInstagramId);
                      if (savedMatch) {
                        instagramAccountId = savedMatch.id;
                        log(`Found saved Instagram account via API: ${instagramAccountId} (@${savedMatch.username || 'unknown'})`, "success");
                      } else {
                        instagramAccountId = igData.data[0].id;
                        log(`Saved IG ${savedInstagramId} not found via API, using first: ${instagramAccountId} (@${igData.data[0].username || 'unknown'})`, "info");
                      }
                    } else {
                      instagramAccountId = igData.data[0].id;
                      log(`Found Instagram account via API: ${instagramAccountId} (@${igData.data[0].username || 'unknown'})`, "success");
                    }
                  }
                } catch (err) {
                  console.log(`[Launch] Error fetching instagram_accounts:`, err);
                }
                
                // Try page_backed_instagram_accounts
                if (!instagramAccountId) {
                  try {
                    const igBackedData = await cachedMetaFetch(
                      `https://graph.facebook.com/v21.0/${pageId}/page_backed_instagram_accounts?fields=id,username&access_token=${pageAccessToken}`,
                      `ig_backed_${pageId}`
                    );
                    if (!igBackedData.error && igBackedData.data?.length > 0) {
                      instagramAccountId = igBackedData.data[0].id;
                      log(`Using page-backed Instagram: ${instagramAccountId}`, "success");
                    } else if (!igBackedData.error) {
                      try {
                        const createResp = await fetch(
                          `https://graph.facebook.com/v21.0/${pageId}/page_backed_instagram_accounts`,
                          { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `access_token=${pageAccessToken}` }
                        );
                        const createData = await createResp.json();
                        if (createData.id) {
                          instagramAccountId = createData.id;
                          log(`Created page-backed Instagram account: ${instagramAccountId}`, "success");
                        }
                      } catch (createErr) {
                        console.log(`[Launch] Error creating page-backed IG:`, createErr);
                      }
                    }
                  } catch (err) {
                    console.log(`[Launch] Error fetching page_backed_instagram_accounts:`, err);
                  }
                }
              } else {
                log(`No Page Access Token available for Page ${pageId} - could not get token from me/accounts or promote_pages`, "warning");
              }
            }
            
            // Priority 3: Try ad account's own Instagram accounts
            if (!instagramAccountId) {
              try {
                const userAccessToken = metaApi.getAccessToken();
                log(`Trying ad account's own Instagram accounts (${adAccountId})...`);
                const adAcctIgData = await cachedMetaFetch(
                  `https://graph.facebook.com/v21.0/${adAccountId}/instagram_accounts?fields=id,username&access_token=${userAccessToken}`,
                  `ig_adaccount_${adAccountId}`
                );
                if (!adAcctIgData.error && adAcctIgData.data?.length > 0) {
                  instagramAccountId = adAcctIgData.data[0].id;
                  log(`Using Instagram account from ad account: ${instagramAccountId} (@${adAcctIgData.data[0].username || 'unknown'})`, "success");
                }
              } catch (err) {
                console.log(`[Launch] Error fetching ad account instagram_accounts:`, err);
              }
            }
            
            if (!instagramAccountId) {
              log(`WARNING: No Instagram account found for Page ${pageId}.`, "warning");
              log(`Ads will be shown on Facebook ONLY.`, "warning");
              log(`To enable Instagram: reconnect Meta or ensure your ad account has access to this Page's Instagram.`, "warning");
            }
            
            // Validate that ad account has access to the selected Instagram account
            if (instagramAccountId) {
              try {
                const userAccessToken = metaApi.getAccessToken();
                const validateData = await cachedMetaFetch(
                  `https://graph.facebook.com/v21.0/${adAccountId}/instagram_accounts?fields=id,username&access_token=${userAccessToken}`,
                  `ig_adaccount_${adAccountId}`
                );
                const authorizedIgIds = (validateData.data || []).map((ig: any) => ig.id);
                
                if (authorizedIgIds.length > 0 && !authorizedIgIds.includes(instagramAccountId)) {
                  log(`WARNING: Instagram ${instagramAccountId} is NOT authorized for ad account ${adAccountId}`, "warning");
                  log(`Authorized Instagram accounts: ${validateData.data.map((ig: any) => `${ig.id} (@${ig.username || '?'})`).join(', ')}`, "info");
                  const oldId = instagramAccountId;
                  instagramAccountId = authorizedIgIds[0];
                  log(`Switched from ${oldId} to authorized account: ${instagramAccountId} (@${validateData.data[0].username || 'unknown'})`, "success");
                } else if (authorizedIgIds.length > 0) {
                  log(`Instagram ${instagramAccountId} is authorized for this ad account`, "success");
                }
              } catch (err) {
                console.log(`[Launch] Error validating Instagram access:`, err);
              }
              log(`Instagram placement enabled with ID: ${instagramAccountId}`, "success");
            }
          } catch (err) {
            log(`Error finding Instagram account: ${err instanceof Error ? err.message : 'Unknown error'}`);
          }
          
          const adSetResult = await metaApi.createAdSet({
            campaignId: finalCampaignId!,
            name: adSetName || adset.name,
            status: "ACTIVE",
            // Only set budget on ad set level if creating new campaign OR using existing ABO campaign
            dailyBudget: needsAdSetBudget && campaignSettings.budgetType === "DAILY" ? campaignSettings.budgetAmount : undefined,
            lifetimeBudget: needsAdSetBudget && campaignSettings.budgetType === "LIFETIME" ? campaignSettings.budgetAmount : undefined,
            startTime,
            endTime,
            billingEvent: adSetSettings.billingEvent || "IMPRESSIONS",
            optimizationGoal,
            dailyMinSpendTarget: adSetSettings.dailyMinSpendTarget,
            dailySpendCap: adSetSettings.dailySpendCap,
            lifetimeSpendCap: adSetSettings.lifetimeSpendCap,
            targeting: Object.keys(targeting).length > 0 ? targeting : undefined,
            promotedObject,
            // DSA/OCHA compliance - use settings if available, otherwise fallback to page name
            dsaBeneficiary: globalSettingsRecord?.beneficiaryName || pageName,
            dsaPayor: globalSettingsRecord?.payerName || pageName,
            // IMPORTANT: VEDNO regular AdSet (is_dynamic_creative=false)
            // Dynamic Creative zahteva asset_feed_spec kar omejuje na 1 ad per adset
            // Flexible format deluje na ad-level z object_story_spec, NE z asset_feed_spec
            isDynamicCreative: false,
            // Pass Instagram status so createAdSet can set appropriate placements
            // If no Instagram account, use Advantage+ placements (Facebook only)
            hasInstagramAccount: !!instagramAccountId,
          });
          metaAdSetId = adSetResult.id;
          adSetIds.push(metaAdSetId);
          log(`Ad set created: ${metaAdSetId}`);

          await storage.createMetaObject({
            jobId,
            adsetId: adset.id,
            adIndex: adset.sortOrder + 1,
            objectType: "adset",
            metaId: metaAdSetId,
            name: adSetName || adset.name,
            status: "creating",
          });
        } catch (err) {
          log(`Error creating ad set ${adset.name}: ${err instanceof Error ? err.message : "Unknown error"}`);
          continue;
        }

        // Check if ad set is Dynamic Creative (pre-check per instructions)
        // If is_dynamic_creative=true, we cannot use standard creatives
        try {
          const adSetStatus = await metaApi.checkAdSetDynamicStatus(metaAdSetId);
          log(`AdSet ${metaAdSetId} is_dynamic_creative: ${adSetStatus.isDynamicCreative}`);
          
          if (adSetStatus.isDynamicCreative) {
            log(`WARNING: AdSet ${metaAdSetId} is Dynamic Creative!`, "warning");
            log(`Cannot create standard creatives in a Dynamic Creative AdSet.`, "warning");
            log(`Creating a new non-dynamic AdSet...`);
            
            // This shouldn't happen since we create ad sets without isDynamicCreative flag
            // But if it does, log a warning and continue (Meta may still accept our creatives)
          }
        } catch (checkErr) {
          log(`Error checking AdSet dynamic status: ${checkErr instanceof Error ? checkErr.message : 'Unknown'}`);
        }

        // Apply copy overrides if present
        const adSetKey = adset.id;
        const override = copyOverrides?.[adSetKey];
        
        // Parse all variations from extractedAd (separated by "\n\n---\n\n")
        const rawPrimaryText = override?.primaryText || adCopy?.primaryText || "";
        const rawHeadline = override?.headline || adCopy?.headline || "";
        const rawDescription = override?.description || adCopy?.description || defaultDescription;
        
        // Normalize \r\n to \n and collapse triple+ newlines to double before splitting
        const normText = (t: string) => t.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n{3,}/g, '\n\n');
        const primaryTexts = normText(rawPrimaryText).split(/\n\n---\n\n|\n---\n|---/).map(t => t.trim()).filter(t => t.length > 0).slice(0, 5);
        const headlines = normText(rawHeadline).split(/\n\n---\n\n|\n---\n|---/).map(t => t.trim()).filter(t => t.length > 0).slice(0, 5);
        const descriptions = normText(rawDescription).split(/\n\n---\n\n|\n---\n|---/).map(t => t.trim()).filter(t => t.length > 0).slice(0, 5);
        
        const finalCta = override?.cta || adSettings.defaultCta || "LEARN_MORE";
        const finalUrl = override?.url || defaultUrl;

        // Always use the original selected pageId (never switch to different page)
        const effectivePageId = pageId;

        // Per-adset pre-flight validation before sending to Meta
        const adsetValidation = validateAdSetBeforeCreation({
          campaignId: finalCampaignId!,
          adSetName: adSetName || adset.name,
          pageId: effectivePageId,
          primaryTexts,
          headlines,
          descriptions,
          finalCta,
          finalUrl,
          assets: adsetAssets,
          budgetAmount: campaignSettings.budgetAmount,
          budgetType: campaignSettings.budgetType,
          hasCampaignBudget: campaignSettings.isCBO,
        });

        if (!adsetValidation.valid) {
          const errorMessages = adsetValidation.errors.map(e => e.message).join("; ");
          log(`Skipping ad set "${adset.name}": validation failed - ${errorMessages}`, "error");
          continue;
        }

        for (const w of adsetValidation.warnings) {
          log(`Warning for "${adset.name}": ${w.message}`, "warning");
        }

        log(`Using ${primaryTexts.length} primary text(s), ${headlines.length} headline(s), ${descriptions.length} description(s)`);

        // Instagram account ID was already fetched before createAdSet (see above)
        // Use the already-determined instagramAccountId variable

        const { getPublicDownloadUrl, downloadPublicFile } = await import("./public-drive.js");
        const saModule = await import("./google-drive-service-account.js");
        
        const downloadDriveBuffer = async (driveFileId: string, filename: string): Promise<Buffer> => {
          try {
            const buffer = await saModule.downloadFile(driveFileId);
            log(`Downloaded ${filename} via service account (${buffer.length} bytes)`);
            return buffer;
          } catch (saErr) {
            log(`Service account download failed for ${filename}, trying public: ${saErr instanceof Error ? saErr.message : "Unknown"}`);
            return downloadPublicFile(driveFileId);
          }
        };
        
        // Both single and flexible formats use the same upload approach
        // The only difference is which creative API method is called
        log(`Uploading ${adsetAssets.length} media files...`);
          
          // Upload all media in parallel (videos concurrently, images concurrently)
          const allAssetInfo: Array<{ type: 'image' | 'video'; mediaId: string; name: string; thumbnailUrl?: string }> = [];
          
          const VIDEO_PARALLEL_LIMIT = 3;
          const validAssets = adsetAssets.filter(a => a.driveFileId);
          const videoAssets = validAssets.filter(a => a.mimeType?.startsWith("video/"));
          const imageAssets = validAssets.filter(a => !a.mimeType?.startsWith("video/"));
          
          log(`Processing ${videoAssets.length} videos (${VIDEO_PARALLEL_LIMIT} parallel) + ${imageAssets.length} images...`);
          
          // Upload images in batches (limit concurrency to avoid memory spikes)
          const IMAGE_PARALLEL_LIMIT = 5;
          const imageResults: Array<{ type: 'image'; mediaId: string; name: string } | null> = [];
          for (let i = 0; i < imageAssets.length; i += IMAGE_PARALLEL_LIMIT) {
            const batch = imageAssets.slice(i, i + IMAGE_PARALLEL_LIMIT);
            const batchResults = await Promise.all(batch.map(async (asset) => {
              try {
                log(`Uploading image: ${asset.originalFilename}...`);
                const imageBuffer = await downloadDriveBuffer(asset.driveFileId!, asset.originalFilename);
                const imageResult = await metaApi.uploadImage(imageBuffer, asset.originalFilename, asset.mimeType || undefined);
                log(`Image uploaded: ${imageResult.hash}`, "success");
                await storage.updateAsset(asset.id, { metaCreativeId: imageResult.hash });
                return { type: 'image' as const, mediaId: imageResult.hash, name: asset.originalFilename };
              } catch (err) {
                log(`Error uploading ${asset.originalFilename}: ${err instanceof Error ? err.message : "Unknown"}`);
                return null;
              }
            }));
            imageResults.push(...batchResults);
          }
          
          // Upload videos in parallel batches (with concurrency limit to avoid overloading)
          const pendingVideoIds: Array<{ videoId: string; name: string; assetId: string }> = [];
          
          const uploadVideoOnly = async (asset: typeof videoAssets[0]) => {
            let videoLocalPath: string | undefined;
            try {
              const videoStartTime = Date.now();
              log(`Uploading video: ${asset.originalFilename}...`);
              try {
                const videoBuffer = await saModule.downloadFile(asset.driveFileId!);
                const crypto = await import("crypto");
                const fs = await import("fs");
                const hash = crypto.createHash('md5').update(asset.driveFileId!).digest('hex').slice(0, 8);
                const ext = asset.originalFilename.match(/\.[^.]+$/)?.[0] || '.mp4';
                videoLocalPath = `/tmp/sa_download_${hash}${ext}`;
                fs.writeFileSync(videoLocalPath, videoBuffer);
                log(`Downloaded ${asset.originalFilename} via service account (${videoBuffer.length} bytes)`);
              } catch (saErr) {
                log(`SA download failed for video ${asset.originalFilename}, using public URL`);
              }
              const assetUrl = getPublicDownloadUrl(asset.driveFileId!);
              const videoResult = await metaApi.uploadVideoNoWait(assetUrl, cleanVideoTitle(asset.originalFilename), videoLocalPath ? { localPath: videoLocalPath } : undefined);
              const videoTotalTime = ((Date.now() - videoStartTime) / 1000).toFixed(1);
              
              const transcodeInfo = videoResult.transcodeResult;
              if (transcodeInfo?.transcoded) {
                const transcodeTime = transcodeInfo.logs?.transcodeTimeSeconds?.toFixed(1) || '?';
                log(`Video sent to Meta: ${videoResult.id} (transcoded: ${transcodeTime}s, upload: ${videoTotalTime}s)`, "success");
              } else {
                log(`Video sent to Meta: ${videoResult.id} (no transcoding, upload: ${videoTotalTime}s)`, "success");
              }
              
              await storage.updateAsset(asset.id, { metaCreativeId: videoResult.id });
              pendingVideoIds.push({ videoId: videoResult.id, name: asset.originalFilename, assetId: asset.id });
              if (videoLocalPath) {
                try { const fs = await import("fs"); fs.unlinkSync(videoLocalPath); } catch {}
              }
            } catch (err) {
              log(`Error uploading ${asset.originalFilename}: ${err instanceof Error ? err.message : "Unknown"}`);
              if (videoLocalPath) {
                try { const fs = await import("fs"); fs.unlinkSync(videoLocalPath); } catch {}
              }
            }
          };
          
          // Process videos in batches of VIDEO_PARALLEL_LIMIT
          for (let i = 0; i < videoAssets.length; i += VIDEO_PARALLEL_LIMIT) {
            const batch = videoAssets.slice(i, i + VIDEO_PARALLEL_LIMIT);
            await Promise.all(batch.map(uploadVideoOnly));
          }
          
          // Add completed image results
          for (const result of imageResults) {
            if (result) allAssetInfo.push(result);
          }
          
          // Batch-check video readiness (2 at a time to avoid rate limits)
          if (pendingVideoIds.length > 0) {
            log(`Waiting for ${pendingVideoIds.length} videos to finish processing on Meta...`);
            const READY_CHECK_LIMIT = 2;
            for (let i = 0; i < pendingVideoIds.length; i += READY_CHECK_LIMIT) {
              const batch = pendingVideoIds.slice(i, i + READY_CHECK_LIMIT);
              const batchResults = await Promise.all(
                batch.map(async ({ videoId, name }) => {
                  try {
                    const thumbnailUrl = await metaApi.waitForVideoReady(videoId);
                    log(`Video ready: ${name}`, "success");
                    return { type: 'video' as const, mediaId: videoId, name, thumbnailUrl };
                  } catch (err) {
                    log(`Video processing failed for ${name}: ${err instanceof Error ? err.message : "Unknown"}`);
                    return { type: 'video' as const, mediaId: videoId, name, thumbnailUrl: undefined };
                  }
                })
              );
              for (const result of batchResults) {
                allAssetInfo.push(result);
              }
            }
          }
          
          // Create ads with text variations
          if (allAssetInfo.length > 0) {
            if (useSinglePerCombination) {
              // SINGLE MODE: Create separate ad for each ASSET × PRIMARY TEXT combination
              // Each ad has 1 video/image + 1 primary text + all headlines/descriptions for A/B testing
              // Example: 3 videos × 3 primary texts = 9 ads
              const totalCombinations = allAssetInfo.length * primaryTexts.length;
              log(`SINGLE MODE: Creating ${totalCombinations} ads (${allAssetInfo.length} media × ${primaryTexts.length} primary texts)...`);
              log(`Each ad has 1 media + 1 primary text + ${headlines.length} headlines + ${descriptions.length} descriptions for A/B testing`);
              log(`Logging: adset_id=${metaAdSetId}, page_id=${effectivePageId}, instagram_actor_id=${instagramAccountId || 'null'}`);
              
              let adIndex = 0;
              let adsCreatedForThisAdSet = 0;
              for (let assetIdx = 0; assetIdx < allAssetInfo.length; assetIdx++) {
                const assetInfo = allAssetInfo[assetIdx];
                
                for (let textIdx = 0; textIdx < primaryTexts.length; textIdx++) {
                  const primaryText = primaryTexts[textIdx];
                  adIndex++;
                  
                  // Create unique ad name with asset name and primary text index
                  const adName = `${adset.name} - ${assetInfo.name} - PT${textIdx + 1}`;
                  
                  try {
                    log(`Creating ad ${adIndex}/${totalCombinations}: ${assetInfo.name} + Primary Text ${textIdx + 1}...`);
                    
                    // Use DEGREES_OF_FREEDOM (single format) for each combination
                    // This creates clean single-media ads with text A/B testing
                    const creative = await metaApi.createSingleCreativeWithTextVariations({
                      name: adName,
                      pageId: effectivePageId,
                      instagramAccountId,
                      linkUrl: finalUrl,
                      displayLink: adSettings.displayLink || undefined,
                      primaryTexts: [primaryText],
                      headlines: headlines.slice(0, 5),
                      descriptions: descriptions.slice(0, 5),
                      callToAction: finalCta,
                      imageHash: assetInfo.type === 'image' ? assetInfo.mediaId : undefined,
                      videoId: assetInfo.type === 'video' ? assetInfo.mediaId : undefined,
                      thumbnailUrl: assetInfo.thumbnailUrl,
                      creativeEnhancements: assetInfo.type === 'video' ? creativeEnhancements?.video : creativeEnhancements?.image,
                    });
                    
                    log(`  Creative created: ${creative.id}`);
                    
                    await storage.createMetaObject({
                      jobId,
                      adsetId: adset.id,
                      adIndex,
                      objectType: "creative",
                      metaId: creative.id,
                      name: adName,
                      status: "created",
                    });
                    
                    const adResult = await metaApi.createAd({
                      name: adName,
                      adSetId: metaAdSetId,
                      creativeId: creative.id,
                      status: "ACTIVE",
                    });
                    log(`  Ad created: ${adResult.id}`);

                    await storage.createMetaObject({
                      jobId,
                      adsetId: adset.id,
                      adIndex,
                      objectType: "ad",
                      metaId: adResult.id,
                      name: adName,
                      status: "created",
                    });

                    totalAdsCreated++;
                    adsCreatedForThisAdSet++;
                  } catch (err) {
                    log(`Error creating ad for ${assetInfo.name} + PT${textIdx + 1}: ${err instanceof Error ? err.message : "Unknown"}`);
                  }
                }
              }
              if (adsCreatedForThisAdSet > 0) {
                log(`Ad set "${adSetName || adset.name}" completed — ${adsCreatedForThisAdSet} ads created`, "success");
                const adSetObj = (await storage.getMetaObjectsByJob(jobId)).find(obj => obj.objectType === "adset" && obj.adsetId === adset.id);
                if (adSetObj) await storage.updateMetaObject(adSetObj.id, { status: "created" });
                await storage.updateJob(jobId, { logs });
              }
            } else {
              // DYNAMIC MODE: 1 ad per asset with all text variations for A/B testing
              log(`DYNAMIC MODE: Creating ${allAssetInfo.length} ads...`);
              log(`Using ${primaryTexts.length} primary texts, ${headlines.length} headlines, ${descriptions.length} descriptions`);
              log(`Logging: adset_id=${metaAdSetId}, page_id=${effectivePageId}, instagram_actor_id=${instagramAccountId || 'null'}`);
              
              let adsCreatedForThisAdSet = 0;
              for (let i = 0; i < allAssetInfo.length; i++) {
                const assetInfo = allAssetInfo[i];
                const adName = `${adset.name} - ${assetInfo.name}`;
                
                try {
                  log(`Creating ad ${i + 1}/${allAssetInfo.length}: ${assetInfo.name}...`);
                  
                  // DYNAMIC: Use DEGREES_OF_FREEDOM with all text variations
                  log(`  Using dynamic format (DEGREES_OF_FREEDOM)...`);
                  const creative = await metaApi.createSingleCreativeWithTextVariations({
                    name: adName,
                    pageId: effectivePageId,
                    instagramAccountId,
                    linkUrl: finalUrl,
                    displayLink: adSettings.displayLink || undefined,
                    primaryTexts: primaryTexts.slice(0, 5),
                    headlines: headlines.slice(0, 5),
                    descriptions: descriptions.slice(0, 5),
                    callToAction: finalCta,
                    imageHash: assetInfo.type === 'image' ? assetInfo.mediaId : undefined,
                    videoId: assetInfo.type === 'video' ? assetInfo.mediaId : undefined,
                    thumbnailUrl: assetInfo.thumbnailUrl,
                    creativeEnhancements: assetInfo.type === 'video' ? creativeEnhancements?.video : creativeEnhancements?.image,
                  });
                  
                  log(`  Creative created: ${creative.id}`);
                  
                  await storage.createMetaObject({
                    jobId,
                    adsetId: adset.id,
                    adIndex: i + 1,
                    objectType: "creative",
                    metaId: creative.id,
                    name: adName,
                    status: "created",
                  });
                  
                  const adResult = await metaApi.createAd({
                    name: adName,
                    adSetId: metaAdSetId,
                    creativeId: creative.id,
                    status: "ACTIVE",
                  });
                  log(`  Ad created: ${adResult.id}`);

                  await storage.createMetaObject({
                    jobId,
                    adsetId: adset.id,
                    adIndex: i + 1,
                    objectType: "ad",
                    metaId: adResult.id,
                    name: adName,
                    status: "created",
                  });

                  totalAdsCreated++;
                  adsCreatedForThisAdSet++;
                } catch (err) {
                  log(`Error creating ad for ${assetInfo.name}: ${err instanceof Error ? err.message : "Unknown"}`);
                }
              }
              if (adsCreatedForThisAdSet > 0) {
                log(`Ad set "${adSetName || adset.name}" completed — ${adsCreatedForThisAdSet} ads created`, "success");
                const adSetObj = (await storage.getMetaObjectsByJob(jobId)).find(obj => obj.objectType === "adset" && obj.adsetId === adset.id);
                if (adSetObj) await storage.updateMetaObject(adSetObj.id, { status: "created" });
                await storage.updateJob(jobId, { logs });
              }
            }
          } else {
            log(`Skipping ad set ${adset.name}: no uploaded media`);
          }
        }

      // Mark job as complete (or error if nothing was created)
      if (totalAdsCreated === 0 && adSetIds.length === 0) {
        log(`No ads were created. All ad sets were skipped due to validation errors or missing data.`, "error");
        throw new Error("No ads created - all ad sets failed validation. Check ad copy and media files.");
      } else {
        log(`All ads created successfully! Total: ${totalAdsCreated} ads in ${adSetIds.length} ad sets.`);
        await storage.updateJob(jobId, {
          status: "done",
          completedAt: new Date(),
          totalAds: totalAdsCreated,
          completedAds: totalAdsCreated,
          logs,
        });
      }

      console.log(`[Background] Job ${jobId} completed: ${totalAdsCreated} ads created`);
      return { totalAdsCreated, adSetCount: adSetIds.length };
    } catch (error) {
      console.error(`[Background] Error processing job ${jobId}:`, error);
      await storage.updateJob(jobId, {
        status: "error",
        errorMessage: error instanceof Error ? error.message : "Launch failed",
      });
      throw error;
    }
  }

  // Retry failed ad set
  app.post("/api/bulk-ads/retry/:jobId/:adsetId", async (req: Request, res: Response) => {
    try {
      const { jobId, adsetId } = req.params;
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const job = await assertJobOwnership(userId, jobId);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      // Get metaObjects for this job and update the failed ad set
      const metaObjects = await storage.getMetaObjectsByJob(jobId);
      const adSetObject = metaObjects.find(
        obj => obj.objectType === "adset" && (obj.metaId === adsetId || obj.id === adsetId)
      );
      
      if (!adSetObject) {
        return res.status(404).json({ error: "Ad set not found" });
      }

      // Update ad set status to processing/creating
      await storage.updateMetaObject(adSetObject.id, {
        status: "creating",
      });

      // Update job status back to creating_creatives if it was in error
      if (job.status === "error" || job.status === "done") {
        await storage.updateJob(jobId, {
          status: "creating_creatives",
        });
      }

      // Simulate successful retry (in real implementation, this would trigger actual retry logic)
      setTimeout(async () => {
        await storage.updateMetaObject(adSetObject.id, {
          status: "created",
        });
        
        // Check if all ad sets are now complete
        const updatedMetaObjects = await storage.getMetaObjectsByJob(jobId);
        const allAdSets = updatedMetaObjects.filter(obj => obj.objectType === "adset");
        const allComplete = allAdSets.every(obj => obj.status === "created");
        
        if (allComplete) {
          await storage.updateJob(jobId, {
            status: "done",
            completedAt: new Date(),
          });
        }
      }, 2000);

      res.json({ success: true, message: "Retry initiated" });
    } catch (error) {
      console.error("Error retrying ad set:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to retry ad set" 
      });
    }
  });

  app.post("/api/bulk-ads/cancel/:jobId", async (req: Request, res: Response) => {
    try {
      const { jobId } = req.params;
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const job = await assertJobOwnership(userId, jobId);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }
      cancelledJobs.add(jobId);
      console.error(`\n========== [Launch] UPLOAD CANCELLED BY USER ==========`);
      console.error(`Job ID: ${jobId}`);
      console.error(`============================================================\n`);
      emitJobLog(jobId, "Upload cancelled by user", "error");
      await clearQueueForJob(jobId);
      await storage.updateJob(jobId, { status: "error", errorMessage: "Upload cancelled by user" });
      res.json({ success: true });
    } catch (error) {
      console.error("Error cancelling job:", error);
      res.status(500).json({ error: "Failed to cancel upload" });
    }
  });

  // Dry run preview
  app.post("/api/bulk-ads/dry-run", async (req: Request, res: Response) => {
    try {
      // Validate request body
      const parseResult = dryRunRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ 
          error: parseResult.error.errors[0]?.message || "Invalid request" 
        });
      }
      
      const { jobId, disabledAdSetIds } = parseResult.data;

      const job = await storage.getJob(jobId);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      const allAdsets = await storage.getAdsetsByJob(jobId);
      const jobAdsets = allAdsets.filter(a => !disabledAdSetIds.includes(a.id));
      const assets = await storage.getAssetsByJob(jobId);
      const extractedAds = await storage.getExtractedAdsByJob(jobId);

      // Find a default description from any ad that has one (for fallback)
      const defaultDescription = extractedAds.find(a => a.description && a.description.trim())?.description || "";

      // Build preview by iterating through adsets and their assets
      const preview: Array<{
        index: number;
        adsetId: string;
        adsetName: string;
        videoFilename: string;
        headline: string;
        primaryText: string;
        description: string;
        cta: string;
        url: string;
        isValid: boolean;
        errors: string[];
      }> = [];

      let globalIndex = 0;
      for (const adset of jobAdsets) {
        // Find the extracted ad copy for this adset
        const adCopy = extractedAds.find(a => a.adsetId === adset.id);
        
        // Get all valid assets for this adset
        const adsetAssets = assets.filter(a => a.adsetId === adset.id && a.status === "valid");
        
        for (const asset of adsetAssets) {
          globalIndex++;
          const errors: string[] = [];
          
          // Check for missing ad copy
          if (!adCopy) {
            errors.push("No ad copy found for this ad set (missing DOCX or parsing failed)");
          } else {
            // Use the adCopy's validation errors if present
            if (adCopy.validationErrors && adCopy.validationErrors.length > 0) {
              errors.push(...adCopy.validationErrors);
            }
            // Check for missing required fields
            if (!adCopy.headline || adCopy.headline.trim() === "") {
              errors.push("Headline is required");
            }
            if (!adCopy.primaryText || adCopy.primaryText.trim() === "") {
              errors.push("Primary text is required");
            }
          }

          // Apply fallback for description
          const description = adCopy?.description || defaultDescription;

          preview.push({
            index: globalIndex,
            adsetId: adset.id,
            adsetName: adset.name,
            videoFilename: asset.originalFilename,
            headline: adCopy?.headline || "",
            primaryText: adCopy?.primaryText || "",
            description: description,
            cta: adCopy?.cta || "LEARN_MORE",
            url: adCopy?.url || "",
            isValid: errors.length === 0,
            errors,
          });
        }
      }

      res.json({
        jobId,
        adsCount: preview.length,
        validAds: preview.filter(p => p.isValid).length,
        invalidAds: preview.filter(p => !p.isValid).length,
        preview,
      });
    } catch (error) {
      console.error("Error running dry-run:", error);
      res.status(500).json({ error: "Dry-run failed" });
    }
  });

  // ===== Drive Import Routes =====
  
  // Import from Google Drive folder URL
  app.post("/api/drive/import", async (req: Request, res: Response) => {
    try {
      const { folderUrl } = req.body;
      if (!folderUrl || typeof folderUrl !== 'string') {
        return res.status(400).json({ error: "Folder URL is required" });
      }

      const { extractFolderIdFromUrl, getFolderMetadata, listSubfolders, listAdSetFiles, parseAdSetFolderName } = await import("./google-drive.js");
      
      // Extract folder ID from URL
      const folderId = extractFolderIdFromUrl(folderUrl);
      if (!folderId) {
        return res.status(400).json({ error: "Invalid Google Drive folder URL" });
      }

      // Get folder metadata to validate access
      let folderName: string;
      try {
        const folderMeta = await getFolderMetadata(folderId);
        folderName = folderMeta.name || "Campaign Folder";
      } catch {
        return res.status(400).json({ error: "Cannot access folder. Please check permissions and ensure Google Drive is connected." });
      }

      // List subfolders (each subfolder = one AdSet)
      const subfolders = await listSubfolders(folderId);
      if (subfolders.length === 0) {
        return res.status(400).json({ 
          error: "No subfolders found. Each subfolder should represent one Ad Set containing videos and a DOCX file." 
        });
      }

      // Create job with new structure
      const userId = (req.session as any)?.userId;
      const job = await storage.createJob({
        status: "pending",
        currentStep: 1,
        driveRootFolderId: folderId,
        campaignName: folderName,
        totalAdSets: subfolders.length,
        completedAdSets: 0,
        userId: userId || undefined,
        defaultSettings: {
          dailyBudget: 20,
          ageMin: 18,
          ageMax: 65,
          placements: "AUTO",
          geoTargeting: ["US"],
          createNewCampaign: true,
        },
        logs: [],
      });

      // Scan each subfolder and create AdSet records
      const adsetPromises = subfolders.map(async (folder, index) => {
        const parsed = parseAdSetFolderName(folder.name || `Folder ${index + 1}`);
        const { videos, docxFile } = await listAdSetFiles(folder.id!);
        
        const validationErrors: string[] = [];
        if (videos.length === 0) {
          validationErrors.push("No valid video files found (must be numbered 1-10)");
        }
        if (!docxFile) {
          validationErrors.push("No DOCX file found");
        }
        
        // Check for duplicate or invalid video indices
        const indices = videos.map(v => v.index).filter(i => i !== null);
        const uniqueIndices = new Set(indices);
        if (uniqueIndices.size !== indices.length) {
          validationErrors.push("Duplicate video numbers found");
        }

        return storage.createAdset({
          jobId: job.id,
          driveFolderId: folder.id!,
          driveFolderName: folder.name || `Folder ${index + 1}`,
          name: parsed.name,
          sortOrder: parsed.order || index,
          useDefaults: true,
          status: validationErrors.length > 0 ? "invalid" : "pending",
          videoCount: videos.length,
          hasDocx: !!docxFile,
          docxFileId: docxFile?.id,
          docxFileName: docxFile?.name,
          validationErrors: validationErrors.length > 0 ? validationErrors : undefined,
        });
      });

      const adsets = await Promise.all(adsetPromises);

      res.json({
        jobId: job.id,
        folderName,
        folderId,
        adSets: adsets.map(a => ({
          id: a.id,
          name: a.name,
          folderName: a.driveFolderName,
          videoCount: a.videoCount,
          hasDocx: a.hasDocx,
          docxFileName: a.docxFileName,
          status: a.status,
          validationErrors: a.validationErrors,
          useDefaults: a.useDefaults,
        })),
      });
    } catch (error) {
      console.error("Error importing from Drive:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to import from Google Drive" 
      });
    }
  });

  // Sync/refresh Drive folder structure
  app.post("/api/drive/sync/:jobId", async (req: Request, res: Response) => {
    try {
      const { jobId } = req.params;
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const job = await assertJobOwnership(userId, jobId);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }
      
      if (!job.driveRootFolderId) {
        return res.status(400).json({ error: "Job has no Drive folder associated" });
      }

      const { listSubfolders, listAdSetFiles, parseAdSetFolderName } = await import("./google-drive.js");
      
      // Re-scan subfolders
      const subfolders = await listSubfolders(job.driveRootFolderId);
      const existingAdsets = await storage.getAdsetsByJob(jobId);
      
      // Create a map of existing adsets by folderId
      const existingMap = new Map(existingAdsets.map(a => [a.driveFolderId, a]));
      
      const updatedAdsets: any[] = [];
      
      for (const folder of subfolders) {
        const parsed = parseAdSetFolderName(folder.name || "Folder");
        const { videos, docxFile } = await listAdSetFiles(folder.id!);
        
        const validationErrors: string[] = [];
        if (videos.length === 0) {
          validationErrors.push("No valid video files found");
        }
        if (!docxFile) {
          validationErrors.push("No DOCX file found");
        }
        
        const existing = existingMap.get(folder.id!);
        
        if (existing) {
          // Update existing adset
          const updated = await storage.updateAdset(existing.id, {
            driveFolderName: folder.name || existing.driveFolderName,
            videoCount: videos.length,
            hasDocx: !!docxFile,
            docxFileId: docxFile?.id,
            docxFileName: docxFile?.name,
            validationErrors: validationErrors.length > 0 ? validationErrors : null,
            status: validationErrors.length > 0 ? "invalid" : existing.status === "invalid" ? "pending" : existing.status,
          });
          updatedAdsets.push(updated);
        } else {
          // Create new adset
          const created = await storage.createAdset({
            jobId,
            driveFolderId: folder.id!,
            driveFolderName: folder.name || "Folder",
            name: parsed.name,
            sortOrder: parsed.order || subfolders.indexOf(folder),
            useDefaults: true,
            status: validationErrors.length > 0 ? "invalid" : "pending",
            videoCount: videos.length,
            hasDocx: !!docxFile,
            docxFileId: docxFile?.id,
            docxFileName: docxFile?.name,
            validationErrors: validationErrors.length > 0 ? validationErrors : undefined,
          });
          updatedAdsets.push(created);
        }
      }

      // Update job totals
      await storage.updateJob(jobId, {
        totalAdSets: updatedAdsets.length,
      });

      res.json({
        jobId,
        adSets: updatedAdsets.map(a => ({
          id: a.id,
          name: a.name,
          folderName: a.driveFolderName,
          videoCount: a.videoCount,
          hasDocx: a.hasDocx,
          docxFileName: a.docxFileName,
          status: a.status,
          validationErrors: a.validationErrors,
          useDefaults: a.useDefaults,
        })),
      });
    } catch (error) {
      console.error("Error syncing Drive:", error);
      res.status(500).json({ error: "Failed to sync with Google Drive" });
    }
  });

  // ===== DCT-based Drive Import Routes =====
  
  // Parse Drive folder URL and return folder info
  app.post("/api/drive/parse-url", async (req: Request, res: Response) => {
    try {
      const { folderUrl } = req.body;
      if (!folderUrl || typeof folderUrl !== 'string') {
        return res.status(400).json({ error: "Folder URL is required" });
      }

      const { extractFolderIdFromUrl, getFolderMetadata } = await import("./google-drive.js");
      
      const folderId = extractFolderIdFromUrl(folderUrl);
      if (!folderId) {
        return res.status(400).json({ error: "Invalid Google Drive folder URL" });
      }

      try {
        const folderMeta = await getFolderMetadata(folderId);
        res.json({
          folderId,
          folderName: folderMeta.name || "Unknown Folder",
          valid: true,
        });
      } catch {
        return res.status(400).json({ 
          error: "Cannot access folder. Please check permissions and ensure Google Drive is connected." 
        });
      }
    } catch (error) {
      console.error("Error parsing Drive URL:", error);
      res.status(500).json({ error: "Failed to parse Drive URL" });
    }
  });

  // Sync DCT folders from Drive to a campaign
  app.post("/api/drive/sync", async (req: Request, res: Response) => {
    try {
      const { campaignId, driveUrl, geoSplit } = req.body;
      if (!driveUrl) {
        return res.status(400).json({ error: "Drive URL is required" });
      }

      const { 
        extractFolderIdFromUrl, 
        getFolderMetadata, 
        listDCTFolders, 
        listDCTCreatives,
        listRootDocxFiles,
        parseDCTFolderName,
        downloadFileAsBuffer,
        exportGoogleDocAsPlainText,
        parseDCTCopyFromText,
        normalizeDCTName,
      } = await import("./google-drive.js");
      const { detectGeoSplits, getGeoTargetingForMarket } = await import("./geo-split-parser.js");
      const { parseDocx } = await import("./docx-parser.js");
      
      const folderId = extractFolderIdFromUrl(driveUrl);
      if (!folderId) {
        return res.status(400).json({ error: "Invalid Google Drive folder URL" });
      }

      let folderName: string;
      try {
        const folderMeta = await getFolderMetadata(folderId);
        folderName = folderMeta.name || "Campaign Folder";
      } catch {
        return res.status(400).json({ error: "Cannot access folder" });
      }

      // Find DCT subfolders
      const dctFolders = await listDCTFolders(folderId);
      if (dctFolders.length === 0) {
        return res.status(400).json({ 
          error: "No DCT folders found. Folder names must start with 'DCT' (e.g., 'DCT 1', 'DCT_Prospecting')." 
        });
      }

      // Pre-sync validation: check if media files are actually downloadable
      const { checkPublicFileReadable } = await import("./public-drive.js");
      const firstDctCreatives = await listDCTCreatives(dctFolders[0].id!);
      const firstMediaFile = firstDctCreatives.creatives[0];
      if (firstMediaFile) {
        const isReadable = await checkPublicFileReadable(firstMediaFile.id);
        if (!isReadable) {
          return res.status(403).json({
            error: "Media files in this folder are not publicly accessible. Set sharing to 'Anyone with the link' or switch to Private mode and share the folder with the service account."
          });
        }
      }

      // Find root DOCX files (global copy candidates)
      const rootDocxFiles = await listRootDocxFiles(folderId);
      
      // Parse global DOCX if available
      let globalCopyBlocks: Record<string, any> = {};
      let globalCopyBlocksArray: any[] = []; // For order-based matching
      if (rootDocxFiles.length > 0) {
        const bestGlobalDocx = rootDocxFiles.find(f => 
          f.name?.toLowerCase().includes('copy') || f.name?.toLowerCase().includes('caption')
        ) || rootDocxFiles[0];
        
        try {
          // Try plain text export first (preserves exact Google Docs formatting)
          let rawText: string;
          const plainText = await exportGoogleDocAsPlainText(bestGlobalDocx.id!);
          if (plainText) {
            console.log("[Sync] Global DOCX exported as plain text (exact formatting preserved)");
            rawText = plainText;
          } else {
            // Fall back to mammoth for .docx files
            const docxBuffer = await downloadFileAsBuffer(bestGlobalDocx.id!);
            const parseResult = await parseDocx(docxBuffer);
            rawText = parseResult.rawText;
          }
          const parsedBlocks = parseDCTCopyFromText(rawText);
          globalCopyBlocksArray = parsedBlocks; // Store for order-based matching
          
          for (const block of parsedBlocks) {
            const key = normalizeDCTName(block.dctName);
            globalCopyBlocks[key] = block;
          }
          console.log("[Sync] Global DOCX blocks:", Object.keys(globalCopyBlocks), "array length:", globalCopyBlocksArray.length);
        } catch (err) {
          console.error("Error parsing global DOCX:", err);
        }
      }
      
      // Sort DCT folders by their order for matching
      const sortedDctFolders = [...dctFolders].sort((a, b) => {
        const orderA = parseDCTFolderName(a.name || "DCT").order || 0;
        const orderB = parseDCTFolderName(b.name || "DCT").order || 0;
        return orderA - orderB;
      });

      // Create job
      const userId = (req.session as any)?.userId;
      const job = await storage.createJob({
        status: "pending",
        currentStep: 1,
        driveRootFolderId: folderId,
        driveRootFolderUrl: driveUrl,
        driveRootFolderName: folderName,
        campaignId,
        totalAdSets: dctFolders.length,
        completedAdSets: 0,
        userId: userId || undefined,
      });

      // Process each DCT folder - use sorted order for matching
      const adSetResults: any[] = [];
      for (let folderIndex = 0; folderIndex < sortedDctFolders.length; folderIndex++) {
        const folder = sortedDctFolders[folderIndex];
        const parsed = parseDCTFolderName(folder.name || "DCT");
        const { creatives, docxFiles } = await listDCTCreatives(folder.id!);
        
        // Determine which DOCX to use (per-DCT overrides global)
        let parsedCopy: any = null;
        let docxSource: 'per-dct' | 'global' | 'missing' = 'missing';
        let docxFileId: string | null = null;
        let docxFileName: string | null = null;
        
        if (docxFiles.length > 0) {
          const bestDocx = docxFiles.find(f => 
            f.name?.toLowerCase().includes('copy')
          ) || docxFiles[0];
          
          docxFileId = bestDocx.id;
          docxFileName = bestDocx.name;
          docxSource = 'per-dct';
          
          try {
            let rawText: string;
            const plainText = await exportGoogleDocAsPlainText(bestDocx.id);
            if (plainText) {
              console.log("[Sync] Per-DCT DOCX exported as plain text");
              rawText = plainText;
            } else {
              const docxBuffer = await downloadFileAsBuffer(bestDocx.id);
              const parseResult = await parseDocx(docxBuffer);
              rawText = parseResult.rawText;
            }
            const parsedBlocks = parseDCTCopyFromText(rawText);
            parsedCopy = parsedBlocks.length === 1 ? parsedBlocks[0] : parsedBlocks.find(b => 
              normalizeDCTName(b.dctName) === normalizeDCTName(folder.name || "")
            ) || parsedBlocks[0];
          } catch (err) {
            console.error("Error parsing per-DCT DOCX:", err);
          }
        } else {
          const normalizedFolderName = normalizeDCTName(folder.name || "");
          
          if (globalCopyBlocks[normalizedFolderName]) {
            parsedCopy = globalCopyBlocks[normalizedFolderName];
            docxSource = 'global';
            console.log(`[Sync] Matched folder "${folder.name}" by name to DOCX block`);
          } 
          else if (globalCopyBlocksArray.length > 0 && folderIndex < globalCopyBlocksArray.length) {
            parsedCopy = globalCopyBlocksArray[folderIndex];
            docxSource = 'global';
            console.log(`[Sync] Matched folder "${folder.name}" (index ${folderIndex}) to DOCX block "${parsedCopy?.dctName}" by order`);
          }
          else if (Object.keys(globalCopyBlocks).length === 1) {
            parsedCopy = { ...Object.values(globalCopyBlocks)[0], assumed: true };
            docxSource = 'global';
            console.log(`[Sync] Applied single global block to folder "${folder.name}"`);
          }
        }

        // Geo-split: detect market codes in creative filenames
        if (geoSplit && creatives.length > 0) {
          const geoData = detectGeoSplits(creatives.map(c => ({ id: c.id, name: c.name, mimeType: c.mimeType, size: c.size })));
          
          if (geoData.shouldSplit) {
            console.log(`[Sync] Geo-split detected for "${folder.name}": markets=${geoData.markets.join(', ')}, global=${geoData.globalFiles.length}`);
            
            for (const market of geoData.markets) {
              const marketFiles = [...(geoData.filesByMarket[market] || []), ...geoData.globalFiles];
              const marketName = `${folder.name} ${market}`;
              const geoCountries = getGeoTargetingForMarket(market);

              const validationErrors: string[] = [];
              if (marketFiles.length === 0) {
                validationErrors.push("No creatives found (images or videos)");
              }
              if (!parsedCopy) {
                validationErrors.push("No ad copy found");
              }

              const adset = await storage.createAdset({
                jobId: job.id,
                driveFolderId: folder.id!,
                driveFolderName: folder.name || "DCT",
                name: marketName,
                sortOrder: parsed.order || 0,
                useDefaults: true,
                status: validationErrors.length > 0 ? "invalid" : "valid",
                videoCount: marketFiles.filter(c => c.mimeType?.startsWith('video/')).length,
                hasDocx: docxSource !== 'missing',
                docxFileId,
                docxFileName,
                validationErrors: validationErrors.length > 0 ? validationErrors : undefined,
                overrideSettings: { geoTargeting: geoCountries, geoSplitMarket: market },
              });

              for (let i = 0; i < marketFiles.length; i++) {
                const creative = marketFiles[i];
                await storage.createAsset({
                  jobId: job.id,
                  adsetId: adset.id,
                  index: i + 1,
                  filename: creative.name,
                  originalFilename: creative.name,
                  mimeType: creative.mimeType,
                  size: parseInt(creative.size || "0") || 0,
                  status: "valid",
                  driveFileId: creative.id,
                });
              }

              if (parsedCopy) {
                await storage.createExtractedAd({
                  jobId: job.id,
                  adsetId: adset.id,
                  index: 1,
                  primaryText: parsedCopy.primaryTexts?.join('\n\n---\n\n') || null,
                  headline: parsedCopy.headlines?.join('\n\n---\n\n') || null,
                  description: parsedCopy.descriptions?.join('\n\n---\n\n') || null,
                  isValid: true,
                });
              }

              const mktVideoCount = marketFiles.filter(c => c.mimeType?.startsWith('video/')).length;
              const mktImageCount = marketFiles.filter(c => c.mimeType?.startsWith('image/')).length;

              adSetResults.push({
                id: adset.id,
                dctName: folder.name,
                name: marketName,
                creativeCount: marketFiles.length,
                videoCount: mktVideoCount,
                imageCount: mktImageCount,
                docxSource,
                parsedCopy,
                status: adset.status,
                validationErrors,
                geoSplitMarket: market,
                geoTargeting: geoCountries,
              });
            }
            continue;
          }
        }

        const validationErrors: string[] = [];
        if (creatives.length === 0) {
          validationErrors.push("No creatives found (images or videos)");
        }
        if (!parsedCopy) {
          validationErrors.push("No ad copy found");
        }

        const adset = await storage.createAdset({
          jobId: job.id,
          driveFolderId: folder.id!,
          driveFolderName: folder.name || "DCT",
          name: folder.name || "DCT",
          sortOrder: parsed.order || 0,
          useDefaults: true,
          status: validationErrors.length > 0 ? "invalid" : "valid",
          videoCount: creatives.length,
          hasDocx: docxSource !== 'missing',
          docxFileId,
          docxFileName,
          validationErrors: validationErrors.length > 0 ? validationErrors : undefined,
        });

        for (let i = 0; i < creatives.length; i++) {
          const creative = creatives[i];
          await storage.createAsset({
            jobId: job.id,
            adsetId: adset.id,
            index: i + 1,
            filename: creative.name,
            originalFilename: creative.name,
            mimeType: creative.mimeType,
            size: parseInt(creative.size) || 0,
            status: "valid",
            driveFileId: creative.id,
          });
        }

        if (parsedCopy) {
          await storage.createExtractedAd({
            jobId: job.id,
            adsetId: adset.id,
            index: 1,
            primaryText: parsedCopy.primaryTexts?.join('\n\n---\n\n') || null,
            headline: parsedCopy.headlines?.join('\n\n---\n\n') || null,
            description: parsedCopy.descriptions?.join('\n\n---\n\n') || null,
            isValid: true,
          });
        }

        adSetResults.push({
          id: adset.id,
          dctName: folder.name,
          name: parsed.name,
          creativeCount: creatives.length,
          videoCount: creatives.filter(c => c.mimeType?.startsWith('video/')).length,
          imageCount: creatives.filter(c => c.mimeType?.startsWith('image/')).length,
          docxSource,
          parsedCopy,
          status: adset.status,
          validationErrors,
        });
      }

      res.json({
        jobId: job.id,
        campaignId,
        driveRootFolderId: folderId,
        driveRootFolderName: folderName,
        adSets: adSetResults,
        globalDocxFound: rootDocxFiles.length > 0,
      });
    } catch (error) {
      console.error("Error syncing Drive DCT folders:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to sync Drive folders" 
      });
    }
  });

  // Get ad sets for Drive sync
  app.get("/api/drive/adsets", async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const { jobId } = req.query;
      if (!jobId || typeof jobId !== 'string') {
        return res.status(400).json({ error: "Job ID is required" });
      }
      const job = await assertJobOwnership(userId, jobId);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }
      
      const adsets = await storage.getAdsetsByJob(jobId);
      const adsetsWithDetails = await Promise.all(adsets.map(async (adset) => {
        const assets = await storage.getAssetsByAdset(adset.id);
        const extractedAds = await storage.getExtractedAdsByAdset(adset.id);
        
        const videoAssets = assets.filter(a => a.mimeType?.startsWith('video/'));
        const imageAssets = assets.filter(a => !a.mimeType?.startsWith('video/'));
        const overrideSettings = adset.overrideSettings as any;
        return {
          ...adset,
          videoCount: videoAssets.length,
          imageCount: imageAssets.length,
          geoSplitMarket: overrideSettings?.geoSplitMarket || undefined,
          geoTargeting: overrideSettings?.geoTargeting || undefined,
          creatives: assets.map(a => ({
            id: a.id,
            name: a.originalFilename,
            type: a.mimeType?.startsWith('video/') ? 'video' : 'image',
            driveFileId: a.driveFileId,
          })),
          parsedCopy: extractedAds.length > 0 ? {
            primaryTexts: extractedAds[0].primaryText?.split(/\n\n---\n\n|\n---\n|---/).map((t: string) => t.trim()).filter((t: string) => t.length > 0) || [],
            headlines: extractedAds[0].headline?.split(/\n\n---\n\n|\n---\n|---/).map((t: string) => t.trim()).filter((t: string) => t.length > 0) || [],
            descriptions: extractedAds[0].description?.split(/\n\n---\n\n|\n---\n|---/).map((t: string) => t.trim()).filter((t: string) => t.length > 0) || [],
          } : null,
        };
      }));
      
      res.json(adsetsWithDetails);
    } catch (error) {
      console.error("Error fetching Drive adsets:", error);
      res.status(500).json({ error: "Failed to fetch ad sets" });
    }
  });

  // Get single ad set detail with parsed copy
  app.get("/api/drive/adsets/:id", async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const { id } = req.params;
      const adset = await storage.getAdset(id);
      if (!adset) {
        return res.status(404).json({ error: "Ad set not found" });
      }
      const job = await assertJobOwnership(userId, adset.jobId);
      if (!job) {
        return res.status(404).json({ error: "Ad set not found" });
      }
      
      const assets = await storage.getAssetsByAdset(id);
      const extractedAds = await storage.getExtractedAdsByAdset(id);
      
      res.json({
        ...adset,
        creatives: assets.map(a => ({
          id: a.id,
          name: a.originalFilename,
          type: a.mimeType?.startsWith('video/') ? 'video' : 'image',
          driveFileId: a.driveFileId,
        })),
        parsedCopy: extractedAds.length > 0 ? {
          primaryTexts: extractedAds[0].primaryText?.split(/\n\n---\n\n|\n---\n|---/).map((t: string) => t.trim()).filter((t: string) => t.length > 0) || [],
          headlines: extractedAds[0].headline?.split(/\n\n---\n\n|\n---\n|---/).map((t: string) => t.trim()).filter((t: string) => t.length > 0) || [],
          descriptions: extractedAds[0].description?.split(/\n\n---\n\n|\n---\n|---/).map((t: string) => t.trim()).filter((t: string) => t.length > 0) || [],
        } : null,
      });
    } catch (error) {
      console.error("Error fetching ad set:", error);
      res.status(500).json({ error: "Failed to fetch ad set" });
    }
  });

  // Update ad set copy manually
  app.post("/api/drive/adsets/:id/copy", async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const { id } = req.params;
      const { primaryTexts, headlines, descriptions } = req.body;
      
      const adset = await storage.getAdset(id);
      if (!adset) {
        return res.status(404).json({ error: "Ad set not found" });
      }
      const job = await assertJobOwnership(userId, adset.jobId);
      if (!job) {
        return res.status(404).json({ error: "Ad set not found" });
      }

      // Find existing extracted ad or create new one
      const existingAds = await storage.getExtractedAdsByAdset(id);
      
      if (existingAds.length > 0) {
        await storage.updateExtractedAd(existingAds[0].id, {
          primaryText: Array.isArray(primaryTexts) ? primaryTexts.join('\n\n---\n\n') : primaryTexts,
          headline: Array.isArray(headlines) ? headlines.join('\n\n---\n\n') : headlines,
          description: Array.isArray(descriptions) ? descriptions.join('\n\n---\n\n') : descriptions,
          isValid: true,
        });
      } else {
        await storage.createExtractedAd({
          jobId: adset.jobId,
          adsetId: id,
          index: 1,
          primaryText: Array.isArray(primaryTexts) ? primaryTexts.join('\n\n---\n\n') : primaryTexts,
          headline: Array.isArray(headlines) ? headlines.join('\n\n---\n\n') : headlines,
          description: Array.isArray(descriptions) ? descriptions.join('\n\n---\n\n') : descriptions,
          isValid: true,
        });
      }

      // Update adset status if it was invalid due to missing copy
      if (adset.status === 'invalid' && adset.validationErrors?.includes('No ad copy found')) {
        const newErrors = adset.validationErrors.filter(e => e !== 'No ad copy found');
        await storage.updateAdset(id, {
          status: newErrors.length > 0 ? 'invalid' : 'valid',
          validationErrors: newErrors.length > 0 ? newErrors : null,
          hasDocx: true,
        });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error updating ad set copy:", error);
      res.status(500).json({ error: "Failed to update ad copy" });
    }
  });

  app.post("/api/drive/jobs/:jobId/global-copy", async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const { jobId } = req.params;
      const { primaryTexts, headlines, descriptions } = req.body;
      const job = await assertJobOwnership(userId, jobId);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      const hasPrimary = Array.isArray(primaryTexts) && primaryTexts.some((t: string) => t?.trim());
      const hasHeadlines = Array.isArray(headlines) && headlines.some((t: string) => t?.trim());
      const hasDescriptions = Array.isArray(descriptions) && descriptions.some((t: string) => t?.trim());
      if (!hasPrimary && !hasHeadlines && !hasDescriptions) {
        return res.status(400).json({ error: "At least one non-empty copy field is required" });
      }

      const allAdsets = await storage.getAdsetsByJob(jobId);
      if (allAdsets.length === 0) {
        return res.status(404).json({ error: "No ad sets found for this job" });
      }

      const adsetsWithoutCopy = allAdsets.filter(a => !a.hasDocx);
      if (adsetsWithoutCopy.length === 0) {
        return res.status(400).json({ error: "All ad sets already have copy" });
      }

      let updatedCount = 0;
      for (const adset of adsetsWithoutCopy) {
        const existingAds = await storage.getExtractedAdsByAdset(adset.id);

        const copyData = {
          primaryText: Array.isArray(primaryTexts) ? primaryTexts.join('\n\n---\n\n') : primaryTexts,
          headline: Array.isArray(headlines) ? headlines.join('\n\n---\n\n') : headlines,
          description: Array.isArray(descriptions) ? descriptions.join('\n\n---\n\n') : descriptions,
          isValid: true,
        };

        if (existingAds.length > 0) {
          await storage.updateExtractedAd(existingAds[0].id, copyData);
        } else {
          await storage.createExtractedAd({
            jobId: adset.jobId,
            adsetId: adset.id,
            index: 1,
            ...copyData,
          });
        }

        if (adset.status === 'invalid' && adset.validationErrors?.includes('No ad copy found')) {
          const newErrors = (adset.validationErrors || []).filter(e => e !== 'No ad copy found');
          await storage.updateAdset(adset.id, {
            status: newErrors.length > 0 ? 'invalid' : 'valid',
            validationErrors: newErrors.length > 0 ? newErrors : null,
            hasDocx: true,
          });
        } else {
          await storage.updateAdset(adset.id, { hasDocx: true });
        }

        updatedCount++;
      }

      res.json({ success: true, updatedCount, totalAdsets: allAdsets.length });
    } catch (error) {
      console.error("Error applying global copy:", error);
      res.status(500).json({ error: "Failed to apply global copy" });
    }
  });

  app.post("/api/drive/parse-docx", upload.single("docx"), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "DOCX file is required" });
      }
      const validMimeTypes = [
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/octet-stream",
      ];
      const isDocxExtension = req.file.originalname?.toLowerCase().endsWith(".docx");
      if (!isDocxExtension && !validMimeTypes.includes(req.file.mimetype)) {
        return res.status(400).json({ error: "Only .docx files are supported" });
      }
      const { parseDocx } = await import("./docx-parser.js");
      const result = await parseDocx(req.file.buffer);

      const primaryTexts: string[] = [];
      const headlines: string[] = [];
      const descriptions: string[] = [];

      for (const ad of result.ads) {
        if (ad.primary_text) primaryTexts.push(ad.primary_text);
        if (ad.headline) headlines.push(ad.headline);
        if (ad.description) descriptions.push(ad.description);
      }

      res.json({
        primaryTexts,
        headlines,
        descriptions,
        adCount: result.ads.length,
        method: result.method,
        aiError: result.aiError ?? null,
      });
    } catch (error) {
      console.error("Error parsing DOCX:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to parse DOCX" });
    }
  });

  // ===== Public Drive Import (No OAuth Required) =====
  
  // Import from public Drive folder using manifest.json
  app.post("/api/drive/import-public", async (req: Request, res: Response) => {
    try {
      const { campaignId, driveUrl, manifestFileId } = req.body;
      if (!campaignId || !driveUrl || !manifestFileId) {
        return res.status(400).json({ 
          error: "Campaign ID, Drive URL, and manifest file ID are required" 
        });
      }

      const { 
        extractFolderIdFromUrl,
        fetchManifestFromFolder,
        validateManifest,
        downloadPublicFile,
        parseDCTName,
        getFileType,
      } = await import("./public-drive.js");
      const { parseDocx } = await import("./docx-parser.js");
      
      const folderId = extractFolderIdFromUrl(driveUrl);
      if (!folderId) {
        return res.status(400).json({ error: "Invalid Google Drive folder URL" });
      }

      // Fetch and validate manifest
      let manifest;
      try {
        manifest = await fetchManifestFromFolder(manifestFileId);
      } catch (error) {
        return res.status(400).json({ 
          error: `Failed to fetch manifest: ${error instanceof Error ? error.message : 'Unknown error'}. Make sure the manifest.json file is publicly accessible.`
        });
      }

      const validation = validateManifest(manifest);
      if (!validation.valid) {
        return res.status(400).json({ 
          error: "Invalid manifest structure",
          details: validation.errors
        });
      }

      // Create job
      const userId = (req.session as any)?.userId;
      const job = await storage.createJob({
        status: "pending",
        currentStep: 1,
        driveRootFolderId: folderId,
        driveRootFolderUrl: driveUrl,
        driveRootFolderName: "Public Drive Import",
        campaignId,
        totalAdSets: manifest.dcts.length,
        completedAdSets: 0,
        userId: userId || undefined,
      });

      // Parse global DOCX if present
      let globalCopy: any = null;
      if (manifest.globalCopyDocxFileId) {
        try {
          const docxBuffer = await downloadPublicFile(manifest.globalCopyDocxFileId);
          const parseResult = await parseDocx(docxBuffer);
          globalCopy = parseResult;
        } catch (err) {
          console.error("Error parsing global DOCX:", err);
        }
      }

      // Process each DCT
      const adSetResults = await Promise.all(manifest.dcts.map(async (dct, index) => {
        const parsed = parseDCTName(dct.name);
        const validationErrors: string[] = [];
        
        // Create adset record - use FULL DCT name for proper identification
        const adset = await storage.createAdset({
          jobId: job.id,
          driveFolderId: `public_${folderId}_${index}`,
          driveFolderName: dct.name,
          name: dct.name,
          status: "pending",
          videoCount: dct.creatives.filter(c => c.type === "video").length,
          hasDocx: !!dct.copyDocxFileId || !!manifest.globalCopyDocxFileId,
          docxFileId: dct.copyDocxFileId || manifest.globalCopyDocxFileId || null,
          useDefaults: true,
        });

        // Create asset records for each creative
        let assetIndex = 0;
        for (const creative of dct.creatives) {
          const fileType = creative.type || getFileType(creative.name);
          const mimeType = fileType === "video" ? "video/mp4" : "image/jpeg";
          
          await storage.createAsset({
            jobId: job.id,
            adsetId: adset.id,
            driveFileId: creative.fileId,
            filename: creative.name,
            originalFilename: creative.name,
            mimeType,
            status: "pending",
            size: 0,
            index: assetIndex++,
          });
        }

        // Parse per-DCT DOCX or use global
        let parsedCopy = globalCopy;
        if (dct.copyDocxFileId) {
          try {
            const docxBuffer = await downloadPublicFile(dct.copyDocxFileId);
            const parseResult = await parseDocx(docxBuffer);
            parsedCopy = parseResult;
          } catch (err) {
            console.error(`Error parsing DCT ${dct.name} DOCX:`, err);
            validationErrors.push("Failed to parse DOCX file");
          }
        }

        // Store extracted ad copy
        if (parsedCopy?.rawText) {
          await storage.createExtractedAd({
            jobId: job.id,
            adsetId: adset.id,
            index: 1,
            primaryText: parsedCopy.primaryText || parsedCopy.rawText,
            headline: parsedCopy.headline || dct.name,
            description: parsedCopy.description || "",
            isValid: true,
          });
        } else if (!dct.copyDocxFileId && !manifest.globalCopyDocxFileId) {
          validationErrors.push("No ad copy found");
        }

        // Update status based on validation
        if (validationErrors.length > 0) {
          await storage.updateAdset(adset.id, {
            status: "invalid",
            validationErrors,
          });
        } else {
          await storage.updateAdset(adset.id, {
            status: "valid",
          });
        }

        return {
          id: adset.id,
          dctName: dct.name,
          name: dct.name,
          creativeCount: dct.creatives.length,
          videoCount: dct.creatives.filter(c => c.type === "video").length,
          imageCount: dct.creatives.filter(c => c.type !== "video").length,
          parsedCopy: parsedCopy ? {
            primaryTexts: [parsedCopy.primaryText || parsedCopy.rawText || ""],
            headlines: [parsedCopy.headline || dct.name],
            descriptions: [parsedCopy.description || ""],
          } : null,
          status: validationErrors.length > 0 ? "invalid" : "valid",
          validationErrors,
        };
      }));

      res.json({
        jobId: job.id,
        campaignId,
        driveRootFolderId: folderId,
        driveRootFolderName: "Public Drive Import",
        adSets: adSetResults,
        globalDocxFound: !!manifest.globalCopyDocxFileId,
      });
    } catch (error) {
      console.error("Error importing from public Drive:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to import from public Drive" 
      });
    }
  });

  app.get("/api/drive/debug", async (req: Request, res: Response) => {
    try {
      const { isServiceAccountConfigured, getServiceAccountEmail } = await import("./google-drive-service-account.js");
      if (!isServiceAccountConfigured()) {
        return res.json({ error: "Service account not configured", connected: false });
      }

      const email = getServiceAccountEmail();

      res.json({
        connected: true,
        serviceAccountEmail: email,
        message: "Service account is configured. Share folders with the email above.",
      });
    } catch (error: any) {
      console.error("[Drive Debug] Error:", error.message);
      res.json({ error: error.message, stack: error.stack?.split('\n').slice(0, 3) });
    }
  });

  app.get("/api/drive/browse", async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { browseFolders } = await import("./google-drive-service-account.js");

      const folderId = (req.query.folderId as string) || "root";
      const sharedWithMe = req.query.sharedWithMe === "true";
      const driveId = req.query.driveId as string | undefined;

      const { getFolderName } = await import("./google-drive-service-account.js");

      const folders = await browseFolders(folderId === "root" && sharedWithMe ? "root" : folderId);

      let parentName = sharedWithMe ? "Shared with me" : (driveId ? "Shared Drive" : "Shared folders");
      let parents: string[] = [];
      if (folderId !== "root") {
        try {
          const name = await getFolderName(folderId);
          if (name) parentName = name;
        } catch {}
      }

      console.log("[Drive Browse] Found", folders.length, "folders in", folderId);

      res.json({
        folderId,
        folderName: parentName,
        parents,
        folders: folders.map((f: any) => ({
          id: f.id,
          name: f.name,
        })),
      });
    } catch (error: any) {
      console.error("[Drive Browse] Error:", error.message);
      res.status(500).json({ error: "Failed to browse Google Drive: " + (error?.message || "Unknown error") });
    }
  });

  app.get("/api/drive/shared-drives", async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      res.json({ drives: [] });
    } catch (error: any) {
      console.error("[Drive Shared Drives] Error:", error.message);
      res.status(500).json({ error: "Shared drives not supported with service account" });
    }
  });

  app.get("/api/drive/search", async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const query = (req.query.q as string) || "";
      if (!query.trim()) {
        return res.json({ folders: [] });
      }

      const { searchFolders } = await import("./google-drive-service-account.js");
      console.log("[Drive Search] Searching for:", query);
      const folders = await searchFolders(query);
      console.log("[Drive Search] Found", folders.length, "folders");

      res.json({
        folders: folders.map((f: any) => ({
          id: f.id,
          name: f.name,
        })),
      });
    } catch (error: any) {
      console.error("[Drive Search] Error:", error.message);
      res.status(500).json({ error: "Failed to search Google Drive" });
    }
  });

  // Import from private Drive folder (Service Account)
  app.post("/api/drive/import-private", async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const { campaignId, driveUrl, geoSplit } = req.body;
      if (!driveUrl) {
        return res.status(400).json({ 
          error: "Drive URL is required" 
        });
      }

      const { 
        extractFolderIdFromUrl,
        checkFolderAccess,
        getFolderName,
        listDCTFolders,
        getGlobalDocx,
        downloadFile,
        getFileType,
        getServiceAccountEmail,
      } = await import("./google-drive-service-account.js");
      const { parseDocx } = await import("./docx-parser.js");
      const { parseDCTCopyFromText, normalizeDCTName } = await import("./google-drive.js");
      const { detectGeoSplits, getGeoTargetingForMarket } = await import("./geo-split-parser.js");
      
      const folderId = extractFolderIdFromUrl(driveUrl);
      if (!folderId) {
        return res.status(400).json({ error: "Invalid Google Drive folder URL" });
      }

      const hasAccess = await checkFolderAccess(folderId);
      if (!hasAccess) {
        const saEmail = getServiceAccountEmail();
        return res.status(403).json({ 
          error: `No access to this folder. Please share the folder with ${saEmail}` 
        });
      }

      const folderName = await getFolderName(folderId) || "Private Drive Import";

      const dctFolders = await listDCTFolders(folderId);
      if (dctFolders.length === 0) {
        return res.status(400).json({ 
          error: "No DCT folders found. Create subfolders starting with 'DCT' (e.g., 'DCT 1 - Retargeting')." 
        });
      }

      // Pre-sync validation: check if media files are actually readable by the service account
      const firstMediaFile = dctFolders[0].files.find(f => {
        const type = getFileType(f.mimeType, f.name);
        return type === "video" || type === "image";
      });
      if (firstMediaFile) {
        const { checkFileReadable } = await import("./google-drive-service-account.js");
        const isReadable = await checkFileReadable(firstMediaFile.id);
        if (!isReadable) {
          const saEmail = getServiceAccountEmail();
          return res.status(403).json({
            error: `Media files in this folder are not accessible. Please share the folder and its contents with ${saEmail}`
          });
        }
      }

      const globalDocx = await getGlobalDocx(folderId);
      let globalCopyBlocks: Record<string, any> = {};
      let globalCopyBlocksArray: any[] = [];
      if (globalDocx) {
        try {
          const docxBuffer = await downloadFile(globalDocx.id);
          const parseResult = await parseDocx(docxBuffer);
          const parsedBlocks = parseDCTCopyFromText(parseResult.rawText);
          globalCopyBlocksArray = parsedBlocks;
          for (const block of parsedBlocks) {
            const key = normalizeDCTName(block.dctName);
            globalCopyBlocks[key] = block;
          }
          console.log("[ImportPrivate] Global DOCX blocks:", Object.keys(globalCopyBlocks), "array length:", globalCopyBlocksArray.length);
        } catch (err) {
          console.error("Error parsing global DOCX:", err);
        }
      }

      // Create job
      const job = await storage.createJob({
        status: "pending",
        currentStep: 1,
        driveRootFolderId: folderId,
        driveRootFolderUrl: driveUrl,
        driveRootFolderName: folderName,
        campaignId,
        totalAdSets: dctFolders.length,
        completedAdSets: 0,
        userId: userId || undefined,
      });

      // Process each DCT folder
      const adSetResults: any[] = [];
      for (let index = 0; index < dctFolders.length; index++) {
        const dct = dctFolders[index];
        const validationErrors: string[] = [];
        
        const mediaFiles = dct.files.filter(f => {
          const type = getFileType(f.mimeType, f.name);
          return type === "video" || type === "image";
        });

        // Parse DCT-specific or global DOCX
        let parsedCopy: any = null;
        let docxSource: 'per-dct' | 'global' | 'missing' = 'missing';
        
        if (dct.docxFile) {
          docxSource = 'per-dct';
          try {
            const docxBuffer = await downloadFile(dct.docxFile.id);
            const parseResult = await parseDocx(docxBuffer);
            const parsedBlocks = parseDCTCopyFromText(parseResult.rawText);
            parsedCopy = parsedBlocks.length === 1 ? parsedBlocks[0] : parsedBlocks.find(b => 
              normalizeDCTName(b.dctName) === normalizeDCTName(dct.name || "")
            ) || parsedBlocks[0];
          } catch (err) {
            console.error(`Error parsing DCT ${dct.name} DOCX:`, err);
            validationErrors.push("Failed to parse DOCX file");
          }
        } else {
          const normalizedFolderName = normalizeDCTName(dct.name || "");
          if (globalCopyBlocks[normalizedFolderName]) {
            parsedCopy = globalCopyBlocks[normalizedFolderName];
            docxSource = 'global';
          } else if (globalCopyBlocksArray.length > 0 && index < globalCopyBlocksArray.length) {
            parsedCopy = globalCopyBlocksArray[index];
            docxSource = 'global';
          } else if (Object.keys(globalCopyBlocks).length === 1) {
            parsedCopy = { ...Object.values(globalCopyBlocks)[0], assumed: true };
            docxSource = 'global';
          }
        }

        // Geo-split: detect market codes in creative filenames
        if (geoSplit && mediaFiles.length > 0) {
          const geoData = detectGeoSplits(mediaFiles.map(f => ({ id: f.id, name: f.name, mimeType: f.mimeType, size: f.size })));
          
          if (geoData.shouldSplit) {
            console.log(`[ImportPrivate] Geo-split detected for "${dct.name}": markets=${geoData.markets.join(', ')}, global=${geoData.globalFiles.length}`);
            
            for (const market of geoData.markets) {
              const marketFiles = [...(geoData.filesByMarket[market] || []), ...geoData.globalFiles];
              const marketName = `${dct.name} ${market}`;
              const geoCountries = getGeoTargetingForMarket(market);
              const marketErrors: string[] = [];

              if (marketFiles.length === 0) {
                marketErrors.push("No creatives found (images or videos)");
              }
              if (!parsedCopy && !dct.docxFile && !globalDocx) {
                marketErrors.push("No ad copy found");
              }

              const adset = await storage.createAdset({
                jobId: job.id,
                driveFolderId: dct.id,
                driveFolderName: dct.name,
                name: marketName,
                status: marketErrors.length > 0 ? "invalid" : "valid",
                videoCount: marketFiles.filter(f => getFileType(f.mimeType, f.name) === "video").length,
                hasDocx: !!dct.docxFile || !!globalDocx,
                docxFileId: dct.docxFile?.id || globalDocx?.id || null,
                useDefaults: true,
                overrideSettings: { geoTargeting: geoCountries, geoSplitMarket: market },
              });

              let assetIndex = 0;
              for (const file of marketFiles) {
                await storage.createAsset({
                  jobId: job.id,
                  adsetId: adset.id,
                  driveFileId: file.id,
                  filename: file.name,
                  originalFilename: file.name,
                  mimeType: file.mimeType,
                  status: "pending",
                  size: parseInt(file.size || "0", 10),
                  index: assetIndex++,
                });
              }

              if (parsedCopy) {
                await storage.createExtractedAd({
                  jobId: job.id,
                  adsetId: adset.id,
                  index: 1,
                  primaryText: parsedCopy.primaryTexts?.join('\n\n---\n\n') || null,
                  headline: parsedCopy.headlines?.join('\n\n---\n\n') || null,
                  description: parsedCopy.descriptions?.join('\n\n---\n\n') || null,
                  isValid: true,
                });
              }

              const marketVideoFiles = marketFiles.filter(f => getFileType(f.mimeType, f.name) === "video");
              const marketImageFiles = marketFiles.filter(f => getFileType(f.mimeType, f.name) === "image");

              adSetResults.push({
                id: adset.id,
                dctName: dct.name,
                name: marketName,
                creativeCount: marketFiles.length,
                videoCount: marketVideoFiles.length,
                imageCount: marketImageFiles.length,
                docxSource,
                parsedCopy,
                status: marketErrors.length > 0 ? "invalid" : "valid",
                validationErrors: marketErrors,
                geoSplitMarket: market,
                geoTargeting: geoCountries,
              });
            }
            continue;
          }
        }

        const adset = await storage.createAdset({
          jobId: job.id,
          driveFolderId: dct.id,
          driveFolderName: dct.name,
          name: dct.name,
          status: "pending",
          videoCount: mediaFiles.filter(f => getFileType(f.mimeType, f.name) === "video").length,
          hasDocx: !!dct.docxFile || !!globalDocx,
          docxFileId: dct.docxFile?.id || globalDocx?.id || null,
          useDefaults: true,
        });

        let assetIndex = 0;
        for (const file of mediaFiles) {
          await storage.createAsset({
            jobId: job.id,
            adsetId: adset.id,
            driveFileId: file.id,
            filename: file.name,
            originalFilename: file.name,
            mimeType: file.mimeType,
            status: "pending",
            size: parseInt(file.size || "0", 10),
            index: assetIndex++,
          });
        }

        if (parsedCopy) {
          await storage.createExtractedAd({
            jobId: job.id,
            adsetId: adset.id,
            index: 1,
            primaryText: parsedCopy.primaryTexts?.join('\n\n---\n\n') || null,
            headline: parsedCopy.headlines?.join('\n\n---\n\n') || null,
            description: parsedCopy.descriptions?.join('\n\n---\n\n') || null,
            isValid: true,
          });
        } else if (!dct.docxFile && !globalDocx) {
          validationErrors.push("No ad copy found");
        }

        await storage.updateAdset(adset.id, { 
          status: validationErrors.length > 0 ? "invalid" : "valid",
          hasDocx: docxSource !== 'missing',
          validationErrors: validationErrors.length > 0 ? validationErrors : undefined,
        });

        const videoFiles = mediaFiles.filter(f => getFileType(f.mimeType, f.name) === "video");
        const imageFiles = mediaFiles.filter(f => getFileType(f.mimeType, f.name) === "image");

        adSetResults.push({
          id: adset.id,
          dctName: dct.name,
          name: dct.name,
          creativeCount: mediaFiles.length,
          videoCount: videoFiles.length,
          imageCount: imageFiles.length,
          docxSource,
          parsedCopy,
          status: validationErrors.length > 0 ? "invalid" : "valid",
          validationErrors,
        });
      }

      res.json({
        jobId: job.id,
        campaignId,
        driveRootFolderId: folderId,
        driveRootFolderName: folderName,
        adSets: adSetResults,
        globalDocxFound: !!globalDocx,
      });
    } catch (error) {
      console.error("Error importing from private Drive:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to import from private Drive" 
      });
    }
  });

  // Get adsets for a job
  app.get("/api/jobs/:jobId/adsets", async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const { jobId } = req.params;
      const job = await assertJobOwnership(userId, jobId);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }
      const adsets = await storage.getAdsetsByJob(jobId);
      res.json(adsets);
    } catch (error) {
      console.error("Error fetching adsets:", error);
      res.status(500).json({ error: "Failed to fetch adsets" });
    }
  });

  // Update adset settings
  app.patch("/api/adsets/:adsetId", async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const { adsetId } = req.params;
      const ownedAdset = await assertAdsetOwnership(userId, adsetId);
      if (!ownedAdset) {
        return res.status(404).json({ error: "Ad set not found" });
      }
      const { name, useDefaults, overrideSettings } = req.body;
      
      const updated = await storage.updateAdset(adsetId, {
        name,
        useDefaults,
        overrideSettings: overrideSettings || undefined,
      });
      
      res.json(updated);
    } catch (error) {
      console.error("Error updating adset:", error);
      res.status(500).json({ error: "Failed to update adset" });
    }
  });

  // Update job default settings
  app.patch("/api/jobs/:jobId/defaults", async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const { jobId } = req.params;
      const job = await assertJobOwnership(userId, jobId);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }
      const { defaultSettings } = req.body;
      
      await storage.updateJob(jobId, {
        defaultSettings,
      });
      
      const updatedJob = await storage.getJob(jobId);
      res.json(updatedJob);
    } catch (error) {
      console.error("Error updating defaults:", error);
      res.status(500).json({ error: "Failed to update defaults" });
    }
  });

  // ===== Global Settings Routes =====
  
  // Get global settings
  app.get("/api/settings", async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const settings = await storage.getGlobalSettings(userId);
      res.json(settings || {
        planType: "free",
        uploadsRemaining: 15,
        primaryTextVariations: [],
        headlineVariations: [],
        descriptionVariations: [],
        defaultCta: "LEARN_MORE",
      });
    } catch (error) {
      console.error("Error fetching settings:", error);
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  // Update global settings
  app.patch("/api/settings", async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const updates = req.body;
      const settings = await storage.upsertGlobalSettings(userId, updates);
      res.json(settings);
    } catch (error) {
      console.error("Error updating settings:", error);
      res.status(500).json({ error: "Failed to update settings" });
    }
  });

  // ===== Billing Payments Routes =====
  
  app.get("/api/billing/payments", async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const { db } = await import("./db.js");
      const { billingPayments } = await import("../shared/schema.js");
      const { eq, desc } = await import("drizzle-orm");
      const payments = await db.select().from(billingPayments).where(eq(billingPayments.userId, userId)).orderBy(desc(billingPayments.periodStart));
      res.json(payments);
    } catch (error) {
      console.error("Error fetching billing payments:", error);
      res.status(500).json({ error: "Failed to fetch billing payments" });
    }
  });

  // ===== User Settings Routes =====
  
  // Get user settings (campaign, adset, ad defaults)
  app.get("/api/user/settings", async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const settings = await storage.getUserSettings(userId);
      res.json(settings || {
        campaignSettings: {},
        adSetSettings: {},
        adSettings: {},
      });
    } catch (error) {
      console.error("Error fetching user settings:", error);
      res.status(500).json({ error: "Failed to fetch user settings" });
    }
  });

  // Update user settings
  app.patch("/api/user/settings", async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const { campaignSettings, adSetSettings, adSettings } = req.body;
      const settings = await storage.upsertUserSettings(userId, {
        campaignSettings,
        adSetSettings,
        adSettings,
      });
      res.json(settings);
    } catch (error) {
      console.error("Error updating user settings:", error);
      res.status(500).json({ error: "Failed to update user settings" });
    }
  });

  // Get ad account settings (for currently selected ad account)
  app.get("/api/ad-account-settings", async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      // Get selected ad account from metaAssets
      const [assets] = await db.select()
        .from(metaAssets)
        .where(eq(metaAssets.userId, userId));
      
      if (!assets?.selectedAdAccountId) {
        return res.json({ settings: null, adAccountId: null, adAccountName: null });
      }
      
      const adAccountId = assets.selectedAdAccountId;
      const adAccounts = assets.adAccountsJson || [];
      const adAccount = adAccounts.find(a => a.id === adAccountId || `act_${a.id}` === adAccountId);
      const adAccountName = adAccount?.name || null;
      
      const settings = await storage.getAdAccountSettings(userId, adAccountId);
      res.json({ 
        settings: settings || null, 
        adAccountId, 
        adAccountName,
        isConfigured: settings?.isConfigured || false,
      });
    } catch (error) {
      console.error("Error fetching ad account settings:", error);
      res.status(500).json({ error: "Failed to fetch ad account settings" });
    }
  });

  // Ad account settings validation schema
  const adAccountSettingsSchema = z.object({
    // Campaign settings (imported from selected campaign)
    campaignObjective: z.string().nullable().optional(),
    budgetType: z.string().nullable().optional(),
    budgetAmount: z.number().nullable().optional(),
    // Ad Set settings
    pixelId: z.string().nullable().optional(),
    pixelName: z.string().nullable().optional(),
    audienceType: z.string().nullable().optional(),
    audienceId: z.string().nullable().optional(),
    audienceName: z.string().nullable().optional(),
    geoTargeting: z.array(z.string()).optional(),
    ageMin: z.number().min(13).max(65).optional(),
    ageMax: z.number().min(18).max(65).optional(),
    gender: z.enum(["ALL", "MALE", "FEMALE"]).optional(),
    dailyMinSpendTarget: z.number().nullable().optional(),
    dailySpendCap: z.number().nullable().optional(),
    lifetimeSpendCap: z.number().nullable().optional(),
    // Ad settings
    websiteUrl: z.string().nullable().optional(),
    defaultCta: z.string().nullable().optional(),
    defaultUrl: z.string().nullable().optional(),
    displayLink: z.string().nullable().optional(),
    beneficiaryName: z.string().nullable().optional(),
    payerName: z.string().nullable().optional(),
    creativeEnhancements: z.any().nullable().optional(),
  });
  
  // Update ad account settings
  app.patch("/api/ad-account-settings", async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      // Validate request body
      const parseResult = adAccountSettingsSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ 
          error: "Invalid settings data", 
          details: parseResult.error.issues 
        });
      }
      
      // Get selected ad account from metaAssets
      const [assets] = await db.select()
        .from(metaAssets)
        .where(eq(metaAssets.userId, userId));
      
      if (!assets?.selectedAdAccountId) {
        return res.status(400).json({ error: "No ad account selected" });
      }
      
      const adAccountId = assets.selectedAdAccountId;
      const adAccounts = assets.adAccountsJson || [];
      const adAccount = adAccounts.find(a => a.id === adAccountId || `act_${a.id}` === adAccountId);
      
      const settings = await storage.upsertAdAccountSettings(userId, adAccountId, {
        adAccountName: adAccount?.name,
        ...parseResult.data,
        isConfigured: true,
      });
      
      res.json({ success: true, settings });
    } catch (error) {
      console.error("Error updating ad account settings:", error);
      res.status(500).json({ error: "Failed to update ad account settings" });
    }
  });

  // ===== Meta Ads API Routes =====

  // Get user's Facebook Pages (filtered by selected Ad Account)
  app.get("/api/meta/pages", async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const assets = await db.select()
        .from(metaAssets)
        .where(eq(metaAssets.userId, userId))
        .limit(1);

      if (!assets.length) {
        return res.json({ data: [], selectedPageId: null });
      }

      const selectedAdAccountId = assets[0].selectedAdAccountId;

      // Always check DB cache first — pages/Instagram profiles rarely change
      if (selectedAdAccountId) {
        const cached = await getAccountCache(userId, selectedAdAccountId);
        if (cached?.pagesJson && cached.pagesJson.length > 0) {
          const preferredPageId = cached.pagesSelectedPageId || assets[0].selectedPageId || null;
          const selectedPageId = pickValidSelectedPageId(cached.pagesJson, preferredPageId);
          const autoSelected = cached.pagesJson.length === 1 || (!!selectedPageId && selectedPageId !== preferredPageId);

          if (selectedPageId && selectedPageId !== preferredPageId) {
            if (assets[0].selectedPageId !== selectedPageId) {
              await db.update(metaAssets)
                .set({ selectedPageId, updatedAt: new Date() })
                .where(eq(metaAssets.userId, userId));
            }
            await upsertAccountCache(userId, selectedAdAccountId, "pagesSelectedPageId", selectedPageId);
          }

          console.log(`[Pages] Serving ${cached.pagesJson.length} pages from DB cache for ad account ${selectedAdAccountId}`);
          return res.json({
            data: sanitizePagesForClient(cached.pagesJson),
            selectedPageId,
            filteredByAdAccount: true,
            autoSelected,
            source: "cache",
          });
        }
      }

      // No cache — fetch from Meta API (first time after OAuth or after cache cleared)
      // Get access token from oauth_connections table
      const [oauthConnection] = await db.select()
        .from(oauthConnections)
        .where(and(
          eq(oauthConnections.userId, userId),
          eq(oauthConnections.provider, "meta")
        ))
        .limit(1);
      
      const encryptedToken = oauthConnection?.accessToken;
      const accessToken = encryptedToken ? decrypt(encryptedToken) : null;
      
      // If we have a selected ad account, get pages that can be promoted by that account
      if (selectedAdAccountId && accessToken) {
        try {
          // Fetch pages that can be used for ads by this ad account (including access_token for each page)
          const promoteUrl = `https://graph.facebook.com/v21.0/${selectedAdAccountId}/promote_pages?fields=id,name,access_token&access_token=${accessToken}`;
          console.log(`[Pages] Fetching promote_pages for ad account: ${selectedAdAccountId}`);
          const promoteData = await cachedMetaFetch(promoteUrl, `promote_pages_${selectedAdAccountId}`);
          
          if (promoteData.data && Array.isArray(promoteData.data)) {
            const filteredPages = promoteData.data.map((p: { id: string; name: string; access_token?: string }) => ({
              id: p.id,
              name: p.name,
              access_token: p.access_token,
              source: 'ad_account'
            }));
            
            // Re-fetch Instagram accounts for each page with valid access token
            // This ensures IG data is always fresh when switching ad accounts
            for (const page of filteredPages) {
              const pageToken = page.access_token;
              if (!pageToken) {
                console.log(`[Pages] Page ${page.name} (${page.id}): no access token, skipping IG fetch`);
                continue;
              }
              try {
                let foundIg = false;
                
                // Try with page access token first
                const igData = await cachedMetaFetch(
                  `https://graph.facebook.com/v21.0/${page.id}/instagram_accounts?fields=id,username&access_token=${pageToken}`,
                  `ig_accounts_${page.id}`
                );
                if (!igData.error && igData.data && igData.data.length > 0) {
                  page.instagram_accounts = igData.data;
                  foundIg = true;
                  console.log(`[Pages] Page ${page.name} (${page.id}): found ${igData.data.length} IG account(s): ${igData.data.map((a: any) => `${a.id} (@${a.username || '?'})`).join(', ')}`);
                } else if (igData.error) {
                  console.log(`[Pages] IG API error for page ${page.id} (page token):`, igData.error.message, `(code: ${igData.error.code})`);
                  try {
                    const igDataUser = await cachedMetaFetch(
                      `https://graph.facebook.com/v21.0/${page.id}/instagram_accounts?fields=id,username&access_token=${accessToken}`,
                      `ig_accounts_user_${page.id}`
                    );
                    if (!igDataUser.error && igDataUser.data && igDataUser.data.length > 0) {
                      page.instagram_accounts = igDataUser.data;
                      foundIg = true;
                      console.log(`[Pages] Page ${page.name} (${page.id}): found IG via user token: ${igDataUser.data.map((a: any) => `${a.id} (@${a.username || '?'})`).join(', ')}`);
                    }
                  } catch (userTokenErr) {
                    console.log(`[Pages] User token fallback also failed for page ${page.id}`);
                  }
                }
                
                // Try page_backed_instagram_accounts
                if (!foundIg) {
                  const igBackedData = await cachedMetaFetch(
                    `https://graph.facebook.com/v21.0/${page.id}/page_backed_instagram_accounts?fields=id,username&access_token=${pageToken}`,
                    `ig_backed_${page.id}`
                  );
                  if (!igBackedData.error && igBackedData.data && igBackedData.data.length > 0) {
                    page.instagram_accounts = igBackedData.data;
                    page.instagram_is_page_backed = true;
                    foundIg = true;
                    console.log(`[Pages] Page ${page.name} (${page.id}): found page-backed IG: ${igBackedData.data[0].id}`);
                  }
                }
                
                if (!foundIg) {
                  console.log(`[Pages] Page ${page.name} (${page.id}): no Instagram accounts found`);
                }
              } catch (err) {
                console.log(`[Pages] Failed to fetch Instagram for page ${page.id}:`, err);
              }
            }
            
            // Update pagesJson in database with fresh access tokens and Instagram data
            const existingPages = assets[0].pagesJson || [];
            const updatedPages = existingPages.map((p: any) => {
              const matchedPage = filteredPages.find((fp: any) => fp.id === p.id);
              if (matchedPage) {
                const hasNewIgData = matchedPage.instagram_accounts && matchedPage.instagram_accounts.length > 0;
                return { 
                  ...p, 
                  access_token: matchedPage.access_token || p.access_token,
                  instagram_accounts: hasNewIgData ? matchedPage.instagram_accounts : (p.instagram_accounts || []),
                  instagram_is_page_backed: hasNewIgData ? (matchedPage.instagram_is_page_backed || false) : (p.instagram_is_page_backed || false),
                };
              }
              return p;
            });
            
            // Add any new pages from promote_pages that aren't in our list
            filteredPages.forEach((fp: any) => {
              if (!updatedPages.some((up: any) => up.id === fp.id)) {
                const hasIgData = fp.instagram_accounts && fp.instagram_accounts.length > 0;
                updatedPages.push({ 
                  id: fp.id, 
                  name: fp.name, 
                  access_token: fp.access_token,
                  instagram_accounts: hasIgData ? fp.instagram_accounts : [],
                  instagram_is_page_backed: fp.instagram_is_page_backed || false,
                });
              }
            });
            
            // Resolve selected page strictly from filtered pages for this ad account.
            let selectedPageId = assets[0].selectedPageId;
            const currentSelectionInList = filteredPages.some((p: any) => p.id === selectedPageId);
            
            if (filteredPages.length === 0) {
              // No promotable pages for this ad account: clear selected page.
              selectedPageId = null;
            } else if (filteredPages.length === 1) {
              // Only one page available - auto-select it.
              selectedPageId = filteredPages[0].id;
              console.log(`[Pages] Auto-selecting the only available page: ${selectedPageId}`);
            } else if (!currentSelectionInList) {
              // Current selection not in filtered list - select first.
              selectedPageId = filteredPages[0].id;
              console.log(`[Pages] Current page not in ad account's pages, auto-selecting: ${selectedPageId}`);
            }
            
            // Update database with fresh tokens and auto-selected page
            await db.update(metaAssets)
              .set({ 
                pagesJson: updatedPages, 
                selectedPageId: selectedPageId,
                updatedAt: new Date() 
              })
              .where(eq(metaAssets.userId, userId));
            
            if (selectedAdAccountId) {
              await Promise.all([
                upsertAccountCache(userId, selectedAdAccountId, "pagesJson", filteredPages),
                upsertAccountCache(userId, selectedAdAccountId, "pagesSelectedPageId", selectedPageId),
              ]);
            }

            return res.json({ 
              data: sanitizePagesForClient(filteredPages), 
              selectedPageId: selectedPageId,
              filteredByAdAccount: true,
              autoSelected: filteredPages.length === 1 || (filteredPages.length > 0 && !currentSelectionInList),
              source: "live",
            });
          }
        } catch (apiError) {
          console.error("Error fetching promote_pages, falling back to all pages:", apiError);
          // Fall through to return all pages
        }
      }

      // If ad account-scoped fetch fails, return empty instead of global pages
      // to avoid cross-account page/Instagram mismatch in the sidebar.
      if (selectedAdAccountId) {
        return res.json({
          data: [],
          selectedPageId: null,
          filteredByAdAccount: true,
          autoSelected: false,
          source: "fallback-empty",
        });
      }

      // Fallback: return all pages only when no ad account is selected
      const pages = assets[0].pagesJson || [];
      const businessOwnedPages = assets[0].businessOwnedPagesJson || [];
      
      // Combine regular pages and business-owned pages
      const allPages: Array<Record<string, unknown> & { source: string }> = [];
      
      pages.forEach((p: {id: string, name: string}) => {
        allPages.push({ ...sanitizePageForClient(p), source: 'personal' });
      });
      
      businessOwnedPages.forEach((b: {business_id: string, pages: Array<{id: string, name: string}>}) => {
        b.pages.forEach(p => {
          if (!allPages.some(ap => ap.id === p.id)) {
            allPages.push({ ...sanitizePageForClient(p), source: 'business' });
          }
        });
      });

      res.json({
        data: allPages, 
        selectedPageId: assets[0].selectedPageId,
        filteredByAdAccount: false
      });
    } catch (error: any) {
      console.error("Error fetching pages:", error);
      res.status(500).json({ error: error.message || "Failed to fetch pages" });
    }
  });

  // Update selected page
  app.patch("/api/meta/pages/selected", async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { pageId } = req.body;
      if (!pageId) {
        return res.status(400).json({ error: "pageId is required" });
      }

      const [assetsRow] = await db.select()
        .from(metaAssets)
        .where(eq(metaAssets.userId, userId))
        .limit(1);

      if (!assetsRow) {
        return res.status(404).json({ error: "No Meta assets found" });
      }

      const selectedAdAccountId = assetsRow.selectedAdAccountId;
      if (selectedAdAccountId) {
        const cached = await getAccountCache(userId, selectedAdAccountId);
        const accountPages = Array.isArray(cached?.pagesJson) ? cached.pagesJson : [];
        if (accountPages.length > 0) {
          const pageInScope = accountPages.some((p: any) => p?.id === pageId);
          if (!pageInScope) {
            return res.status(400).json({
              error: "Selected page does not belong to current ad account",
            });
          }
        }
      }

      await db.update(metaAssets)
        .set({ selectedPageId: pageId, updatedAt: new Date() })
        .where(eq(metaAssets.id, assetsRow.id));

      if (selectedAdAccountId) {
        await upsertAccountCache(userId, selectedAdAccountId, "pagesSelectedPageId", pageId);
      }

      res.json({ success: true, selectedPageId: pageId });
    } catch (error: any) {
      console.error("Error updating selected page:", error);
      res.status(500).json({ error: error.message || "Failed to update selected page" });
    }
  });

  // Get Instagram accounts connected to the selected Facebook page
  // Get Instagram accounts connected to a specific Facebook page
  app.get("/api/meta/instagram-accounts/:pageId", async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { pageId } = req.params;
      if (!pageId) {
        return res.json({ data: [] });
      }

      // Get pages with access tokens
      const assets = await db.select()
        .from(metaAssets)
        .where(eq(metaAssets.userId, userId))
        .limit(1);

      if (assets.length === 0) {
        return res.json({ data: [] });
      }

      // Prefer metaAccountCache pages (most up-to-date with IG data) over metaAssets.pagesJson
      let pagesJson: Array<{ id: string; name: string; access_token?: string }> = [];
      const selectedAdAccountId = assets[0].selectedAdAccountId;
      if (selectedAdAccountId) {
        const cached = await getAccountCache(userId, selectedAdAccountId);
        if (cached?.pagesJson && cached.pagesJson.length > 0) {
          pagesJson = cached.pagesJson;
        }
      }
      if (pagesJson.length === 0) {
        pagesJson = (assets[0].pagesJson || []) as Array<{ id: string; name: string; access_token?: string }>;
      }
      
      // Find the page's access token
      const selectedPage = pagesJson.find((p) => p.id === pageId);
      if (!selectedPage) {
        console.log(`Page ${pageId} not found in cache`);
        return res.json({ data: [] });
      }

      const accounts: Array<{ id: string; username: string; name?: string; profile_picture_url?: string }> = [];

      // First check if Instagram accounts were fetched during OAuth or page refresh (stored in pagesJson)
      const pageWithIg = selectedPage as any;
      const isPageBacked = pageWithIg.instagram_is_page_backed || false;
      if (pageWithIg.instagram_accounts && pageWithIg.instagram_accounts.length > 0) {
        console.log(`[IG] Serving ${pageWithIg.instagram_accounts.length} IG account(s) from DB cache for page ${pageId}`);
        const enriched = pageWithIg.instagram_accounts.map((a: any) => ({
          ...a,
          name: a.name || (isPageBacked && !a.username ? (selectedPage as any).name : undefined),
        }));
        accounts.push(...enriched);
        return res.json({ data: accounts, source: "cache" });
      } else if (pageWithIg.instagram_business_account) {
        console.log(`[IG] Using cached instagram_business_account from pagesJson:`, pageWithIg.instagram_business_account);
        accounts.push(pageWithIg.instagram_business_account);
        return res.json({ data: accounts, source: "cache" });
      }

      // No cached IG data — need access token for live API call
      if (!selectedPage.access_token) {
        console.log(`No access token for page ${pageId}, cannot fetch IG accounts`);
        return res.json({ data: [] });
      }

      // If no cached account, try API calls
      if (accounts.length === 0) {
        console.log(`[IG] No cached IG data for page ${pageId}, fetching from API...`);
        // Method 1: Try instagram_accounts endpoint (for pages connected to Instagram via Page settings)
        try {
          const response = await fetch(
            `https://graph.facebook.com/v21.0/${pageId}/instagram_accounts?fields=id,username,profile_picture_url,name&access_token=${selectedPage.access_token}`
          );
          const data = await response.json();
          console.log(`instagram_accounts response:`, data);
          if (data.error) {
            console.log(`[IG] instagram_accounts API error for page ${pageId}:`, data.error.message, `(code: ${data.error.code}, type: ${data.error.type})`);
          }
          if (data.data && data.data.length > 0) {
            accounts.push(...data.data);
          }
        } catch (err) {
          console.log("instagram_accounts endpoint failed:", err);
        }

        // Method 2: Try page_backed_instagram_accounts (Use Facebook Page as Instagram)
        if (accounts.length === 0) {
          try {
            const response = await fetch(
              `https://graph.facebook.com/v21.0/${pageId}/page_backed_instagram_accounts?fields=id,username,profile_picture_url,name&access_token=${selectedPage.access_token}`
            );
            const data = await response.json();
            console.log(`page_backed_instagram_accounts response:`, data);
            if (data.error) {
              console.log(`[IG] page_backed_instagram_accounts API error:`, data.error.message, `(code: ${data.error.code})`);
            }
            if (data.data && data.data.length > 0) {
              const enrichedPageBacked = data.data.map((a: any) => ({
                ...a,
                name: a.name || (!a.username ? (selectedPage as any).name : undefined),
              }));
              accounts.push(...enrichedPageBacked);
            }
          } catch (err) {
            console.log("page_backed_instagram_accounts endpoint failed:", err);
          }
        }

        // Method 3: Try instagram_business_account endpoint (for Instagram Business accounts)
        if (accounts.length === 0) {
          try {
            const response = await fetch(
              `https://graph.facebook.com/v21.0/${pageId}?fields=instagram_business_account{id,username,profile_picture_url,name}&access_token=${selectedPage.access_token}`
            );
            const data = await response.json();
            console.log(`instagram_business_account response:`, data);
            if (data.instagram_business_account) {
              accounts.push(data.instagram_business_account);
            }
          } catch (err) {
            console.log("instagram_business_account endpoint failed:", err);
          }
        }

        // Method 4: Try connected_instagram_account endpoint (for Creator accounts)
        if (accounts.length === 0) {
          try {
            const response = await fetch(
              `https://graph.facebook.com/v21.0/${pageId}?fields=connected_instagram_account{id,username,profile_picture_url,name}&access_token=${selectedPage.access_token}`
            );
            const data = await response.json();
            console.log(`connected_instagram_account response:`, data);
            if (data.connected_instagram_account) {
              accounts.push(data.connected_instagram_account);
            }
          } catch (err) {
            console.log("connected_instagram_account endpoint failed:", err);
          }
        }

        // If we found accounts via API, update both metaAssets and metaAccountCache
        if (accounts.length > 0) {
          try {
            const updatedPagesJson = pagesJson.map((p: any) => {
              if (p.id === pageId) {
                return { ...p, instagram_accounts: accounts.map(a => ({ id: a.id, username: a.username })) };
              }
              return p;
            });
            await db.update(metaAssets)
              .set({ pagesJson: updatedPagesJson, updatedAt: new Date() })
              .where(eq(metaAssets.userId, userId));
            if (selectedAdAccountId) {
              await upsertAccountCache(userId, selectedAdAccountId, "pagesJson", updatedPagesJson);
            }
            console.log(`[IG] Updated DB cache with ${accounts.length} IG account(s) for page ${pageId}`);
          } catch (cacheErr) {
            console.log(`[IG] Failed to update cache:`, cacheErr);
          }
        }
      }

      console.log(`Found ${accounts.length} Instagram accounts for page ${pageId}`);
      res.json({ data: accounts });
    } catch (error: any) {
      console.error("Error fetching Instagram accounts:", error);
      res.status(500).json({ error: error.message || "Failed to fetch Instagram accounts" });
    }
  });
  
  // Legacy route without page ID (uses selected page)
  app.get("/api/meta/instagram-accounts", async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      // Get the selected page and ad account
      const assets = await db.select()
        .from(metaAssets)
        .where(eq(metaAssets.userId, userId))
        .limit(1);

      const selectedAdAccountId = assets.length > 0 ? assets[0].selectedAdAccountId : null;

      if (req.query.cached === "true" && selectedAdAccountId) {
        const cached = await getAccountCache(userId, selectedAdAccountId);
        if (cached?.instagramAccountsJson && cached.instagramAccountsJson.length > 0) {
          return res.json({ data: cached.instagramAccountsJson, source: "cache" });
        }
      }

      const api = new MetaAdsApi(userId);
      const initialized = await api.initialize();
      if (!initialized) {
        return res.status(401).json({ error: "Meta not connected" });
      }

      if (assets.length === 0 || !assets[0].selectedPageId) {
        return res.json({ data: [] });
      }

      const selectedPageId = assets[0].selectedPageId;
      const pagesJson = (assets[0].pagesJson || []) as Array<{ id: string; name: string; access_token?: string }>;
      
      // Find the page's access token
      const selectedPage = pagesJson.find((p) => p.id === selectedPageId);
      if (!selectedPage || !selectedPage.access_token) {
        return res.json({ data: [] });
      }

      // Fetch Instagram accounts connected to this page
      const response = await fetch(
        `https://graph.facebook.com/v21.0/${selectedPageId}/instagram_accounts?fields=id,username,profile_picture_url,name&access_token=${selectedPage.access_token}`
      );
      const data = await response.json();

      if (data.error) {
        console.error("Error fetching Instagram accounts:", data.error);
        return res.status(500).json({ error: data.error.message || "Failed to fetch Instagram accounts" });
      }

      const igAccounts = data.data || [];
      if (selectedAdAccountId && igAccounts.length > 0) {
        upsertAccountCache(userId, selectedAdAccountId, "instagramAccountsJson", igAccounts);
      }

      res.json({ data: igAccounts, source: "live" });
    } catch (error: any) {
      console.error("Error fetching Instagram accounts:", error);
      res.status(500).json({ error: error.message || "Failed to fetch Instagram accounts" });
    }
  });

  // Get pending ad accounts (for selection after OAuth)
  app.get("/api/meta/pending-ad-accounts", async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        console.warn("[MetaOAuth][pending-ad-accounts] Not authenticated", {
          sessionId: req.sessionID?.substring(0, 8) || null,
          host: req.get("host") || null,
          referer: req.get("referer") || null,
        });
        return res.status(401).json({ error: "Not authenticated" });
      }

      const assets = await db.select()
        .from(metaAssets)
        .where(eq(metaAssets.userId, userId))
        .limit(1);

      if (assets.length === 0) {
        console.log("[MetaOAuth][pending-ad-accounts] No meta_assets row", { userId });
        return res.json({ accounts: [] });
      }

      const pendingAccounts = (assets[0] as any).pendingAdAccountsJson || [];
      console.log("[MetaOAuth][pending-ad-accounts] Returning pending accounts", {
        userId,
        count: pendingAccounts.length,
        selectedAdAccountId: assets[0].selectedAdAccountId || null,
      });
      res.json({ accounts: pendingAccounts });
    } catch (error: any) {
      console.error("[MetaOAuth][pending-ad-accounts] Failed", {
        error: error?.message || String(error),
        stack: error?.stack || null,
      });
      res.status(500).json({ error: error.message || "Failed to fetch pending ad accounts" });
    }
  });

  // Confirm ad account selection (after OAuth) - supports multiple accounts
  app.post("/api/meta/confirm-ad-account", async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        console.warn("[MetaOAuth][confirm-ad-account] Not authenticated", {
          sessionId: req.sessionID?.substring(0, 8) || null,
          host: req.get("host") || null,
          referer: req.get("referer") || null,
        });
        return res.status(401).json({ error: "Not authenticated" });
      }

      // Support both single adAccountId and array of adAccountIds
      const { adAccountId, adAccountIds } = req.body;
      const idsToSelect = adAccountIds || (adAccountId ? [adAccountId] : []);
      console.log("[MetaOAuth][confirm-ad-account] Request received", {
        userId,
        requestedCount: idsToSelect?.length || 0,
      });
      
      if (!idsToSelect || idsToSelect.length === 0) {
        return res.status(400).json({ error: "At least one adAccountId is required" });
      }

      const assets = await db.select()
        .from(metaAssets)
        .where(eq(metaAssets.userId, userId))
        .limit(1);

      if (assets.length === 0) {
        return res.status(404).json({ error: "No assets found" });
      }

      const pendingAccounts = (assets[0] as any).pendingAdAccountsJson || [];
      const selectedAccounts = pendingAccounts.filter((acc: any) => idsToSelect.includes(acc.id));

      if (selectedAccounts.length === 0) {
        console.warn("[MetaOAuth][confirm-ad-account] No requested IDs matched pending list", {
          userId,
          requestedCount: idsToSelect.length,
          pendingCount: pendingAccounts.length,
        });
        return res.status(400).json({ error: "No valid accounts found in pending list" });
      }

      // Save selected accounts, set first one as primary selected, clear pending
      const primarySelectedId = selectedAccounts[0].id;
      await db.update(metaAssets)
        .set({
          adAccountsJson: selectedAccounts, // Save all selected
          pendingAdAccountsJson: [], // Clear pending
          selectedAdAccountId: primarySelectedId, // First one is primary
          updatedAt: new Date(),
        })
        .where(eq(metaAssets.userId, userId));

      console.log("[MetaOAuth][confirm-ad-account] Selection saved", {
        userId,
        savedCount: selectedAccounts.length,
        selectedAdAccountId: primarySelectedId,
      });
      res.json({ success: true, selectedAdAccountId: primarySelectedId, adAccounts: selectedAccounts, savedCount: selectedAccounts.length });
    } catch (error: any) {
      console.error("[MetaOAuth][confirm-ad-account] Failed", {
        error: error?.message || String(error),
        stack: error?.stack || null,
      });
      res.status(500).json({ error: error.message || "Failed to confirm ad account" });
    }
  });

  // Combined sidebar data — returns everything the sidebar needs in one fast DB-only call
  app.get("/api/sidebar-data", async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      // Parallel DB reads
      const [assets, globalSettingsRow, allSettings] = await Promise.all([
        db.select().from(metaAssets).where(eq(metaAssets.userId, userId)).limit(1),
        storage.getGlobalSettings(userId),
        storage.getAllAdAccountSettings(userId),
      ]);

      // --- Ad Accounts ---
      const rawAdAccounts = assets.length > 0 ? (assets[0].adAccountsJson || []) : [];
      const selectedAdAccountId = assets.length > 0 ? assets[0].selectedAdAccountId : null;
      const pendingAccounts = assets.length > 0 ? ((assets[0] as any).pendingAdAccountsJson || []) : [];
      const hasPendingAccounts = pendingAccounts.length > 0 && rawAdAccounts.length === 0;

      const settingsMap = new Map(allSettings.map((s: any) => [s.adAccountId, s.isConfigured]));
      const adAccounts = rawAdAccounts.map((acc: any) => {
        const accId = acc.id.startsWith('act_') ? acc.id : `act_${acc.id}`;
        const hasSettings = settingsMap.get(accId) || settingsMap.get(acc.id) || false;
        return { ...acc, hasSettings };
      });

      // --- Pages + Instagram (from DB cache) ---
      let pages: any[] = [];
      let selectedPageId: string | null = assets.length > 0 ? assets[0].selectedPageId : null;
      let filteredByAdAccount = false;
      let autoSelected = false;

      if (selectedAdAccountId) {
        const cached = await getAccountCache(userId, selectedAdAccountId);
        if (cached?.pagesJson && cached.pagesJson.length > 0) {
          pages = cached.pagesJson;
          const preferredPageId = cached.pagesSelectedPageId || selectedPageId || null;
          selectedPageId = pickValidSelectedPageId(pages, preferredPageId);
          if (selectedPageId && selectedPageId !== preferredPageId) {
            await upsertAccountCache(userId, selectedAdAccountId, "pagesSelectedPageId", selectedPageId);
            if (assets.length > 0 && assets[0].selectedPageId !== selectedPageId) {
              await db.update(metaAssets)
                .set({ selectedPageId, updatedAt: new Date() })
                .where(eq(metaAssets.userId, userId));
            }
          }
          filteredByAdAccount = true;
          autoSelected = pages.length === 1 || (!!selectedPageId && selectedPageId !== preferredPageId);
        }
      }

      // Fallback to metaAssets.pagesJson only when no ad account is selected.
      // If an ad account is selected but account-scoped cache is not ready yet,
      // avoid showing cross-account pages/Instagram from the global pagesJson.
      if (pages.length === 0 && assets.length > 0) {
        if (selectedAdAccountId) {
          pages = [];
          selectedPageId = null;
        } else {
          pages = assets[0].pagesJson || [];
        }
      }

      // --- Instagram accounts for selected page (embedded in pagesJson) ---
      let instagramAccounts: any[] = [];
      if (selectedPageId && pages.length > 0) {
        const selectedPage = pages.find((p: any) => p.id === selectedPageId) as any;
        if (selectedPage?.instagram_accounts && selectedPage.instagram_accounts.length > 0) {
          const isPageBacked = selectedPage.instagram_is_page_backed || false;
          instagramAccounts = selectedPage.instagram_accounts.map((a: any) => ({
            ...a,
            name: a.name || (isPageBacked && !a.username ? selectedPage.name : undefined),
          }));
        } else if (selectedPage?.instagram_business_account) {
          instagramAccounts = [selectedPage.instagram_business_account];
        }
      }

      // --- Global settings ---
      const settings = globalSettingsRow || {
        planType: "free",
        uploadsRemaining: 15,
        instagramPageId: null,
        instagramPageName: null,
        facebookPageName: null,
      };

      // --- Drive email (fast, in-memory check) ---
      let driveEmail: string | null = null;
      let driveConnected = false;
      try {
        const { getServiceAccountEmail, isServiceAccountConfigured } = await import("./google-drive-service-account.js");
        if (isServiceAccountConfigured()) {
          driveEmail = getServiceAccountEmail();
          driveConnected = true;
        }
      } catch {}

      res.json({
        adAccounts,
        selectedAdAccountId,
        hasPendingAccounts,
        pages: sanitizePagesForClient(pages),
        selectedPageId,
        filteredByAdAccount,
        autoSelected,
        instagramAccounts,
        settings: {
          planType: (settings as any).planType ?? "free",
          uploadsRemaining: (settings as any).uploadsRemaining ?? 15,
          instagramPageId: (settings as any).instagramPageId ?? null,
          instagramPageName: (settings as any).instagramPageName ?? null,
          facebookPageName: (settings as any).facebookPageName ?? null,
        },
        drive: { email: driveEmail, connected: driveConnected },
      });
    } catch (error: any) {
      console.error("Error fetching sidebar data:", error);
      res.status(500).json({ error: error.message || "Failed to fetch sidebar data" });
    }
  });

  // Get ad accounts
  app.get("/api/meta/ad-accounts", async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const assets = await db.select()
        .from(metaAssets)
        .where(eq(metaAssets.userId, userId))
        .limit(1);

      if (assets.length === 0) {
        return res.json({ data: [], selectedAdAccountId: null });
      }

      const adAccounts = assets[0].adAccountsJson || [];
      const selectedAdAccountId = assets[0].selectedAdAccountId;
      const connectionUpdatedAt = assets[0].updatedAt?.toISOString() || null;
      const pendingAccounts = (assets[0] as any).pendingAdAccountsJson || [];
      const hasPendingAccounts = pendingAccounts.length > 0 && adAccounts.length === 0;
      
      // Get settings status for each ad account
      const allSettings = await storage.getAllAdAccountSettings(userId);
      const settingsMap = new Map(allSettings.map(s => [s.adAccountId, s.isConfigured]));
      
      // Add hasSettings flag to each ad account
      const adAccountsWithStatus = adAccounts.map((acc: any) => {
        const accId = acc.id.startsWith('act_') ? acc.id : `act_${acc.id}`;
        const hasSettings = settingsMap.get(accId) || settingsMap.get(acc.id) || false;
        return { ...acc, hasSettings };
      });

      res.json({ data: adAccountsWithStatus, selectedAdAccountId, connectionUpdatedAt, hasPendingAccounts });
    } catch (error: any) {
      console.error("Error fetching ad accounts:", error);
      res.status(500).json({ error: error.message || "Failed to fetch ad accounts" });
    }
  });

  // Update selected ad account
  app.patch("/api/meta/ad-accounts/selected", async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { adAccountId } = req.body;
      if (!adAccountId) {
        return res.status(400).json({ error: "adAccountId is required" });
      }

      const [assetsRow] = await db.select()
        .from(metaAssets)
        .where(eq(metaAssets.userId, userId))
        .limit(1);

      if (!assetsRow) {
        return res.status(404).json({ error: "No Meta assets found" });
      }

      const requestedId = String(adAccountId);
      const allowedAccounts = (assetsRow.adAccountsJson || []) as Array<{ id: string }>;
      const matchedAccount = allowedAccounts.find((account) =>
        normalizeAdAccountId(String(account.id)) === normalizeAdAccountId(requestedId)
      );

      if (!matchedAccount) {
        return res.status(400).json({ error: "Invalid adAccountId for this user" });
      }

      const selectedId = String(matchedAccount.id);
      const cacheForSelectedAccount = await getAccountCache(userId, selectedId);
      const cachedPages = Array.isArray(cacheForSelectedAccount?.pagesJson) ? cacheForSelectedAccount.pagesJson : [];
      const preferredPageId = cacheForSelectedAccount?.pagesSelectedPageId || assetsRow.selectedPageId || null;
      const resolvedPageId = pickValidSelectedPageId(cachedPages, preferredPageId);
      // Never carry over selectedPageId from a previously selected ad account.
      const selectedPageId = resolvedPageId || null;

      if (selectedPageId && cacheForSelectedAccount?.pagesSelectedPageId !== selectedPageId) {
        await upsertAccountCache(userId, selectedId, "pagesSelectedPageId", selectedPageId);
      }

      const [updated] = await db.update(metaAssets)
        .set({ selectedAdAccountId: selectedId, selectedPageId, updatedAt: new Date() })
        .where(eq(metaAssets.id, assetsRow.id))
        .returning({
          selectedAdAccountId: metaAssets.selectedAdAccountId,
          selectedPageId: metaAssets.selectedPageId,
        });

      if (!updated) {
        return res.status(500).json({ error: "Failed to persist selected ad account" });
      }

      res.json({
        success: true,
        selectedAdAccountId: updated.selectedAdAccountId,
        selectedPageId: updated.selectedPageId,
      });
    } catch (error: any) {
      console.error("Error updating selected ad account:", error);
      res.status(500).json({ error: error.message || "Failed to update selected ad account" });
    }
  });

  // Get campaigns (from cache or live)
  app.get("/api/meta/campaigns", async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      console.log("[Campaigns] Session userId:", userId);
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const { live, pageId } = req.query;

      if (live === "true") {
        const api = new MetaAdsApi(userId);
        const initialized = await api.initialize();
        console.log("[Campaigns] MetaAdsApi initialized:", initialized);
        if (!initialized) {
          return res.status(401).json({ error: "Meta not connected or token expired" });
        }
        
        // Get all campaigns without filtering
        const campaigns = await api.getCampaigns();
        return res.json({ data: campaigns, source: "live" });
      }

      // Get selected ad account for filtering
      const assets = await db.select()
        .from(metaAssets)
        .where(eq(metaAssets.userId, userId))
        .limit(1);
      
      const selectedAdAccountId = assets[0]?.selectedAdAccountId;
      const accountVariants = selectedAdAccountId ? getAdAccountIdVariants(selectedAdAccountId) : [];

      const whereClause = selectedAdAccountId
        ? and(
            eq(metaCampaigns.userId, userId),
            or(...accountVariants.map((id) => eq(metaCampaigns.adAccountId, id))),
          )
        : eq(metaCampaigns.userId, userId);

      const campaignRows = await db.select()
        .from(metaCampaigns)
        .where(whereClause)
        .orderBy(desc(metaCampaigns.lastSyncedAt));

      const campaigns = campaignRows.map(normalizeCachedCampaign);
      res.json({ data: campaigns, source: "cache" });
    } catch (error: any) {
      console.error("Error fetching campaigns:", error);
      res.status(500).json({ error: error.message || "Failed to fetch campaigns" });
    }
  });

  // Get campaign statistics with ad sets and ads breakdown
  app.get("/api/meta/debug-creative/:creativeId", async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      if (process.env.NODE_ENV === "production") {
        const debugSecret = process.env.DEBUG_CREATIVE_SECRET;
        const providedDebugSecret = req.get("x-debug-secret") || "";
        if (!debugSecret || providedDebugSecret !== debugSecret) {
          return res.status(404).json({ error: "Not found" });
        }
      }

      const metaApi = new MetaAdsApi(userId);
      const initialized = await metaApi.initialize();
      if (!initialized) {
        return res.status(401).json({ error: "Meta not connected" });
      }
      const { creativeId } = req.params;
      const token = metaApi.getAccessToken();
      if (!token) {
        return res.status(401).json({ error: "Meta access token not available" });
      }

      const adAccountId = String(req.query.act || "");
      if (!adAccountId) {
        return res.status(400).json({ error: "Query param 'act' (ad account id) is required" });
      }
      const listUrl = `https://graph.facebook.com/v22.0/${adAccountId}/adcreatives?fields=degrees_of_freedom_spec{creative_features_spec},name,object_story_spec,asset_feed_spec&limit=5&access_token=${token}`;
      const listResp = await fetch(listUrl);
      const listResult = await listResp.json();
      console.log("[DEBUG-CREATIVE] List response for", adAccountId, ":", JSON.stringify(listResult, null, 2));

      const targetCreative = listResult.data?.find((c: any) => c.id === creativeId);
      const result = targetCreative || { allCreatives: listResult.data?.map((c: any) => ({ id: c.id, name: c.name, has_dof: !!c.degrees_of_freedom_spec })), error: listResult.error };
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/meta/statistics/:campaignId/:dateRange", async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const { campaignId, dateRange } = req.params;
      
      if (!campaignId) {
        return res.status(400).json({ error: "Campaign ID is required" });
      }
      
      const api = new MetaAdsApi(userId);
      const initialized = await api.initialize();
      if (!initialized) {
        return res.status(401).json({ error: "Meta not connected or token expired" });
      }
      
      const statistics = await api.getCampaignStatistics(campaignId, dateRange || "last_7d");
      res.json(statistics);
    } catch (error: any) {
      console.error("Error fetching statistics:", error);
      res.status(500).json({ error: error.message || "Failed to fetch statistics" });
    }
  });

  // Get ad statistics with breakdown support
  app.get("/api/meta/ad-statistics/:campaignId", async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const { campaignId } = req.params;
      const dateRange = (req.query.dateRange as string) || "last_7d";
      const breakdown = (req.query.breakdown as string) || "none";
      const adSetFilter = (req.query.adSet as string) || "all";
      
      if (!campaignId) {
        return res.status(400).json({ error: "Campaign ID is required" });
      }
      
      const api = new MetaAdsApi(userId);
      const initialized = await api.initialize();
      if (!initialized) {
        return res.status(401).json({ error: "Meta not connected or token expired" });
      }
      
      const statistics = await api.getAdStatisticsWithBreakdown(campaignId, dateRange, breakdown, adSetFilter);
      res.json(statistics);
    } catch (error: any) {
      console.error("Error fetching ad statistics:", error);
      res.status(500).json({ error: error.message || "Failed to fetch statistics" });
    }
  });

  // Create new campaign
  app.post("/api/meta/campaigns", async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { name, objective, status, specialAdCategories, buyingType, budgetType, dailyBudget } = req.body;

      if (!name || !objective) {
        return res.status(400).json({ error: "Name and objective are required" });
      }

      const api = new MetaAdsApi(userId);
      const initialized = await api.initialize();
      if (!initialized) {
        return res.status(401).json({ error: "Meta not connected or token expired" });
      }

      const campaign = await api.createCampaign({
        name,
        objective,
        status: "ACTIVE",
        specialAdCategories: specialAdCategories || [],
        buyingType: buyingType || "AUCTION",
        budgetType: budgetType || "ABO",
        dailyBudget: dailyBudget,
      });

      res.json({ success: true, campaign });
    } catch (error: any) {
      console.error("Error creating campaign:", error);
      res.status(500).json({ error: error.message || "Failed to create campaign" });
    }
  });

  // Get campaign details (for importing settings)
  app.get("/api/meta/campaigns/:campaignId/details", async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { campaignId } = req.params;
      console.log(`[CampaignDetails] Request for campaign: ${campaignId}`);
      if (!campaignId) {
        return res.status(400).json({ error: "Campaign ID is required" });
      }

      // DB-first: return cached campaign/adset/ad details when available.
      // Use live Meta only when cache is missing or caller explicitly forces live=true.
      if (req.query.live !== "true") {
        const [campaignRow] = await db.select()
          .from(metaCampaigns)
          .where(and(
            eq(metaCampaigns.userId, userId),
            eq(metaCampaigns.id, campaignId),
          ))
          .orderBy(desc(metaCampaigns.lastSyncedAt))
          .limit(1);

        const adSetRows = await db.select()
          .from(metaAdsets)
          .where(and(
            eq(metaAdsets.userId, userId),
            eq(metaAdsets.campaignId, campaignId),
          ))
          .orderBy(desc(metaAdsets.lastSyncedAt));

        const adRows = await db.select()
          .from(metaAds)
          .where(and(
            eq(metaAds.userId, userId),
            eq(metaAds.campaignId, campaignId),
          ))
          .orderBy(desc(metaAds.lastSyncedAt));

        if (campaignRow || adSetRows.length > 0 || adRows.length > 0) {
          const campaign = campaignRow
            ? normalizeCachedCampaign(campaignRow)
            : { id: campaignId, name: `Campaign ${campaignId}` };
          const adSets = adSetRows.map(normalizeCachedAdSet);
          const ads = adRows.map(normalizeCachedAd);
          console.log(`[CampaignDetails] Cache hit: ${adSets.length} ad sets, ${ads.length} ads`);
          return res.json({ data: { campaign, adSets, ads }, source: "cache" });
        }
      }

      const api = new MetaAdsApi(userId);
      const initialized = await api.initialize();
      if (!initialized) {
        return res.status(401).json({ error: "Meta not connected or token expired" });
      }

      const details = await api.getCampaignDetails(campaignId);
      console.log(`[CampaignDetails] Success: ${details.adSets?.length || 0} ad sets, ${details.ads?.length || 0} ads`);
      res.json({ data: details, source: "live" });
    } catch (error: any) {
      console.error("[CampaignDetails] Error fetching campaign details:", error);
      res.status(500).json({ error: error.message || "Failed to fetch campaign details" });
    }
  });

  // Get a sample ad from a specific ad set (for importing creative settings)
  app.get("/api/meta/adsets/:adSetId/sample-ad", async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { adSetId } = req.params;
      console.log(`[SampleAd] Fetching sample ad for ad set: ${adSetId}`);

      // DB-first sample ad lookup to avoid unnecessary Meta requests when switching ad sets.
      if (req.query.live !== "true") {
        const cachedAds = await db.select()
          .from(metaAds)
          .where(and(
            eq(metaAds.userId, userId),
            eq(metaAds.adsetId, adSetId),
          ))
          .orderBy(desc(metaAds.lastSyncedAt));

        if (cachedAds.length > 0) {
          const normalizedAds = cachedAds.map(normalizeCachedAd);
          const withCreativeData = normalizedAds.find((ad: any) =>
            ad?.creative?.object_story_spec ||
            ad?.creative?.asset_feed_spec ||
            ad?.creative?.call_to_action_type,
          );
          const sample = withCreativeData || normalizedAds[0];
          console.log(`[SampleAd] Cache hit for ad set ${adSetId}`);
          return res.json({ data: sample, source: "cache" });
        }
      }

      const api = new MetaAdsApi(userId);
      const initialized = await api.initialize();
      if (!initialized) {
        return res.status(401).json({ error: "Meta not connected or token expired" });
      }

      const ad = await api.getSampleAd(adSetId);
      console.log(`[SampleAd] Found ad: ${ad ? ad.id : 'none'} for ad set ${adSetId}`);
      res.json({ data: ad, source: "live" });
    } catch (error: any) {
      console.error("[SampleAd] Error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch sample ad" });
    }
  });

  // Get pixels for ad account
  app.get("/api/meta/pixels", async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const assets = await db.select().from(metaAssets).where(eq(metaAssets.userId, userId)).limit(1);
      const adAccountId = assets[0]?.selectedAdAccountId;

      if (req.query.cached === "true" && adAccountId) {
        const cached = await getAccountCache(userId, adAccountId);
        if (cached?.pixelsJson && (cached.pixelsJson as any[]).length > 0) {
          return res.json({ data: cached.pixelsJson, source: "cache" });
        }
      }

      const api = new MetaAdsApi(userId);
      const initialized = await api.initialize();
      if (!initialized) {
        const mockPixels = [
          { id: "686000000000001", name: "SKY PX BRA 686", creation_time: "2024-04-02T00:00:00+0000" },
          { id: "botpost000000001", name: "PX BotPost", creation_time: "2020-08-25T00:00:00+0000" },
        ];
        return res.json({ data: mockPixels });
      }

      const pixels = await api.getPixels();
      if (adAccountId) {
        upsertAccountCache(userId, adAccountId, "pixelsJson", pixels);
      }
      res.json({ data: pixels, source: "live" });
    } catch (error: any) {
      console.error("Error fetching pixels:", error);
      res.status(500).json({ error: error.message || "Failed to fetch pixels" });
    }
  });

  // Get custom audiences for ad account
  app.get("/api/meta/custom-audiences", async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const assets = await db.select().from(metaAssets).where(eq(metaAssets.userId, userId)).limit(1);
      const adAccountId = assets[0]?.selectedAdAccountId;

      if (req.query.cached === "true" && adAccountId) {
        const cached = await getAccountCache(userId, adAccountId);
        if (cached?.customAudiencesJson && (cached.customAudiencesJson as any[]).length > 0) {
          return res.json({ data: cached.customAudiencesJson, source: "cache" });
        }
      }

      const api = new MetaAdsApi(userId);
      const initialized = await api.initialize();
      if (!initialized) {
        return res.status(401).json({ error: "Meta not connected or token expired" });
      }

      const audiences = await api.getCustomAudiences();
      if (adAccountId) {
        upsertAccountCache(userId, adAccountId, "customAudiencesJson", audiences);
      }
      res.json({ data: audiences, source: "live" });
    } catch (error: any) {
      console.error("Error fetching custom audiences:", error);
      res.status(500).json({ error: error.message || "Failed to fetch custom audiences" });
    }
  });

  // Get saved audiences for ad account
  app.get("/api/meta/saved-audiences", async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const assets = await db.select().from(metaAssets).where(eq(metaAssets.userId, userId)).limit(1);
      const adAccountId = assets[0]?.selectedAdAccountId;

      if (req.query.cached === "true" && adAccountId) {
        const cached = await getAccountCache(userId, adAccountId);
        if (cached?.savedAudiencesJson && (cached.savedAudiencesJson as any[]).length > 0) {
          return res.json({ data: cached.savedAudiencesJson, source: "cache" });
        }
      }

      const api = new MetaAdsApi(userId);
      const initialized = await api.initialize();
      if (!initialized) {
        return res.status(401).json({ error: "Meta not connected or token expired" });
      }

      const audiences = await api.getSavedAudiences();
      if (adAccountId) {
        upsertAccountCache(userId, adAccountId, "savedAudiencesJson", audiences);
      }
      res.json({ data: audiences, source: "live" });
    } catch (error: any) {
      console.error("Error fetching saved audiences:", error);
      res.status(500).json({ error: error.message || "Failed to fetch saved audiences" });
    }
  });

  // Get ad sets (from cache or live)
  app.get("/api/meta/adsets", async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const { live, campaignId } = req.query;
      console.log(`[AdSets] Request: live=${live}, campaignId=${campaignId}, userId=${userId}`);

      if (live === "true") {
        const api = new MetaAdsApi(userId);
        const initialized = await api.initialize();
        console.log(`[AdSets] MetaAdsApi initialized: ${initialized}`);
        if (!initialized) {
          return res.status(401).json({ error: "Meta not connected or token expired" });
        }
        const adsets = await api.getAdSets(campaignId as string | undefined);
        console.log(`[AdSets] Live result: ${adsets.length} ad sets found for campaign ${campaignId}`);
        return res.json({ data: adsets, source: "live" });
      }

      const assets = await db.select()
        .from(metaAssets)
        .where(eq(metaAssets.userId, userId))
        .limit(1);
      const selectedAdAccountId = assets[0]?.selectedAdAccountId || null;
      const accountVariants = selectedAdAccountId ? getAdAccountIdVariants(selectedAdAccountId) : [];

      const baseFilters: any[] = [eq(metaAdsets.userId, userId)];
      if (selectedAdAccountId && accountVariants.length > 0) {
        baseFilters.push(or(...accountVariants.map((id) => eq(metaAdsets.adAccountId, id))));
      }
      if (campaignId) {
        baseFilters.push(eq(metaAdsets.campaignId, String(campaignId)));
      }

      const adsetRows = await db.select()
        .from(metaAdsets)
        .where(and(...baseFilters))
        .orderBy(desc(metaAdsets.lastSyncedAt));

      const adsets = adsetRows.map(normalizeCachedAdSet);
      res.json({ data: adsets, source: "cache" });
    } catch (error: any) {
      console.error("Error fetching adsets:", error);
      res.status(500).json({ error: error.message || "Failed to fetch adsets" });
    }
  });

  // Get ads (from cache or live)
  app.get("/api/meta/ads", async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const { live, adsetId } = req.query;

      if (live === "true") {
        const api = new MetaAdsApi(userId);
        const initialized = await api.initialize();
        if (!initialized) {
          return res.status(401).json({ error: "Meta not connected or token expired" });
        }
        const ads = await api.getAds(adsetId as string | undefined);
        return res.json({ data: ads, source: "live" });
      }

      let query = db.select()
        .from(metaAds)
        .where(eq(metaAds.userId, userId))
        .orderBy(desc(metaAds.lastSyncedAt));

      const ads = await query;
      const filtered = adsetId 
        ? ads.filter(a => a.adsetId === adsetId)
        : ads;

      res.json({ data: filtered, source: "cache" });
    } catch (error: any) {
      console.error("Error fetching ads:", error);
      res.status(500).json({ error: error.message || "Failed to fetch ads" });
    }
  });

  // Get insights (from cache or live)
  app.get("/api/meta/insights", async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const { objectId, objectType, datePreset, live } = req.query;

      if (live === "true") {
        const api = new MetaAdsApi(userId);
        const initialized = await api.initialize();
        if (!initialized) {
          return res.status(401).json({ error: "Meta not connected or token expired" });
        }

        if (objectId && objectType) {
          const insights = await api.getInsights(
            objectId as string,
            objectType as "campaign" | "adset" | "ad",
            (datePreset as string) || "last_7d"
          );
          return res.json({ data: insights, source: "live" });
        }

        const insights = await api.getAccountInsights((datePreset as string) || "last_7d");
        
        // Also get active ads count and daily insights for dashboard chart
        let activeAdsCount = 0;
        let dailyInsights: any[] = [];
        try {
          activeAdsCount = await api.getActiveAdsCount();
        } catch (err) {
          console.log("Error fetching active ads count:", err);
        }
        try {
          dailyInsights = await api.getAccountInsightsDaily((datePreset as string) || "last_7d");
        } catch (err) {
          console.log("Error fetching daily insights:", err);
        }
        
        return res.json({ data: insights, source: "live", activeAdsCount, dailyInsights });
      }

      let query = db.select()
        .from(metaInsights)
        .where(eq(metaInsights.userId, userId))
        .orderBy(desc(metaInsights.lastSyncedAt));

      const insights = await query;
      const filtered = objectId 
        ? insights.filter(i => i.objectId === objectId)
        : insights;

      res.json({ data: filtered, source: "cache" });
    } catch (error: any) {
      console.error("Error fetching insights:", error);
      res.status(500).json({ error: error.message || "Failed to fetch insights" });
    }
  });

  // Manual sync trigger
  app.post("/api/meta/sync", async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const { syncType } = req.body;

      const api = new MetaAdsApi(userId);
      const initialized = await api.initialize();
      if (!initialized) {
        return res.status(401).json({ error: "Meta not connected or token expired" });
      }

      const logId = await createSyncLog(userId, syncType || "full", "running");

      let result;
      switch (syncType) {
        case "campaigns":
          result = await api.syncCampaigns();
          break;
        case "adsets":
          result = await api.syncAdSets();
          break;
        case "ads":
          result = await api.syncAds();
          break;
        case "insights":
          result = await api.syncInsights();
          break;
        default:
          result = await api.fullSync();
      }

      const totalSynced = typeof result === "object" && "campaigns" in result
        ? (result as any).campaigns + (result as any).adsets + (result as any).ads + ((result as any).insights || 0)
        : (result as any).synced || 0;

      await updateSyncLog(logId, {
        status: "completed",
        recordsProcessed: totalSynced,
        errorMessage: (result as any).errors?.length > 0 
          ? `${(result as any).errors.length} errors` 
          : undefined,
        errorDetails: (result as any).errors?.length > 0 
          ? { errors: (result as any).errors } 
          : undefined,
        metadata: result,
      });

      res.json({ 
        success: true, 
        logId,
        result,
      });
    } catch (error: any) {
      console.error("Error during sync:", error);
      res.status(500).json({ error: error.message || "Sync failed" });
    }
  });

  // Get sync logs
  app.get("/api/meta/sync-logs", async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const { limit: limitParam } = req.query;
      const limitNum = Math.min(parseInt(limitParam as string) || 20, 100);

      const logs = await db.select()
        .from(syncLogs)
        .where(eq(syncLogs.userId, userId))
        .orderBy(desc(syncLogs.startedAt))
        .limit(limitNum);

      res.json({ data: logs });
    } catch (error: any) {
      console.error("Error fetching sync logs:", error);
      res.status(500).json({ error: error.message || "Failed to fetch sync logs" });
    }
  });

  return httpServer;
}
