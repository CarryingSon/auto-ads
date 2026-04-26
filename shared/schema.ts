import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, jsonb, boolean, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// OAuth Connections table - stores OAuth tokens and connection status
export const oauthConnections = pgTable("oauth_connections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id"),
  provider: text("provider").notNull(), // 'google' | 'meta'
  status: text("status").notNull().default("disconnected"), // 'connected' | 'disconnected' | 'expired'
  accessToken: text("access_token"), // encrypted
  refreshToken: text("refresh_token"), // encrypted
  tokenExpiresAt: timestamp("token_expires_at"),
  accountName: text("account_name"),
  accountEmail: text("account_email"),
  metaUserId: text("meta_user_id"),
  scopes: text("scopes").array(),
  connectedAt: timestamp("connected_at"),
  lastTestedAt: timestamp("last_tested_at"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertOauthConnectionSchema = createInsertSchema(oauthConnections).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertOauthConnection = z.infer<typeof insertOauthConnectionSchema>;
export type OauthConnection = typeof oauthConnections.$inferSelect;

// Meta Assets table - stores ad accounts, pages, and businesses from Meta
export const metaAssets = pgTable("meta_assets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id"),
  metaUserId: text("meta_user_id"),
  adAccountsJson: jsonb("ad_accounts_json").$type<Array<{id: string, name: string, account_status: number}>>().default([]),
  pendingAdAccountsJson: jsonb("pending_ad_accounts_json").$type<Array<{id: string, name: string, account_status: number}>>().default([]),
  pagesJson: jsonb("pages_json").$type<Array<{id: string, name: string}>>().default([]),
  businessesJson: jsonb("businesses_json").$type<Array<{id: string, name: string}>>().default([]),
  businessOwnedPagesJson: jsonb("business_owned_pages_json").$type<Array<{business_id: string, pages: Array<{id: string, name: string}>}>>().default([]),
  selectedAdAccountId: text("selected_ad_account_id"),
  selectedPageId: text("selected_page_id"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertMetaAssetsSchema = createInsertSchema(metaAssets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertMetaAssets = z.infer<typeof insertMetaAssetsSchema>;
export type MetaAssets = typeof metaAssets.$inferSelect;

export const metaAccountCache = pgTable("meta_account_cache", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  adAccountId: text("ad_account_id").notNull(),
  pagesJson: jsonb("pages_json").$type<any[]>().default([]),
  pagesSelectedPageId: text("pages_selected_page_id"),
  instagramAccountsJson: jsonb("instagram_accounts_json").$type<any[]>().default([]),
  pixelsJson: jsonb("pixels_json").$type<any[]>().default([]),
  customAudiencesJson: jsonb("custom_audiences_json").$type<any[]>().default([]),
  savedAudiencesJson: jsonb("saved_audiences_json").$type<any[]>().default([]),
  lastSyncedAt: timestamp("last_synced_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export type MetaAccountCache = typeof metaAccountCache.$inferSelect;

// Google Drive Links table
export const googleDriveLinks = pgTable("google_drive_links", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id"),
  lastDriveRootUrl: text("last_drive_root_url"),
  lastDriveRootFolderId: text("last_drive_root_folder_id"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertGoogleDriveLinksSchema = createInsertSchema(googleDriveLinks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertGoogleDriveLinks = z.infer<typeof insertGoogleDriveLinksSchema>;
export type GoogleDriveLinks = typeof googleDriveLinks.$inferSelect;

// OAuth State table - for cross-domain state verification
export const oauthStates = pgTable("oauth_states", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  state: text("state").notNull().unique(),
  provider: text("provider").notNull(), // 'meta' | 'google'
  userId: varchar("user_id"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
});

export type OauthState = typeof oauthStates.$inferSelect;

// Legacy connections table for backwards compatibility
export const connections = pgTable("connections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id"),
  provider: text("provider").notNull(), // 'google_drive' | 'meta'
  status: text("status").notNull().default("disconnected"), // 'connected' | 'disconnected'
  accountName: text("account_name"),
  accountEmail: text("account_email"),
  scopes: text("scopes").array(),
  connectedAt: timestamp("connected_at"),
  lastTestedAt: timestamp("last_tested_at"),
});

export const insertConnectionSchema = createInsertSchema(connections).omit({
  id: true,
});

export type InsertConnection = z.infer<typeof insertConnectionSchema>;
export type Connection = typeof connections.$inferSelect;

// Job default settings schema
export const jobDefaultsSchema = z.object({
  adAccountId: z.string().optional(),
  campaignId: z.string().optional(),
  campaignName: z.string().optional(),
  createNewCampaign: z.boolean().optional().default(true),
  dailyBudget: z.number().optional(),
  budgetType: z.string().optional(),
  budgetAmount: z.number().optional(),
  startDate: z.string().optional(),
  placements: z.enum(["AUTO", "MANUAL"]).optional().default("AUTO"),
  geoTargeting: z.array(z.string()).optional().default([]),
  geoSplitMarket: z.string().optional(),
  ageMin: z.number().optional().default(18),
  ageMax: z.number().optional().default(65),
  pageId: z.string().optional(),
  instagramAccountId: z.string().optional(),
});

export type JobDefaults = z.infer<typeof jobDefaultsSchema>;

// Bulk upload jobs table - now with Drive folder support
export const bulkUploadJobs = pgTable("bulk_upload_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id"),
  driveRootFolderId: text("drive_root_folder_id"),
  driveRootFolderUrl: text("drive_root_folder_url"),
  driveRootFolderName: text("drive_root_folder_name"),
  status: text("status").notNull().default("draft"), 
  // States: draft | pending | validating | creating_campaign | creating_adsets | uploading_creatives | creating_ads | done | error
  currentStep: integer("current_step").notNull().default(1), // 1-4
  defaultSettings: jsonb("default_settings").$type<JobDefaults>(),
  adAccountId: text("ad_account_id"),
  campaignId: text("campaign_id"),
  campaignName: text("campaign_name"),
  pageId: text("page_id"),
  pixelId: text("pixel_id"),
  totalAdSets: integer("total_adsets").default(0),
  completedAdSets: integer("completed_adsets").default(0),
  totalAds: integer("total_ads").default(0),
  completedAds: integer("completed_ads").default(0),
  adUploadMode: text("ad_upload_mode").default("single"), // "single" | "flexible"
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  completedAt: timestamp("completed_at"),
  errorMessage: text("error_message"),
  logs: jsonb("logs").$type<string[]>().default([]),
});

export const insertBulkUploadJobSchema = createInsertSchema(bulkUploadJobs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertBulkUploadJob = z.infer<typeof insertBulkUploadJobSchema>;
export type BulkUploadJob = typeof bulkUploadJobs.$inferSelect;

// Ad Sets table - one per Drive subfolder
export const adsets = pgTable("adsets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id").notNull(),
  driveFolderId: text("drive_folder_id").notNull(),
  driveFolderName: text("drive_folder_name").notNull(),
  name: text("name").notNull(), // Extracted from folder name "AdSet 1 - My Name"
  sortOrder: integer("sort_order").notNull().default(0),
  useDefaults: boolean("use_defaults").notNull().default(true),
  overrideSettings: jsonb("override_settings").$type<Partial<JobDefaults>>(),
  status: text("status").notNull().default("pending"), 
  // pending | validating | valid | invalid | creating | done | error
  videoCount: integer("video_count").default(0),
  hasDocx: boolean("has_docx").default(false),
  docxFileId: text("docx_file_id"),
  docxFileName: text("docx_file_name"),
  validationErrors: text("validation_errors").array(),
  metaAdSetId: text("meta_adset_id"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertAdsetSchema = createInsertSchema(adsets).omit({
  id: true,
  createdAt: true,
});

export type InsertAdset = z.infer<typeof insertAdsetSchema>;
export type Adset = typeof adsets.$inferSelect;

// Uploaded assets table - videos with metadata (now linked to adset)
export const uploadedAssets = pgTable("uploaded_assets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id").notNull(),
  adsetId: varchar("adset_id"),
  index: integer("index").notNull(), // 1-10
  filename: text("filename").notNull(),
  originalFilename: text("original_filename").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  duration: integer("duration"), // in seconds
  width: integer("width"),
  height: integer("height"),
  aspectRatio: text("aspect_ratio"), // '9:16', '1:1', '16:9', etc.
  status: text("status").notNull().default("pending"), // 'pending' | 'valid' | 'invalid' | 'needs_rename'
  validationErrors: text("validation_errors").array(),
  driveFileId: text("drive_file_id"),
  metaCreativeId: text("meta_creative_id"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertUploadedAssetSchema = createInsertSchema(uploadedAssets).omit({
  id: true,
  createdAt: true,
});

export type InsertUploadedAsset = z.infer<typeof insertUploadedAssetSchema>;
export type UploadedAsset = typeof uploadedAssets.$inferSelect;

// Extracted ads table - parsed DOCX content (now linked to adset)
export const extractedAds = pgTable("extracted_ads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id").notNull(),
  adsetId: varchar("adset_id"),
  index: integer("index").notNull(), // 1-10
  primaryText: text("primary_text"),
  headline: text("headline"),
  description: text("description"),
  cta: text("cta").default("LEARN_MORE"), // CTA enum
  url: text("url"),
  utm: text("utm"),
  isValid: boolean("is_valid").default(false),
  validationErrors: text("validation_errors").array(),
  parsingMethod: text("parsing_method"), // 'deterministic' | 'ai'
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertExtractedAdSchema = createInsertSchema(extractedAds).omit({
  id: true,
  createdAt: true,
});

export type InsertExtractedAd = z.infer<typeof insertExtractedAdSchema>;
export type ExtractedAd = typeof extractedAds.$inferSelect;

// Meta objects table - tracks created Meta Ads objects
export const metaObjects = pgTable("meta_objects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id").notNull(),
  adsetId: varchar("adset_id"),
  adIndex: integer("ad_index"),
  objectType: text("object_type").notNull(), // 'campaign' | 'adset' | 'creative' | 'ad'
  metaId: text("meta_id").notNull(),
  name: text("name"),
  status: text("status").notNull().default("pending"), // 'pending' | 'created' | 'error'
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertMetaObjectSchema = createInsertSchema(metaObjects).omit({
  id: true,
  createdAt: true,
});

export type InsertMetaObject = z.infer<typeof insertMetaObjectSchema>;
export type MetaObject = typeof metaObjects.$inferSelect;

// DOCX upload tracking (now linked to adset)
export const docxUploads = pgTable("docx_uploads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id").notNull(),
  adsetId: varchar("adset_id"),
  driveFileId: text("drive_file_id"),
  filename: text("filename").notNull(),
  originalFilename: text("original_filename").notNull(),
  size: integer("size").notNull(),
  status: text("status").notNull().default("pending"), // 'pending' | 'parsed' | 'error'
  rawText: text("raw_text"),
  parsedAt: timestamp("parsed_at"),
  parsingMethod: text("parsing_method"), // 'deterministic' | 'ai'
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertDocxUploadSchema = createInsertSchema(docxUploads).omit({
  id: true,
  createdAt: true,
});

export type InsertDocxUpload = z.infer<typeof insertDocxUploadSchema>;
export type DocxUpload = typeof docxUploads.$inferSelect;

// Job logs table - detailed logging for async job execution
export const jobLogs = pgTable("job_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id").notNull(),
  adsetId: varchar("adset_id"),
  level: text("level").notNull().default("info"), // 'info' | 'warn' | 'error' | 'success'
  message: text("message").notNull(),
  details: jsonb("details"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertJobLogSchema = createInsertSchema(jobLogs).omit({
  id: true,
  createdAt: true,
});

export type InsertJobLog = z.infer<typeof insertJobLogSchema>;
export type JobLog = typeof jobLogs.$inferSelect;

// Durable queue table for long-running launch workers
export const jobQueue = pgTable("job_queue", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id").notNull(),
  userId: varchar("user_id"),
  queueType: text("queue_type").notNull().default("launch"), // launch
  status: text("status").notNull().default("queued"), // queued | processing | retrying | completed | failed
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(3),
  nextRunAt: timestamp("next_run_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  lockedBy: text("locked_by"),
  lockedUntil: timestamp("locked_until"),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  lastError: text("last_error"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertJobQueueSchema = createInsertSchema(jobQueue).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertJobQueue = z.infer<typeof insertJobQueueSchema>;
export type JobQueue = typeof jobQueue.$inferSelect;

// Optional queue audit trail (one row per processing attempt)
export const jobQueueAttempts = pgTable("job_queue_attempts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  queueId: varchar("queue_id").notNull(),
  attemptNumber: integer("attempt_number").notNull(),
  status: text("status").notNull(), // processing | completed | retrying | failed
  errorMessage: text("error_message"),
  details: jsonb("details").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertJobQueueAttemptSchema = createInsertSchema(jobQueueAttempts).omit({
  id: true,
  createdAt: true,
});

export type InsertJobQueueAttempt = z.infer<typeof insertJobQueueAttemptSchema>;
export type JobQueueAttempt = typeof jobQueueAttempts.$inferSelect;

// Zod schemas for API validation
export const ctaEnumSchema = z.enum([
  "LEARN_MORE",
  "SHOP_NOW",
  "SIGN_UP",
  "SUBSCRIBE",
  "CONTACT_US",
  "DOWNLOAD",
  "GET_OFFER",
  "BOOK_NOW",
  "WATCH_MORE",
  "APPLY_NOW",
]);

export type CtaEnum = z.infer<typeof ctaEnumSchema>;

export const extractedAdDataSchema = z.object({
  index: z.number().int().min(1).max(100),
  primary_text: z.string().min(1),
  headline: z.string().min(1),
  description: z.string().optional().default(""),
  cta: ctaEnumSchema.optional().default("LEARN_MORE"),
  url: z.string().url().optional().or(z.literal("")),
  utm: z.string().optional().default(""),
});

export const aiExtractionResponseSchema = z.object({
  ads: z.array(extractedAdDataSchema),
});

export type ExtractedAdData = z.infer<typeof extractedAdDataSchema>;
export type AiExtractionResponse = z.infer<typeof aiExtractionResponseSchema>;

// Drive import validation schemas
export const driveImportRequestSchema = z.object({
  driveUrl: z.string().url(),
});

export const driveSyncRequestSchema = z.object({
  jobId: z.string().min(1),
});

export const docxExtractRequestSchema = z.object({
  adsetId: z.string().min(1),
});

export const bulkDryRunRequestSchema = z.object({
  jobId: z.string().min(1),
});

export const bulkLaunchRequestSchema = z.object({
  jobId: z.string().min(1),
});

export const updateDefaultsRequestSchema = z.object({
  jobId: z.string().min(1),
  defaults: jobDefaultsSchema,
});

export const updateAdsetOverrideRequestSchema = z.object({
  adsetId: z.string().min(1),
  useDefaults: z.boolean(),
  overrideSettings: jobDefaultsSchema.partial().optional(),
});

// Global settings table - stores account-wide defaults
export const globalSettings = pgTable("global_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id"),
  
  // Identity Setup
  facebookPageId: text("facebook_page_id"),
  facebookPageName: text("facebook_page_name"),
  instagramPageId: text("instagram_page_id"),
  instagramPageName: text("instagram_page_name"),
  useInstagramFromFacebook: boolean("use_instagram_from_facebook").default(true),
  beneficiaryName: text("beneficiary_name"),
  payerName: text("payer_name"),
  
  // Ad Format Settings
  useDynamicCreative: boolean("use_dynamic_creative").default(true),
  
  // Default Ad Copy
  primaryTextVariations: text("primary_text_variations").array().default([]),
  headlineVariations: text("headline_variations").array().default([]),
  descriptionVariations: text("description_variations").array().default([]),
  defaultCta: text("default_cta").default("LEARN_MORE"),
  
  // Website URL defaults
  defaultWebsiteUrl: text("default_website_url"),
  defaultUtmTemplate: text("default_utm_template"),
  
  // Account info (for display)
  planType: text("plan_type").default("free"),
  uploadsRemaining: integer("uploads_remaining").default(3),
  
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertGlobalSettingsSchema = createInsertSchema(globalSettings).omit({
  id: true,
  updatedAt: true,
});

export type InsertGlobalSettings = z.infer<typeof insertGlobalSettingsSchema>;
export type GlobalSettings = typeof globalSettings.$inferSelect;

// Sync logs table - for tracking periodic sync operations
export const syncLogs = pgTable("sync_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id"),
  syncType: text("sync_type").notNull(), // 'campaigns' | 'adsets' | 'ads' | 'insights' | 'full'
  status: text("status").notNull().default("pending"), // 'pending' | 'running' | 'completed' | 'failed'
  startedAt: timestamp("started_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  completedAt: timestamp("completed_at"),
  recordsProcessed: integer("records_processed").default(0),
  errorMessage: text("error_message"),
  errorDetails: jsonb("error_details").$type<Record<string, unknown>>(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
});

export const insertSyncLogSchema = createInsertSchema(syncLogs).omit({
  id: true,
  startedAt: true,
});

export type InsertSyncLog = z.infer<typeof insertSyncLogSchema>;
export type SyncLog = typeof syncLogs.$inferSelect;

// Meta cached data tables
export const metaCampaigns = pgTable("meta_campaigns", {
  id: varchar("id").primaryKey(),
  userId: varchar("user_id"),
  adAccountId: text("ad_account_id").notNull(),
  name: text("name").notNull(),
  status: text("status"),
  objective: text("objective"),
  dailyBudget: text("daily_budget"),
  lifetimeBudget: text("lifetime_budget"),
  startTime: timestamp("start_time"),
  stopTime: timestamp("stop_time"),
  createdTime: timestamp("created_time"),
  updatedTime: timestamp("updated_time"),
  rawData: jsonb("raw_data").$type<Record<string, unknown>>(),
  lastSyncedAt: timestamp("last_synced_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export type MetaCampaign = typeof metaCampaigns.$inferSelect;

export const metaAdsets = pgTable("meta_adsets", {
  id: varchar("id").primaryKey(),
  userId: varchar("user_id"),
  adAccountId: text("ad_account_id").notNull(),
  campaignId: text("campaign_id").notNull(),
  name: text("name").notNull(),
  status: text("status"),
  dailyBudget: text("daily_budget"),
  lifetimeBudget: text("lifetime_budget"),
  targetingJson: jsonb("targeting_json").$type<Record<string, unknown>>(),
  startTime: timestamp("start_time"),
  endTime: timestamp("end_time"),
  rawData: jsonb("raw_data").$type<Record<string, unknown>>(),
  lastSyncedAt: timestamp("last_synced_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export type MetaAdset = typeof metaAdsets.$inferSelect;

export const metaAds = pgTable("meta_ads", {
  id: varchar("id").primaryKey(),
  userId: varchar("user_id"),
  adAccountId: text("ad_account_id").notNull(),
  campaignId: text("campaign_id"),
  adsetId: text("adset_id").notNull(),
  name: text("name").notNull(),
  status: text("status"),
  creativeJson: jsonb("creative_json").$type<Record<string, unknown>>(),
  rawData: jsonb("raw_data").$type<Record<string, unknown>>(),
  lastSyncedAt: timestamp("last_synced_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export type MetaAd = typeof metaAds.$inferSelect;

export const metaInsights = pgTable("meta_insights", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id"),
  adAccountId: text("ad_account_id").notNull(),
  objectId: text("object_id").notNull(), // campaign_id, adset_id, or ad_id
  objectType: text("object_type").notNull(), // 'campaign' | 'adset' | 'ad'
  dateStart: text("date_start").notNull(),
  dateStop: text("date_stop").notNull(),
  impressions: integer("impressions").default(0),
  clicks: integer("clicks").default(0),
  spend: text("spend"),
  reach: integer("reach").default(0),
  cpc: text("cpc"),
  cpm: text("cpm"),
  ctr: text("ctr"),
  conversions: integer("conversions").default(0),
  rawData: jsonb("raw_data").$type<Record<string, unknown>>(),
  lastSyncedAt: timestamp("last_synced_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export type MetaInsight = typeof metaInsights.$inferSelect;

// Launch schedules table - for scheduling ad launches
export const launchSchedules = pgTable("launch_schedules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id").notNull(),
  userId: varchar("user_id"),
  scheduleType: text("schedule_type").notNull().default("immediate"), // 'immediate' | 'scheduled'
  scheduledStartTime: timestamp("scheduled_start_time"),
  scheduledEndTime: timestamp("scheduled_end_time"),
  timezone: text("timezone").default("UTC"),
  runOnDays: text("run_on_days").array(), // ['Mon', 'Tue', ...] or null for all days
  dailyStartHour: integer("daily_start_hour"), // 0-23
  dailyEndHour: integer("daily_end_hour"), // 0-23
  launchStatus: text("launch_status").notNull().default("pending"), // 'pending' | 'active' | 'paused' | 'completed' | 'cancelled'
  activeOnLaunch: boolean("active_on_launch").default(false), // If true, create ads as ACTIVE; if false, PAUSED
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertLaunchScheduleSchema = createInsertSchema(launchSchedules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertLaunchSchedule = z.infer<typeof insertLaunchScheduleSchema>;
export type LaunchSchedule = typeof launchSchedules.$inferSelect;

// Ad copy overrides table - for manual edits per creative
export const adCopyOverrides = pgTable("ad_copy_overrides", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id").notNull(),
  adsetId: varchar("adset_id").notNull(),
  creativeIndex: integer("creative_index").notNull(), // 1-10
  primaryText: text("primary_text"),
  headline: text("headline"),
  description: text("description"),
  cta: text("cta"),
  url: text("url"),
  utm: text("utm"),
  isManualOverride: boolean("is_manual_override").default(true),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertAdCopyOverrideSchema = createInsertSchema(adCopyOverrides).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAdCopyOverride = z.infer<typeof insertAdCopyOverrideSchema>;
export type AdCopyOverride = typeof adCopyOverrides.$inferSelect;

// API request schemas for new features
export const createCampaignRequestSchema = z.object({
  name: z.string().min(1, "Campaign name is required"),
  objective: z.enum(["OUTCOME_AWARENESS", "OUTCOME_ENGAGEMENT", "OUTCOME_LEADS", "OUTCOME_SALES", "OUTCOME_TRAFFIC", "OUTCOME_APP_PROMOTION"]).default("OUTCOME_SALES"),
  buyingType: z.enum(["AUCTION", "RESERVED"]).default("AUCTION"),
  specialAdCategories: z.array(z.enum(["NONE", "CREDIT", "EMPLOYMENT", "HOUSING", "SOCIAL_ISSUES_ELECTIONS_OR_POLITICS"])).default([]),
  status: z.enum(["ACTIVE", "PAUSED"]).default("PAUSED"),
});

export type CreateCampaignRequest = z.infer<typeof createCampaignRequestSchema>;

export const scheduleJobRequestSchema = z.object({
  jobId: z.string().min(1),
  scheduleType: z.enum(["immediate", "scheduled"]),
  scheduledStartTime: z.string().datetime().optional(),
  scheduledEndTime: z.string().datetime().optional(),
  timezone: z.string().optional().default("UTC"),
  runOnDays: z.array(z.string()).optional(),
  dailyStartHour: z.number().int().min(0).max(23).optional(),
  dailyEndHour: z.number().int().min(0).max(23).optional(),
  activeOnLaunch: z.boolean().optional().default(false),
});

export type ScheduleJobRequest = z.infer<typeof scheduleJobRequestSchema>;

export const updateAdCopyRequestSchema = z.object({
  adsetId: z.string().min(1),
  creativeIndex: z.number().int().min(1).max(10),
  primaryText: z.string().optional(),
  headline: z.string().optional(),
  description: z.string().optional(),
  cta: ctaEnumSchema.optional(),
  url: z.string().url().optional(),
  utm: z.string().optional(),
});

export type UpdateAdCopyRequest = z.infer<typeof updateAdCopyRequestSchema>;

// User Settings - persistent defaults for Campaign, Ad Set, and Ad levels
export const campaignSettingsSchema = z.object({
  objective: z.enum(["OUTCOME_AWARENESS", "OUTCOME_ENGAGEMENT", "OUTCOME_LEADS", "OUTCOME_SALES", "OUTCOME_TRAFFIC", "OUTCOME_APP_PROMOTION"]).optional(),
  budgetType: z.enum(["DAILY", "LIFETIME"]).optional(),
  budgetAmount: z.number().optional(),
  currency: z.string().optional(), // EUR, USD, etc.
  specialAdCategories: z.array(z.string()).optional(),
  // Schedule
  startDate: z.string().optional(), // ISO date string
  startTime: z.string().optional(), // HH:mm format
  endDate: z.string().optional(), // ISO date string (optional)
  endTime: z.string().optional(), // HH:mm format
  // Conversion
  conversionEvent: z.string().optional(), // e.g., "Purchase", "Lead", "AddToCart"
  // Default landing page
  defaultLandingUrl: z.string().optional(),
  isConfigured: z.boolean().optional(),
});

export type CampaignSettings = z.infer<typeof campaignSettingsSchema>;

export const adSetSettingsSchema = z.object({
  pixelId: z.string().optional(),
  pixelName: z.string().optional(),
  audienceType: z.enum(["ADVANTAGE_PLUS", "CUSTOM", "SAVED"]).optional(),
  audienceId: z.string().optional(),
  audienceName: z.string().optional(),
  useAdvantagePlacements: z.boolean().optional(),
  placements: z.object({
    facebook: z.boolean().optional(),
    instagram: z.boolean().optional(),
    messenger: z.boolean().optional(),
    audienceNetwork: z.boolean().optional(),
  }).optional(),
  attributionWindow: z.object({
    clickThrough: z.enum(["1_DAY", "7_DAY"]).optional(),
    engagedView: z.enum(["1_DAY"]).optional(),
    viewThrough: z.enum(["1_DAY"]).optional(),
  }).optional(),
  excludedAudienceIds: z.array(z.string()).optional(),
  geoTargeting: z.array(z.string()).optional(),
  ageMin: z.number().min(13).max(65).optional(),
  ageMax: z.number().min(13).max(65).optional(),
  gender: z.enum(["ALL", "MALE", "FEMALE"]).optional(), // Gender targeting
  // Spending limits
  dailyMinSpendTarget: z.number().optional(),
  dailySpendCap: z.number().optional(),
  lifetimeSpendCap: z.number().optional(),
  optimizationGoal: z.string().optional(),
  billingEvent: z.string().optional(),
  isConfigured: z.boolean().optional(),
});

export type AdSetSettings = z.infer<typeof adSetSettingsSchema>;

export const creativeSettingsSchema = z.object({
  advantageCreative: z.boolean().optional(),
  relevantComments: z.boolean().optional(),
  visualTouchups: z.boolean().optional(),
  textImprovements: z.boolean().optional(),
  addOverlays: z.boolean().optional(),
  adjustBrightnessContrast: z.boolean().optional(),
  musicOverlay: z.boolean().optional(),
  imageAnimation: z.boolean().optional(),
  generateBackgrounds: z.boolean().optional(),
  expandImage: z.boolean().optional(),
  enhanceCta: z.boolean().optional(),
  translateText: z.boolean().optional(),
  adaptToPlacement: z.boolean().optional(),
  addCatalogItems: z.boolean().optional(),
  addSiteLinks: z.boolean().optional(),
  dynamicMedia: z.boolean().optional(),
  dynamicDescription: z.boolean().optional(),
  profileEndCard: z.boolean().optional(),
});

export type CreativeSettings = z.infer<typeof creativeSettingsSchema>;

export const adSettingsSchema = z.object({
  defaultCta: ctaEnumSchema.optional(),
  defaultUrl: z.string().optional(),
  defaultUtm: z.string().optional(),
  primaryTextTemplate: z.string().optional(),
  headlineTemplate: z.string().optional(),
  descriptionTemplate: z.string().optional(),
  websiteUrl: z.string().optional(),
  utmParameters: z.string().optional(),
  // Instagram account for cross-platform ads
  instagramAccountId: z.string().optional(),
  // Format selection
  adFormat: z.enum(["FLEXIBLE", "SINGLE_IMAGE", "SINGLE_VIDEO", "CAROUSEL"]).optional(),
  // Multi-advertiser and Advantage+ toggles
  multiAdvertiserAds: z.boolean().optional(),
  advantagePlusCreative: z.boolean().optional(),
  imageCreativeSettings: creativeSettingsSchema.optional(),
  videoCreativeSettings: creativeSettingsSchema.optional(),
  carouselCreativeSettings: creativeSettingsSchema.optional(),
  isConfigured: z.boolean().optional(),
});

export type AdSettings = z.infer<typeof adSettingsSchema>;

export const userSettings = pgTable("user_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique(),
  campaignSettings: jsonb("campaign_settings").$type<CampaignSettings>().default({}),
  adSetSettings: jsonb("adset_settings").$type<AdSetSettings>().default({}),
  adSettings: jsonb("ad_settings").$type<AdSettings>().default({}),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertUserSettingsSchema = createInsertSchema(userSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUserSettings = z.infer<typeof insertUserSettingsSchema>;
export type UserSettings = typeof userSettings.$inferSelect;

// Per-ad-account settings table
export const adAccountSettings = pgTable("ad_account_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  adAccountId: text("ad_account_id").notNull(),
  adAccountName: text("ad_account_name"),
  // Campaign defaults (imported from selected campaign)
  campaignObjective: text("campaign_objective"), // OUTCOME_SALES, OUTCOME_TRAFFIC, etc.
  budgetType: text("budget_type"), // DAILY or LIFETIME
  budgetAmount: real("budget_amount"), // Budget in EUR
  // Ad Set defaults
  pixelId: text("pixel_id"),
  pixelName: text("pixel_name"),
  audienceType: text("audience_type"), // ADVANTAGE_PLUS, CUSTOM, SAVED
  audienceId: text("audience_id"),
  audienceName: text("audience_name"),
  geoTargeting: text("geo_targeting").array().default([]),
  ageMin: integer("age_min").default(18),
  ageMax: integer("age_max").default(65),
  gender: text("gender").default("ALL"), // ALL, MALE, FEMALE
  dailyMinSpendTarget: real("daily_min_spend_target"),
  dailySpendCap: real("daily_spend_cap"),
  lifetimeSpendCap: real("lifetime_spend_cap"),
  // Ad defaults
  websiteUrl: text("website_url"),
  defaultCta: text("default_cta"),
  defaultUrl: text("default_url"),
  displayLink: text("display_link"),
  // Creative enhancements (auto-saved from last upload)
  creativeEnhancements: jsonb("creative_enhancements"),
  // Status
  isConfigured: boolean("is_configured").default(false),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertAdAccountSettingsSchema = createInsertSchema(adAccountSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAdAccountSettings = z.infer<typeof insertAdAccountSettingsSchema>;
export type AdAccountSettings = typeof adAccountSettings.$inferSelect;

// Billing subscriptions table - current source of truth from Stripe
export const billingSubscriptions = pgTable("billing_subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  status: text("status").notNull().default("inactive"), // inactive | trialing | active | past_due | unpaid | canceled
  interval: text("interval"), // monthly | yearly
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  currentPeriodStart: timestamp("current_period_start"),
  currentPeriodEnd: timestamp("current_period_end"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertBillingSubscriptionSchema = createInsertSchema(billingSubscriptions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertBillingSubscription = z.infer<typeof insertBillingSubscriptionSchema>;
export type BillingSubscription = typeof billingSubscriptions.$inferSelect;

// Billing Payments table - stores monthly payment history
export const billingPayments = pgTable("billing_payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  stripeInvoiceId: text("stripe_invoice_id"),
  amount: real("amount").notNull(),
  currency: text("currency").notNull().default("EUR"),
  status: text("status").notNull().default("paid"),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  planType: text("plan_type").notNull().default("free"),
  invoiceUrl: text("invoice_url"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertBillingPaymentSchema = createInsertSchema(billingPayments).omit({
  id: true,
  createdAt: true,
});

export type InsertBillingPayment = z.infer<typeof insertBillingPaymentSchema>;
export type BillingPayment = typeof billingPayments.$inferSelect;

// Re-export chat models
export * from "./models/chat.js";
