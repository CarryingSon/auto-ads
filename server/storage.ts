import {
  type User,
  type InsertUser,
  type Connection,
  type InsertConnection,
  type BulkUploadJob,
  type InsertBulkUploadJob,
  type UploadedAsset,
  type InsertUploadedAsset,
  type ExtractedAd,
  type InsertExtractedAd,
  type MetaObject,
  type InsertMetaObject,
  type DocxUpload,
  type InsertDocxUpload,
  type Adset,
  type InsertAdset,
  type JobLog,
  type InsertJobLog,
  type GlobalSettings,
  type InsertGlobalSettings,
  type UserSettings,
  type InsertUserSettings,
  type CampaignSettings,
  type AdSetSettings,
  type AdSettings,
  type AdAccountSettings,
  type InsertAdAccountSettings,
  users,
  connections,
  bulkUploadJobs,
  uploadedAssets,
  extractedAds,
  metaObjects,
  docxUploads,
  adsets,
  jobLogs,
  globalSettings,
  userSettings,
  adAccountSettings,
} from "../shared/schema.js";
import { db } from "./db.js";
import { eq, and, desc, asc, isNull } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Connections
  getConnection(userId: string, provider: string): Promise<Connection | undefined>;
  getAllConnections(userId: string): Promise<Connection[]>;
  upsertConnection(
    userId: string,
    connection: Omit<InsertConnection, "userId">,
  ): Promise<Connection>;
  deleteConnection(userId: string, provider: string): Promise<void>;
  
  // Bulk Upload Jobs
  createJob(job: InsertBulkUploadJob): Promise<BulkUploadJob>;
  getJob(id: string): Promise<BulkUploadJob | undefined>;
  getAllJobs(): Promise<BulkUploadJob[]>;
  updateJob(id: string, updates: Partial<InsertBulkUploadJob>): Promise<BulkUploadJob | undefined>;
  deleteJob(id: string): Promise<void>;
  
  // Ad Sets
  createAdset(adset: InsertAdset): Promise<Adset>;
  getAdset(id: string): Promise<Adset | undefined>;
  getAdsetsByJob(jobId: string): Promise<Adset[]>;
  updateAdset(id: string, updates: Partial<InsertAdset>): Promise<Adset | undefined>;
  deleteAdsetsByJob(jobId: string): Promise<void>;
  
  // Uploaded Assets
  createAsset(asset: InsertUploadedAsset): Promise<UploadedAsset>;
  getAssetsByJob(jobId: string): Promise<UploadedAsset[]>;
  getAssetsByAdset(adsetId: string): Promise<UploadedAsset[]>;
  updateAsset(id: string, updates: Partial<InsertUploadedAsset>): Promise<UploadedAsset | undefined>;
  deleteAssetsByJob(jobId: string): Promise<void>;
  deleteAssetsByAdset(adsetId: string): Promise<void>;
  
  // Extracted Ads
  createExtractedAd(ad: InsertExtractedAd): Promise<ExtractedAd>;
  getExtractedAdsByJob(jobId: string): Promise<ExtractedAd[]>;
  getExtractedAdsByAdset(adsetId: string): Promise<ExtractedAd[]>;
  updateExtractedAd(id: string, updates: Partial<InsertExtractedAd>): Promise<ExtractedAd | undefined>;
  deleteExtractedAdsByJob(jobId: string): Promise<void>;
  deleteExtractedAdsByAdset(adsetId: string): Promise<void>;
  
  // Meta Objects
  createMetaObject(obj: InsertMetaObject): Promise<MetaObject>;
  getMetaObjectsByJob(jobId: string): Promise<MetaObject[]>;
  getMetaObjectsByAdset(adsetId: string): Promise<MetaObject[]>;
  updateMetaObject(id: string, updates: Partial<InsertMetaObject>): Promise<MetaObject | undefined>;
  
  // DOCX Uploads
  createDocxUpload(docx: InsertDocxUpload): Promise<DocxUpload>;
  getDocxByJob(jobId: string): Promise<DocxUpload | undefined>;
  getDocxByAdset(adsetId: string): Promise<DocxUpload | undefined>;
  updateDocxUpload(id: string, updates: Partial<InsertDocxUpload>): Promise<DocxUpload | undefined>;
  deleteDocxByJob(jobId: string): Promise<void>;
  
  // Job Logs
  createJobLog(log: InsertJobLog): Promise<JobLog>;
  getJobLogsByJob(jobId: string): Promise<JobLog[]>;
  getJobLogsByAdset(adsetId: string): Promise<JobLog[]>;
  
  // Global Settings
  getGlobalSettings(userId: string): Promise<GlobalSettings | undefined>;
  upsertGlobalSettings(userId: string, settings: Partial<InsertGlobalSettings>): Promise<GlobalSettings>;
  
  // User Settings
  getUserSettings(userId: string): Promise<UserSettings | undefined>;
  upsertUserSettings(userId: string, settings: {
    campaignSettings?: CampaignSettings;
    adSetSettings?: AdSetSettings;
    adSettings?: AdSettings;
  }): Promise<UserSettings>;
  
  // Ad Account Settings
  getAdAccountSettings(userId: string, adAccountId: string): Promise<AdAccountSettings | undefined>;
  getAllAdAccountSettings(userId: string): Promise<AdAccountSettings[]>;
  upsertAdAccountSettings(userId: string, adAccountId: string, settings: Partial<InsertAdAccountSettings>): Promise<AdAccountSettings>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }
  
  // Connections
  async getConnection(userId: string, provider: string): Promise<Connection | undefined> {
    const [connection] = await db
      .select()
      .from(connections)
      .where(and(eq(connections.userId, userId), eq(connections.provider, provider)));
    return connection || undefined;
  }

  async getAllConnections(userId: string): Promise<Connection[]> {
    return db.select().from(connections).where(eq(connections.userId, userId));
  }

  async upsertConnection(
    userId: string,
    connection: Omit<InsertConnection, "userId">,
  ): Promise<Connection> {
    const existing = await this.getConnection(userId, connection.provider);
    const values = { ...connection, userId };
    if (existing) {
      const [updated] = await db
        .update(connections)
        .set(values)
        .where(and(eq(connections.userId, userId), eq(connections.provider, connection.provider)))
        .returning();
      return updated;
    }
    const [created] = await db.insert(connections).values(values).returning();
    return created;
  }

  async deleteConnection(userId: string, provider: string): Promise<void> {
    await db
      .delete(connections)
      .where(and(eq(connections.userId, userId), eq(connections.provider, provider)));
  }
  
  // Bulk Upload Jobs
  async createJob(job: InsertBulkUploadJob): Promise<BulkUploadJob> {
    const [created] = await db.insert(bulkUploadJobs).values(job).returning();
    return created;
  }

  async getJob(id: string): Promise<BulkUploadJob | undefined> {
    const [job] = await db.select().from(bulkUploadJobs).where(eq(bulkUploadJobs.id, id));
    return job || undefined;
  }

  async getAllJobs(): Promise<BulkUploadJob[]> {
    return db.select().from(bulkUploadJobs).orderBy(desc(bulkUploadJobs.createdAt));
  }

  async updateJob(id: string, updates: Partial<InsertBulkUploadJob>): Promise<BulkUploadJob | undefined> {
    const [updated] = await db
      .update(bulkUploadJobs)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(bulkUploadJobs.id, id))
      .returning();
    return updated;
  }

  async deleteJob(id: string): Promise<void> {
    await this.deleteAdsetsByJob(id);
    await this.deleteAssetsByJob(id);
    await this.deleteExtractedAdsByJob(id);
    await this.deleteDocxByJob(id);
    await db.delete(metaObjects).where(eq(metaObjects.jobId, id));
    await db.delete(jobLogs).where(eq(jobLogs.jobId, id));
    await db.delete(bulkUploadJobs).where(eq(bulkUploadJobs.id, id));
  }
  
  // Ad Sets
  async createAdset(adset: InsertAdset): Promise<Adset> {
    const [created] = await db.insert(adsets).values(adset).returning();
    return created;
  }

  async getAdset(id: string): Promise<Adset | undefined> {
    const [adset] = await db.select().from(adsets).where(eq(adsets.id, id));
    return adset || undefined;
  }

  async getAdsetsByJob(jobId: string): Promise<Adset[]> {
    return db.select().from(adsets).where(eq(adsets.jobId, jobId)).orderBy(asc(adsets.sortOrder));
  }

  async updateAdset(id: string, updates: Partial<InsertAdset>): Promise<Adset | undefined> {
    const [updated] = await db
      .update(adsets)
      .set(updates)
      .where(eq(adsets.id, id))
      .returning();
    return updated;
  }

  async deleteAdsetsByJob(jobId: string): Promise<void> {
    await db.delete(adsets).where(eq(adsets.jobId, jobId));
  }
  
  // Uploaded Assets
  async createAsset(asset: InsertUploadedAsset): Promise<UploadedAsset> {
    const [created] = await db.insert(uploadedAssets).values(asset).returning();
    return created;
  }

  async getAssetsByJob(jobId: string): Promise<UploadedAsset[]> {
    return db.select().from(uploadedAssets).where(eq(uploadedAssets.jobId, jobId));
  }

  async getAssetsByAdset(adsetId: string): Promise<UploadedAsset[]> {
    return db.select().from(uploadedAssets).where(eq(uploadedAssets.adsetId, adsetId));
  }

  async updateAsset(id: string, updates: Partial<InsertUploadedAsset>): Promise<UploadedAsset | undefined> {
    const [updated] = await db
      .update(uploadedAssets)
      .set(updates)
      .where(eq(uploadedAssets.id, id))
      .returning();
    return updated;
  }

  async deleteAssetsByJob(jobId: string): Promise<void> {
    await db.delete(uploadedAssets).where(eq(uploadedAssets.jobId, jobId));
  }

  async deleteAssetsByAdset(adsetId: string): Promise<void> {
    await db.delete(uploadedAssets).where(eq(uploadedAssets.adsetId, adsetId));
  }
  
  // Extracted Ads
  async createExtractedAd(ad: InsertExtractedAd): Promise<ExtractedAd> {
    const [created] = await db.insert(extractedAds).values(ad).returning();
    return created;
  }

  async getExtractedAdsByJob(jobId: string): Promise<ExtractedAd[]> {
    return db.select().from(extractedAds).where(eq(extractedAds.jobId, jobId));
  }

  async getExtractedAdsByAdset(adsetId: string): Promise<ExtractedAd[]> {
    return db.select().from(extractedAds).where(eq(extractedAds.adsetId, adsetId));
  }

  async updateExtractedAd(id: string, updates: Partial<InsertExtractedAd>): Promise<ExtractedAd | undefined> {
    const [updated] = await db
      .update(extractedAds)
      .set(updates)
      .where(eq(extractedAds.id, id))
      .returning();
    return updated;
  }

  async deleteExtractedAdsByJob(jobId: string): Promise<void> {
    await db.delete(extractedAds).where(eq(extractedAds.jobId, jobId));
  }

  async deleteExtractedAdsByAdset(adsetId: string): Promise<void> {
    await db.delete(extractedAds).where(eq(extractedAds.adsetId, adsetId));
  }
  
  // Meta Objects
  async createMetaObject(obj: InsertMetaObject): Promise<MetaObject> {
    const [created] = await db.insert(metaObjects).values(obj).returning();
    return created;
  }

  async getMetaObjectsByJob(jobId: string): Promise<MetaObject[]> {
    return db.select().from(metaObjects).where(eq(metaObjects.jobId, jobId));
  }

  async getMetaObjectsByAdset(adsetId: string): Promise<MetaObject[]> {
    return db.select().from(metaObjects).where(eq(metaObjects.adsetId, adsetId));
  }

  async updateMetaObject(id: string, updates: Partial<InsertMetaObject>): Promise<MetaObject | undefined> {
    const [updated] = await db
      .update(metaObjects)
      .set(updates)
      .where(eq(metaObjects.id, id))
      .returning();
    return updated;
  }
  
  // DOCX Uploads
  async createDocxUpload(docx: InsertDocxUpload): Promise<DocxUpload> {
    const [created] = await db.insert(docxUploads).values(docx).returning();
    return created;
  }

  async getDocxByJob(jobId: string): Promise<DocxUpload | undefined> {
    const [docx] = await db.select().from(docxUploads).where(eq(docxUploads.jobId, jobId));
    return docx || undefined;
  }

  async getDocxByAdset(adsetId: string): Promise<DocxUpload | undefined> {
    const [docx] = await db.select().from(docxUploads).where(eq(docxUploads.adsetId, adsetId));
    return docx || undefined;
  }

  async updateDocxUpload(id: string, updates: Partial<InsertDocxUpload>): Promise<DocxUpload | undefined> {
    const [updated] = await db
      .update(docxUploads)
      .set(updates)
      .where(eq(docxUploads.id, id))
      .returning();
    return updated;
  }

  async deleteDocxByJob(jobId: string): Promise<void> {
    await db.delete(docxUploads).where(eq(docxUploads.jobId, jobId));
  }
  
  // Job Logs
  async createJobLog(log: InsertJobLog): Promise<JobLog> {
    const [created] = await db.insert(jobLogs).values(log).returning();
    return created;
  }

  async getJobLogsByJob(jobId: string): Promise<JobLog[]> {
    return db.select().from(jobLogs).where(eq(jobLogs.jobId, jobId)).orderBy(desc(jobLogs.createdAt));
  }

  async getJobLogsByAdset(adsetId: string): Promise<JobLog[]> {
    return db.select().from(jobLogs).where(eq(jobLogs.adsetId, adsetId)).orderBy(desc(jobLogs.createdAt));
  }
  
  // Global Settings
  async getGlobalSettings(userId: string): Promise<GlobalSettings | undefined> {
    const [settings] = await db
      .select()
      .from(globalSettings)
      .where(eq(globalSettings.userId, userId));
    if (settings) return settings;

    // Compatibility backfill for legacy single-row setups where userId was null.
    const [legacySettings] = await db
      .select()
      .from(globalSettings)
      .where(isNull(globalSettings.userId))
      .orderBy(desc(globalSettings.updatedAt))
      .limit(1);

    if (!legacySettings) return undefined;

    const [created] = await db.insert(globalSettings).values({
      userId,
      facebookPageId: legacySettings.facebookPageId,
      facebookPageName: legacySettings.facebookPageName,
      instagramPageId: legacySettings.instagramPageId,
      instagramPageName: legacySettings.instagramPageName,
      useInstagramFromFacebook: legacySettings.useInstagramFromFacebook,
      beneficiaryName: legacySettings.beneficiaryName,
      payerName: legacySettings.payerName,
      useDynamicCreative: legacySettings.useDynamicCreative,
      primaryTextVariations: legacySettings.primaryTextVariations || [],
      headlineVariations: legacySettings.headlineVariations || [],
      descriptionVariations: legacySettings.descriptionVariations || [],
      defaultCta: legacySettings.defaultCta,
      defaultWebsiteUrl: legacySettings.defaultWebsiteUrl,
      defaultUtmTemplate: legacySettings.defaultUtmTemplate,
      planType: legacySettings.planType,
      uploadsRemaining: legacySettings.uploadsRemaining,
      updatedAt: new Date(),
    }).returning();
    return created;
  }

  async upsertGlobalSettings(userId: string, settings: Partial<InsertGlobalSettings>): Promise<GlobalSettings> {
    const existing = await this.getGlobalSettings(userId);
    const values = { ...settings, userId };
    if (existing) {
      const [updated] = await db
        .update(globalSettings)
        .set({ ...values, updatedAt: new Date() })
        .where(and(eq(globalSettings.id, existing.id), eq(globalSettings.userId, userId)))
        .returning();
      return updated;
    }
    const [created] = await db.insert(globalSettings).values(values).returning();
    return created;
  }
  
  // User Settings
  async getUserSettings(userId: string): Promise<UserSettings | undefined> {
    const [settings] = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
    return settings || undefined;
  }

  async upsertUserSettings(userId: string, settings: {
    campaignSettings?: CampaignSettings;
    adSetSettings?: AdSetSettings;
    adSettings?: AdSettings;
  }): Promise<UserSettings> {
    const existing = await this.getUserSettings(userId);
    if (existing) {
      const updateData: any = { updatedAt: new Date() };
      if (settings.campaignSettings !== undefined) {
        updateData.campaignSettings = { ...(existing.campaignSettings || {}), ...settings.campaignSettings };
      }
      if (settings.adSetSettings !== undefined) {
        updateData.adSetSettings = { ...(existing.adSetSettings || {}), ...settings.adSetSettings };
      }
      if (settings.adSettings !== undefined) {
        updateData.adSettings = { ...(existing.adSettings || {}), ...settings.adSettings };
      }
      const [updated] = await db
        .update(userSettings)
        .set(updateData)
        .where(eq(userSettings.userId, userId))
        .returning();
      return updated;
    }
    const [created] = await db.insert(userSettings).values({
      userId,
      campaignSettings: settings.campaignSettings || {},
      adSetSettings: settings.adSetSettings || {},
      adSettings: settings.adSettings || {},
    }).returning();
    return created;
  }
  
  // Ad Account Settings
  async getAdAccountSettings(userId: string, adAccountId: string): Promise<AdAccountSettings | undefined> {
    const [settings] = await db.select()
      .from(adAccountSettings)
      .where(and(
        eq(adAccountSettings.userId, userId),
        eq(adAccountSettings.adAccountId, adAccountId)
      ));
    return settings || undefined;
  }

  async getAllAdAccountSettings(userId: string): Promise<AdAccountSettings[]> {
    return db.select()
      .from(adAccountSettings)
      .where(eq(adAccountSettings.userId, userId));
  }

  async upsertAdAccountSettings(
    userId: string, 
    adAccountId: string, 
    settings: Partial<InsertAdAccountSettings>
  ): Promise<AdAccountSettings> {
    const existing = await this.getAdAccountSettings(userId, adAccountId);
    if (existing) {
      const [updated] = await db
        .update(adAccountSettings)
        .set({ 
          ...settings, 
          isConfigured: true,
          updatedAt: new Date() 
        })
        .where(and(
          eq(adAccountSettings.userId, userId),
          eq(adAccountSettings.adAccountId, adAccountId)
        ))
        .returning();
      return updated;
    }
    const [created] = await db.insert(adAccountSettings).values({
      userId,
      adAccountId,
      ...settings,
      isConfigured: true,
    }).returning();
    return created;
  }
}

export const storage = new DatabaseStorage();
