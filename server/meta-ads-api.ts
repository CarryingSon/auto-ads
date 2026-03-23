import crypto from "crypto";
import * as fs from "fs";
import FormData from "form-data";
import { db } from "./db.js";
import { 
  oauthConnections, 
  metaAssets, 
  syncLogs,
  metaCampaigns,
  metaAdsets,
  metaAds,
  metaInsights
} from "../shared/schema.js";
import { eq, and } from "drizzle-orm";
import { encrypt, decrypt } from "./auth-routes.js";
import { 
  prepareVideoForMeta, 
  downloadToTemp, 
  cleanupTempFile,
  TranscodeResult 
} from "./video-transcoder.js";
import {
  uploadBufferToSupabaseStorage,
  createSignedSupabaseDownloadUrl,
} from "./supabase-storage.js";

const META_APP_ID = process.env.META_APP_ID || "";
const META_APP_SECRET = process.env.META_APP_SECRET || "";
const META_API_VERSION = "v24.0";
const META_GRAPH_URL = `https://graph.facebook.com/${META_API_VERSION}`;
const META_VIDEO_URL = `https://graph-video.facebook.com/${META_API_VERSION}`;

function hasSupabaseStorageConfig(): boolean {
  return Boolean(
    process.env.SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    process.env.SUPABASE_STORAGE_BUCKET
  );
}

// Rate limiting configuration
const RATE_LIMIT_CONFIG = {
  minDelayMs: 500,           // Minimum delay between API calls (500ms)
  maxRetries: 5,             // Maximum retry attempts for rate limit errors
  baseBackoffMs: 1000,       // Base backoff time (1 second)
  maxBackoffMs: 60000,       // Maximum backoff time (60 seconds)
  rateLimitCodes: [4, 17, 613, 80004], // Meta rate limit error codes
};

// Utility: Sleep for specified milliseconds
const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

// Utility: Calculate exponential backoff with jitter
const calculateBackoff = (attempt: number): number => {
  const exponentialDelay = RATE_LIMIT_CONFIG.baseBackoffMs * Math.pow(2, attempt);
  const jitter = Math.random() * 1000; // Add up to 1 second of jitter
  return Math.min(exponentialDelay + jitter, RATE_LIMIT_CONFIG.maxBackoffMs);
};

// Check if error is a rate limit error
const isRateLimitError = (error: any): boolean => {
  if (!error) return false;
  const code = error?.error?.code || error?.code;
  if (RATE_LIMIT_CONFIG.rateLimitCodes.includes(code) || error?.status === 429) return true;
  const msg = (error?.error?.message || error?.message || '').toLowerCase();
  return msg.includes('rate limit') || msg.includes('request limit') || msg.includes('limit reached') || msg.includes('too many calls');
};

interface MetaApiError {
  error?: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
    error_user_msg?: string;
    error_user_title?: string;
  };
}

export class MetaAdsApi {
  private userId: string;
  private accessToken: string | null = null;
  private adAccountId: string | null = null;

  constructor(userId: string) {
    this.userId = userId;
  }

  async initialize(): Promise<boolean> {
    console.log("[MetaAdsApi] Looking for connection with userId:", this.userId);
    const connection = await db.select()
      .from(oauthConnections)
      .where(and(
        eq(oauthConnections.userId, this.userId),
        eq(oauthConnections.provider, "meta")
      ))
      .limit(1);

    if (!connection.length || !connection[0].accessToken) {
      return false;
    }

    this.accessToken = decrypt(connection[0].accessToken);

    // Check if token is expired and refresh if needed
    if (connection[0].tokenExpiresAt && new Date(connection[0].tokenExpiresAt) < new Date()) {
      const refreshed = await this.refreshToken(connection[0].id, connection[0].refreshToken);
      if (!refreshed) {
        return false;
      }
    }

    // Get selected ad account
    const assets = await db.select()
      .from(metaAssets)
      .where(eq(metaAssets.userId, this.userId))
      .limit(1);

    if (assets.length && assets[0].selectedAdAccountId) {
      this.adAccountId = assets[0].selectedAdAccountId;
    }

    return true;
  }

  // Set a specific ad account ID (overrides the one from database)
  setAdAccountId(adAccountId: string): void {
    this.adAccountId = adAccountId.startsWith('act_') ? adAccountId.replace('act_', '') : adAccountId;
  }

  private async refreshToken(connectionId: string, refreshToken: string | null): Promise<boolean> {
    if (!refreshToken) return false;

    try {
      const decryptedRefresh = decrypt(refreshToken);
      const response = await fetch(
        `${META_GRAPH_URL}/oauth/access_token?` +
        `grant_type=fb_exchange_token&` +
        `client_id=${META_APP_ID}&` +
        `client_secret=${META_APP_SECRET}&` +
        `fb_exchange_token=${decryptedRefresh}`
      );

      const data = await response.json();

      if (data.error) {
        console.error("Token refresh failed:", data.error);
        await db.update(oauthConnections)
          .set({ status: "expired", updatedAt: new Date() })
          .where(eq(oauthConnections.id, connectionId));
        return false;
      }

      const newExpiresAt = data.expires_in 
        ? new Date(Date.now() + data.expires_in * 1000) 
        : null;

      await db.update(oauthConnections)
        .set({
          accessToken: encrypt(data.access_token),
          tokenExpiresAt: newExpiresAt,
          updatedAt: new Date(),
        })
        .where(eq(oauthConnections.id, connectionId));

      this.accessToken = data.access_token;
      return true;
    } catch (err) {
      console.error("Token refresh error:", err);
      return false;
    }
  }

  private async apiRequest<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
    if (!this.accessToken) {
      throw new Error("Not authenticated");
    }

    const url = new URL(`${META_GRAPH_URL}/${endpoint}`);
    url.searchParams.set("access_token", this.accessToken);
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });

    // Add minimum delay between API calls for rate limiting
    await sleep(RATE_LIMIT_CONFIG.minDelayMs);

    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= RATE_LIMIT_CONFIG.maxRetries; attempt++) {
      try {
        const response = await fetch(url.toString());
        const data = await response.json() as T & MetaApiError;

        if (data.error) {
          // Check if this is a rate limit error
          if (isRateLimitError(data)) {
            const backoffMs = calculateBackoff(attempt);
            console.log(`[MetaAdsApi] Rate limit hit (attempt ${attempt + 1}/${RATE_LIMIT_CONFIG.maxRetries + 1}), waiting ${Math.round(backoffMs / 1000)}s...`);
            await sleep(backoffMs);
            lastError = new Error(data.error.message || "Rate limit exceeded");
            continue;
          }
          throw new Error(data.error.message || "Meta API error");
        }

        return data;
      } catch (err) {
        if (isRateLimitError(err) && attempt < RATE_LIMIT_CONFIG.maxRetries) {
          const backoffMs = calculateBackoff(attempt);
          console.log(`[MetaAdsApi] Rate limit error (attempt ${attempt + 1}/${RATE_LIMIT_CONFIG.maxRetries + 1}), waiting ${Math.round(backoffMs / 1000)}s...`);
          await sleep(backoffMs);
          lastError = err as Error;
          continue;
        }
        throw err;
      }
    }

    throw lastError || new Error("Max retries exceeded for rate limit");
  }

  // POST request with rate limiting and retry logic
  private async apiPostRequest<T>(url: string, body: URLSearchParams): Promise<T> {
    // Add minimum delay between API calls for rate limiting
    await sleep(RATE_LIMIT_CONFIG.minDelayMs);

    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= RATE_LIMIT_CONFIG.maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          body,
        });
        const data = await response.json() as T & MetaApiError;

        if (data.error) {
          // Log full error details
          console.error('[MetaAdsApi] API error response:', JSON.stringify(data.error, null, 2));
          
          // Check if this is a rate limit error
          if (isRateLimitError(data)) {
            const backoffMs = calculateBackoff(attempt);
            console.log(`[MetaAdsApi] Rate limit hit on POST (attempt ${attempt + 1}/${RATE_LIMIT_CONFIG.maxRetries + 1}), waiting ${Math.round(backoffMs / 1000)}s...`);
            await sleep(backoffMs);
            lastError = new Error(data.error.message || "Rate limit exceeded");
            continue;
          }
          // Not a rate limit error, throw immediately with full details
          const errorMessage = data.error.error_user_msg || data.error.error_user_title || data.error.message || "Meta API error";
          const errorObj = new Error(errorMessage) as any;
          errorObj.metaError = data.error;
          throw errorObj;
        }

        return data;
      } catch (err: any) {
        if (isRateLimitError(err) && attempt < RATE_LIMIT_CONFIG.maxRetries) {
          const backoffMs = calculateBackoff(attempt);
          console.log(`[MetaAdsApi] Rate limit error on POST (attempt ${attempt + 1}/${RATE_LIMIT_CONFIG.maxRetries + 1}), waiting ${Math.round(backoffMs / 1000)}s...`);
          await sleep(backoffMs);
          lastError = err as Error;
          continue;
        }
        throw err;
      }
    }

    throw lastError || new Error("Max retries exceeded for rate limit");
  }

  async getCampaigns(): Promise<any[]> {
    if (!this.adAccountId) {
      throw new Error("No ad account selected");
    }

    // Get campaigns excluding ARCHIVED and DELETED
    const data = await this.apiRequest<{ data: any[] }>(
      `act_${this.adAccountId.replace('act_', '')}/campaigns`,
      {
        fields: "id,name,status,effective_status,objective,daily_budget,lifetime_budget,start_time,stop_time,created_time,updated_time",
        limit: "500",
        filtering: JSON.stringify([{
          field: "effective_status",
          operator: "IN",
          value: ["ACTIVE", "PAUSED", "IN_PROCESS", "WITH_ISSUES", "PENDING_REVIEW", "DISAPPROVED", "PREAPPROVED", "PENDING_BILLING_INFO", "CAMPAIGN_PAUSED", "ADSET_PAUSED"]
        }])
      }
    );

    return data.data || [];
  }

  async createCampaign(params: {
    name: string;
    objective: string;
    status?: string;
    specialAdCategories?: string[];
    buyingType?: string;
    budgetType?: "ABO" | "CBO";
    dailyBudget?: number;
  }): Promise<{ id: string; name: string }> {
    if (!this.adAccountId || !this.accessToken) {
      throw new Error("No ad account selected or not authenticated");
    }

    const adAccountFormatted = this.adAccountId.startsWith('act_') 
      ? this.adAccountId 
      : `act_${this.adAccountId}`;

    const isCBO = params.budgetType === "CBO";

    const body = new URLSearchParams();
    body.append('name', params.name);
    body.append('objective', params.objective);
    body.append('status', params.status || 'ACTIVE');
    body.append('special_ad_categories', JSON.stringify(params.specialAdCategories || []));
    
    // Budget optimization settings
    if (isCBO && params.dailyBudget) {
      // CBO: Campaign Budget Optimization - budget at campaign level
      // dailyBudget is in EUR, Meta API expects cents
      body.append('daily_budget', String(Math.round(params.dailyBudget * 100)));
    } else {
      // ABO: Ad Set Budget Optimization - required field for non-CBO campaigns
      body.append('is_adset_budget_sharing_enabled', 'false');
    }
    
    body.append('access_token', this.accessToken);

    console.log('[createCampaign] Request params:', {
      adAccount: adAccountFormatted,
      name: params.name,
      objective: params.objective,
      status: params.status || 'ACTIVE',
      specialAdCategories: params.specialAdCategories || [],
      budgetType: params.budgetType || 'ABO',
      dailyBudget: params.dailyBudget,
      isCBO,
    });

    // Rate limiting with retry logic
    const url = `${META_GRAPH_URL}/${adAccountFormatted}/campaigns`;
    const data = await this.apiPostRequest<{ id: string; error?: any }>(url, body);

    console.log('[createCampaign] Response:', JSON.stringify(data, null, 2));

    return { id: data.id, name: params.name };
  }

  async getAdSets(campaignId?: string): Promise<any[]> {
    if (!this.adAccountId) {
      throw new Error("No ad account selected");
    }

    const endpoint = campaignId 
      ? `${campaignId}/adsets`
      : `act_${this.adAccountId.replace('act_', '')}/adsets`;

    const data = await this.apiRequest<{ data: any[] }>(
      endpoint,
      {
        // Include a broad set of ad set settings so import can run fully from DB cache after sync.
        fields: "id,name,status,effective_status,campaign_id,daily_budget,lifetime_budget,daily_min_spend_target,daily_spend_cap,lifetime_spend_cap,billing_event,optimization_goal,bid_strategy,attribution_spec,pacing_type,targeting,promoted_object,start_time,end_time,dsa_beneficiary,dsa_payor",
        limit: "500",
        filtering: JSON.stringify([{
          field: "effective_status",
          operator: "IN",
          value: [
            "ACTIVE",
            "PAUSED",
            "IN_PROCESS",
            "WITH_ISSUES",
            "PENDING_REVIEW",
            "DISAPPROVED",
            "PREAPPROVED",
            "PENDING_BILLING_INFO",
            "CAMPAIGN_PAUSED",
            "ADSET_PAUSED",
          ]
        }])
      }
    );

    return data.data || [];
  }

  async getAds(adsetId?: string): Promise<any[]> {
    if (!this.adAccountId) {
      throw new Error("No ad account selected");
    }

    const endpoint = adsetId 
      ? `${adsetId}/ads`
      : `act_${this.adAccountId.replace('act_', '')}/ads`;

    const data = await this.apiRequest<{ data: any[] }>(
      endpoint,
      {
        fields: "id,name,status,campaign_id,adset_id,creative",
        limit: "100"
      }
    );

    return data.data || [];
  }

  async getSampleAd(adSetId: string): Promise<any | null> {
    const adData = await this.apiRequest<{ data: any[] }>(
      `${adSetId}/ads`,
      {
        fields: "id,name,status,adset_id,creative{id,name,call_to_action_type,object_story_spec{link_data{link,message,name,caption,call_to_action{type,value{link}}},video_data{call_to_action{type,value{link,link_caption}},video_id,message,title}},asset_feed_spec{call_to_action_types,link_urls,bodies,titles,descriptions},effective_object_story_id}",
        limit: "1"
      }
    );
    const ad = adData.data?.[0] || null;
    if (!ad) return null;

    const creative = ad.creative;
    const hasUrl = creative?.object_story_spec?.link_data?.link 
      || creative?.object_story_spec?.link_data?.call_to_action?.value?.link
      || creative?.object_story_spec?.video_data?.call_to_action?.value?.link
      || creative?.asset_feed_spec?.link_urls?.length;

    if (!hasUrl && creative?.id) {
      try {
        const fullCreative = await this.apiRequest<any>(
          creative.id,
          {
            fields: "id,name,call_to_action_type,object_story_spec,asset_feed_spec,effective_object_story_id"
          }
        );
        console.log("[getSampleAd] Fetched full creative for", creative.id, ":", JSON.stringify(fullCreative, null, 2));
        ad.creative = { ...creative, ...fullCreative };
      } catch (err) {
        console.error("[getSampleAd] Failed to fetch full creative:", err);
      }
    } else {
      console.log("[getSampleAd] Creative data from ad-level fetch:", JSON.stringify(creative, null, 2));
    }
    return ad;
  }

  async getCampaignDetails(campaignId: string): Promise<{
    campaign: any;
    adSets: any[];
    ads: any[];
  }> {
    if (!this.adAccountId) {
      throw new Error("No ad account selected");
    }

    // Fetch campaign details
    const campaign = await this.apiRequest<any>(
      campaignId,
      {
        fields: "id,name,status,effective_status,objective,daily_budget,lifetime_budget,start_time,stop_time,special_ad_categories"
      }
    );

    // Fetch ad sets with full targeting info including DSA fields for beneficiary/payer
    // Only fetch ACTIVE/PAUSED ad sets to reduce API calls and avoid rate limits
    const adSetsData = await this.apiRequest<{ data: any[] }>(
      `${campaignId}/adsets`,
      {
        fields: "id,name,status,effective_status,daily_budget,lifetime_budget,daily_min_spend_target,daily_spend_cap,lifetime_spend_cap,billing_event,optimization_goal,bid_strategy,targeting,promoted_object,attribution_spec,pacing_type,start_time,end_time,dsa_beneficiary,dsa_payor",
        limit: "50",
        filtering: JSON.stringify([{
          field: "effective_status",
          operator: "IN",
          value: [
            "ACTIVE",
            "PAUSED",
            "IN_PROCESS",
            "WITH_ISSUES",
            "PENDING_REVIEW",
            "DISAPPROVED",
            "PREAPPROVED",
            "PENDING_BILLING_INFO",
            "CAMPAIGN_PAUSED",
            "ADSET_PAUSED",
          ]
        }])
      }
    );

    const adSets = adSetsData.data || [];

    let ads: any[] = [];
    try {
      const adsData = await this.apiRequest<{ data: any[] }>(
        `${campaignId}/ads`,
        {
          fields: "id,name,status,adset_id,creative{id,name,call_to_action_type,object_story_spec{link_data{link,message,name,caption,call_to_action{type,value{link}}},video_data{call_to_action{type,value{link,link_caption}},video_id,message,title}},asset_feed_spec{call_to_action_types,link_urls,bodies,titles,descriptions}}",
          limit: "50",
          filtering: JSON.stringify([{
            field: "effective_status",
            operator: "IN",
            value: ["ACTIVE", "PAUSED"]
          }])
        }
      );
      ads = adsData.data || [];
      console.log(`[getCampaignDetails] Fetched ${ads.length} ads for campaign ${campaignId}`);
      if (ads.length > 0) {
        const sampleAd = ads[0];
        console.log("[getCampaignDetails] Sample ad keys:", Object.keys(sampleAd));
        console.log("[getCampaignDetails] Sample ad creative:", JSON.stringify(sampleAd?.creative, null, 2));
        const linkData = sampleAd?.creative?.object_story_spec?.link_data;
        const videoData = sampleAd?.creative?.object_story_spec?.video_data;
        const feedSpec = sampleAd?.creative?.asset_feed_spec;
        console.log("[getCampaignDetails] link_data:", linkData ? JSON.stringify(linkData) : "none");
        console.log("[getCampaignDetails] video_data:", videoData ? JSON.stringify(videoData) : "none");
        console.log("[getCampaignDetails] asset_feed_spec keys:", feedSpec ? Object.keys(feedSpec) : "none");
        if (feedSpec?.link_urls) console.log("[getCampaignDetails] link_urls:", JSON.stringify(feedSpec.link_urls));
      }
    } catch (err) {
      console.error("[getCampaignDetails] Failed to fetch ads:", err);
    }

    return {
      campaign,
      adSets,
      ads
    };
  }

  async getCampaignsByPage(pageId: string): Promise<any[]> {
    if (!this.adAccountId) {
      throw new Error("No ad account selected");
    }

    // Get all campaigns first
    const campaigns = await this.getCampaigns();

    // Get all ads for this ad account with creative info to detect page usage (excluding archived)
    const adsData = await this.apiRequest<{ data: any[] }>(
      `act_${this.adAccountId.replace('act_', '')}/ads`,
      {
        fields: "id,campaign_id,effective_object_story_id,creative{object_story_spec}",
        limit: "500",
        filtering: JSON.stringify([{
          field: "effective_status",
          operator: "IN",
          value: ["ACTIVE", "PAUSED", "PENDING_REVIEW", "CAMPAIGN_PAUSED", "ADSET_PAUSED", "IN_PROCESS"]
        }])
      }
    );

    const ads = adsData.data || [];
    
    // Track which campaigns have ads and which match the selected page
    const campaignsWithAds = new Set<string>();
    const campaignsMatchingPage = new Set<string>();
    
    for (const ad of ads) {
      campaignsWithAds.add(ad.campaign_id);
      
      let matchesPage = false;
      
      // Check effective_object_story_id (format: {page_id}_{post_id})
      if (ad.effective_object_story_id && ad.effective_object_story_id.startsWith(pageId + "_")) {
        matchesPage = true;
      }
      
      // Check creative.object_story_spec for page_id or instagram_actor_id
      if (!matchesPage && ad.creative?.object_story_spec) {
        const spec = ad.creative.object_story_spec;
        if (spec.page_id === pageId || spec.instagram_actor_id === pageId) {
          matchesPage = true;
        }
      }
      
      if (matchesPage) {
        campaignsMatchingPage.add(ad.campaign_id);
      }
    }

    // Return campaigns that either:
    // 1. Have ads matching the selected page, OR
    // 2. Have no ads at all (empty campaigns)
    return campaigns.filter(c => 
      campaignsMatchingPage.has(c.id) || !campaignsWithAds.has(c.id)
    );
  }

  async getInsights(objectId: string, objectType: "campaign" | "adset" | "ad", datePreset: string = "last_7d"): Promise<any[]> {
    const data = await this.apiRequest<{ data: any[] }>(
      `${objectId}/insights`,
      {
        fields: "impressions,clicks,spend,reach,cpc,cpm,ctr,actions",
        date_preset: datePreset,
        level: objectType
      }
    );

    return data.data || [];
  }

  async getAccountInsights(datePreset: string = "last_7d"): Promise<any[]> {
    if (!this.adAccountId) {
      throw new Error("No ad account selected");
    }

    const data = await this.apiRequest<{ data: any[] }>(
      `act_${this.adAccountId.replace('act_', '')}/insights`,
      {
        fields: "impressions,clicks,spend,reach,cpc,cpm,ctr,actions,cost_per_action_type",
        date_preset: datePreset
      }
    );

    return data.data || [];
  }
  
  async getAccountInsightsDaily(datePreset: string = "last_7d"): Promise<any[]> {
    if (!this.adAccountId) {
      throw new Error("No ad account selected");
    }

    const data = await this.apiRequest<{ data: any[] }>(
      `act_${this.adAccountId.replace('act_', '')}/insights`,
      {
        fields: "impressions,clicks,spend,reach,actions,cost_per_action_type",
        date_preset: datePreset,
        time_increment: "1"
      }
    );

    return data.data || [];
  }
  
  async getActiveAdsCount(): Promise<number> {
    if (!this.adAccountId) {
      throw new Error("No ad account selected");
    }

    const data = await this.apiRequest<{ data: any[]; summary?: { total_count: number } }>(
      `act_${this.adAccountId.replace('act_', '')}/ads`,
      {
        effective_status: '["ACTIVE"]',
        summary: 'total_count',
        limit: '1'
      }
    );

    return data.summary?.total_count || data.data?.length || 0;
  }

  async getCampaignStatistics(campaignId: string, datePreset: string = "last_7d"): Promise<{
    campaign: { id: string; name: string; status: string };
    adSets: Array<{
      id: string;
      name: string;
      status: string;
      impressions: number;
      clicks: number;
      spend: string;
      reach: number;
      ctr: string;
      cpc: string;
      cpm: string;
      ads: Array<{
        id: string;
        name: string;
        status: string;
        impressions: number;
        clicks: number;
        spend: string;
        reach: number;
        ctr: string;
        cpc: string;
        cpm: string;
      }>;
    }>;
    dateRange: string;
  }> {
    if (!this.adAccountId) {
      throw new Error("No ad account selected");
    }

    const campaign = await this.apiRequest<any>(
      campaignId,
      { fields: "id,name,status,effective_status" }
    );

    const adSetsData = await this.apiRequest<{ data: any[] }>(
      `${campaignId}/adsets`,
      { fields: "id,name,status,effective_status,created_time", limit: "100" }
    );

    const adsData = await this.apiRequest<{ data: any[] }>(
      `${campaignId}/ads`,
      { fields: "id,name,status,effective_status,adset_id", limit: "500" }
    );

    let adSetInsightsMap: Map<string, any> = new Map();
    let adInsightsMap: Map<string, any> = new Map();

    try {
      const adSetInsightsData = await this.apiRequest<{ data: any[] }>(
        `${campaignId}/insights`,
        { 
          fields: "adset_id,adset_name,impressions,clicks,spend,reach,cpc,cpm,ctr", 
          date_preset: datePreset,
          level: "adset",
          limit: "500"
        }
      );
      for (const insight of adSetInsightsData.data || []) {
        adSetInsightsMap.set(insight.adset_id, insight);
      }
    } catch (e) {
      console.log(`[Stats] Could not batch fetch adset insights:`, (e as Error).message);
    }

    try {
      const adInsightsData = await this.apiRequest<{ data: any[] }>(
        `${campaignId}/insights`,
        { 
          fields: "ad_id,ad_name,impressions,clicks,spend,reach,cpc,cpm,ctr", 
          date_preset: datePreset,
          level: "ad",
          limit: "500"
        }
      );
      for (const insight of adInsightsData.data || []) {
        adInsightsMap.set(insight.ad_id, insight);
      }
    } catch (e) {
      console.log(`[Stats] Could not batch fetch ad insights:`, (e as Error).message);
    }

    const adSets = adSetsData.data || [];
    const ads = adsData.data || [];
    const adsByAdSet: Map<string, any[]> = new Map();
    
    for (const ad of ads) {
      const adSetId = ad.adset_id;
      if (!adsByAdSet.has(adSetId)) {
        adsByAdSet.set(adSetId, []);
      }
      adsByAdSet.get(adSetId)!.push(ad);
    }

    const result: any[] = [];

    for (const adSet of adSets) {
      const adSetInsights = adSetInsightsMap.get(adSet.id) || { impressions: 0, clicks: 0, spend: "0", reach: 0, ctr: "0", cpc: "0", cpm: "0" };
      const adSetAds = adsByAdSet.get(adSet.id) || [];
      const adsWithStats: any[] = [];

      for (const ad of adSetAds) {
        const adInsights = adInsightsMap.get(ad.id) || { impressions: 0, clicks: 0, spend: "0", reach: 0, ctr: "0", cpc: "0", cpm: "0" };
        adsWithStats.push({
          id: ad.id,
          name: ad.name,
          status: ad.effective_status || ad.status,
          impressions: parseInt(adInsights.impressions) || 0,
          clicks: parseInt(adInsights.clicks) || 0,
          spend: adInsights.spend || "0",
          reach: parseInt(adInsights.reach) || 0,
          ctr: adInsights.ctr || "0",
          cpc: adInsights.cpc || "0",
          cpm: adInsights.cpm || "0",
        });
      }

      result.push({
        id: adSet.id,
        name: adSet.name,
        status: adSet.effective_status || adSet.status,
        impressions: parseInt(adSetInsights.impressions) || 0,
        clicks: parseInt(adSetInsights.clicks) || 0,
        spend: adSetInsights.spend || "0",
        reach: parseInt(adSetInsights.reach) || 0,
        ctr: adSetInsights.ctr || "0",
        cpc: adSetInsights.cpc || "0",
        cpm: adSetInsights.cpm || "0",
        ads: adsWithStats,
      });
    }

    return {
      campaign: {
        id: campaign.id,
        name: campaign.name,
        status: campaign.effective_status || campaign.status,
      },
      adSets: result,
      dateRange: datePreset,
    };
  }

  async getAdStatisticsWithBreakdown(
    campaignId: string, 
    datePreset: string = "last_7d",
    breakdown: string = "none",
    adSetFilter: string = "all"
  ): Promise<{
    campaign: { id: string; name: string; status: string };
    adSets: Array<{ id: string; name: string; status: string }>;
    ads: Array<{
      id: string;
      name: string;
      status: string;
      adSetId: string;
      adSetName: string;
      spend: string;
      impressions: number;
      cpm: string;
      clicks: number;
      ctr: string;
      cpc: string;
      reach?: number;
      frequency?: string;
      roas?: number;
      purchases?: number;
      purchaseValue?: number;
      children?: Array<{
        breakdownValue: string;
        spend: string;
        impressions: number;
        cpm: string;
        clicks: number;
        ctr: string;
        cpc: string;
      }>;
    }>;
    dateRange: string;
    breakdown: string;
  }> {
    if (!this.adAccountId) {
      throw new Error("No ad account selected");
    }

    const campaign = await this.apiRequest<any>(
      campaignId,
      { fields: "id,name,status,effective_status" }
    );

    const adSetsData = await this.apiRequest<{ data: any[] }>(
      `${campaignId}/adsets`,
      { 
        fields: "id,name,status,effective_status,created_time", 
        limit: "100",
        filtering: JSON.stringify([{ field: "effective_status", operator: "IN", value: ["ACTIVE"] }])
      }
    );

    const adSets = adSetsData.data || [];

    const adsData = await this.apiRequest<{ data: any[] }>(
      `${campaignId}/ads`,
      { 
        fields: "id,name,status,effective_status,adset_id", 
        limit: "500",
        filtering: JSON.stringify([{ field: "effective_status", operator: "IN", value: ["ACTIVE"] }])
      }
    );

    const ads = adsData.data || [];

    const adSetMap = new Map<string, any>();
    for (const adSet of adSets) {
      adSetMap.set(adSet.id, adSet);
    }

    const breakdownMapping: Record<string, string> = {
      "age": "age",
      "gender": "gender",
      "platform": "publisher_platform",
      "region": "region",
      "body_asset": "body_asset",
      "title_asset": "title_asset",
      "description_asset": "description_asset"
    };

    // Fetch ad set level insights (for totals)
    const adSetInsightParams: Record<string, string> = {
      fields: "adset_id,adset_name,impressions,clicks,spend,cpc,cpm,ctr,reach,frequency,purchase_roas,actions,action_values",
      date_preset: datePreset,
      level: "adset",
      limit: "100"
    };

    let adSetInsightsData: any[] = [];
    try {
      const response = await this.apiRequest<{ data: any[] }>(
        `${campaignId}/insights`,
        adSetInsightParams
      );
      adSetInsightsData = response.data || [];
    } catch (e) {
      console.log(`[Stats] Could not fetch ad set insights:`, (e as Error).message);
    }

    const adSetInsightsMap = new Map<string, any>();
    for (const insight of adSetInsightsData) {
      adSetInsightsMap.set(insight.adset_id, insight);
    }

    // Fetch ad level insights WITHOUT breakdown first (for accurate totals)
    const baseInsightParams: Record<string, string> = {
      fields: "ad_id,ad_name,impressions,clicks,spend,cpc,cpm,ctr,reach,frequency,purchase_roas,actions,action_values",
      date_preset: datePreset,
      level: "ad",
      limit: "1000"
    };

    let baseInsightsData: any[] = [];
    try {
      const response = await this.apiRequest<{ data: any[] }>(
        `${campaignId}/insights`,
        baseInsightParams
      );
      baseInsightsData = response.data || [];
    } catch (e) {
      console.log(`[Stats] Could not fetch base insights:`, (e as Error).message);
    }

    // Fetch all 3 text breakdown dimensions SEQUENTIALLY to avoid rate limits
    const textBreakdowns = ["body_asset", "title_asset", "description_asset"] as const;
    
    const breakdownInsightsMap: Record<string, any[]> = {
      body_asset: [],
      title_asset: [],
      description_asset: []
    };

    for (const bd of textBreakdowns) {
      try {
        const response = await this.apiRequest<{ data: any[] }>(
          `${campaignId}/insights`,
          {
            fields: "ad_id,impressions,clicks,spend,cpm,ctr,cpc",
            date_preset: datePreset,
            level: "ad",
            limit: "1000",
            breakdowns: bd
          }
        );
        breakdownInsightsMap[bd] = response.data || [];
      } catch (e) {
        console.log(`[Stats] Could not fetch ${bd} breakdown:`, (e as Error).message);
        breakdownInsightsMap[bd] = [];
      }
    }

    // For backward compatibility, also set insightsData to selected breakdown
    let insightsData: any[] = [];
    if (breakdown !== "none" && breakdownMapping[breakdown]) {
      insightsData = breakdownInsightsMap[breakdown] || [];
    }

    // Build ad insights from base data (without breakdown) for accurate totals
    const adInsightsMap = new Map<string, { 
      totals: any; 
      bodyBreakdown: any[];
      titleBreakdown: any[];
      descriptionBreakdown: any[];
      children: any[]; // For backward compatibility
    }>();

    // First, populate totals from base insights
    for (const insight of baseInsightsData) {
      const adId = insight.ad_id;
      adInsightsMap.set(adId, { 
        totals: { 
          impressions: parseInt(insight.impressions) || 0, 
          clicks: parseInt(insight.clicks) || 0, 
          spend: parseFloat(insight.spend) || 0,
          reach: parseInt(insight.reach) || 0,
          frequency: parseFloat(insight.frequency) || 0,
          roas: insight.purchase_roas?.[0]?.value ? parseFloat(insight.purchase_roas[0].value) : null,
          purchases: 0,
          purchaseValue: 0
        }, 
        bodyBreakdown: [],
        titleBreakdown: [],
        descriptionBreakdown: [],
        children: [] 
      });
      
      const entry = adInsightsMap.get(adId)!;
      if (insight.actions) {
        for (const action of insight.actions) {
          if (action.action_type === "purchase" || action.action_type === "omni_purchase") {
            entry.totals.purchases += parseInt(action.value) || 0;
          }
        }
      }
      if (insight.action_values) {
        for (const actionValue of insight.action_values) {
          if (actionValue.action_type === "purchase" || actionValue.action_type === "omni_purchase") {
            entry.totals.purchaseValue += parseFloat(actionValue.value) || 0;
          }
        }
      }
    }

    // Helper to ensure ad entry exists in map
    const ensureAdEntry = (adId: string) => {
      if (!adInsightsMap.has(adId)) {
        adInsightsMap.set(adId, { 
          totals: { 
            impressions: 0, clicks: 0, spend: 0, reach: 0, frequency: 0, 
            roas: null, purchases: 0, purchaseValue: 0
          }, 
          bodyBreakdown: [], titleBreakdown: [], descriptionBreakdown: [], children: [] 
        });
      }
      return adInsightsMap.get(adId)!;
    };

    // Add body_asset breakdown
    for (const insight of breakdownInsightsMap.body_asset) {
      const adId = insight.ad_id;
      const entry = ensureAdEntry(adId);
      entry.bodyBreakdown.push({
        breakdownValue: insight.body_asset?.text || insight.body_asset?.id || "Unknown",
        spend: insight.spend || "0",
        impressions: parseInt(insight.impressions) || 0,
        cpm: insight.cpm || "0",
        clicks: parseInt(insight.clicks) || 0,
        ctr: insight.ctr || "0",
        cpc: insight.cpc || "0"
      });
    }

    // Add title_asset breakdown
    for (const insight of breakdownInsightsMap.title_asset) {
      const adId = insight.ad_id;
      const entry = ensureAdEntry(adId);
      entry.titleBreakdown.push({
        breakdownValue: insight.title_asset?.text || insight.title_asset?.id || "Unknown",
        spend: insight.spend || "0",
        impressions: parseInt(insight.impressions) || 0,
        cpm: insight.cpm || "0",
        clicks: parseInt(insight.clicks) || 0,
        ctr: insight.ctr || "0",
        cpc: insight.cpc || "0"
      });
    }

    // Add description_asset breakdown
    for (const insight of breakdownInsightsMap.description_asset) {
      const adId = insight.ad_id;
      const entry = ensureAdEntry(adId);
      entry.descriptionBreakdown.push({
        breakdownValue: insight.description_asset?.text || insight.description_asset?.id || "Unknown",
        spend: insight.spend || "0",
        impressions: parseInt(insight.impressions) || 0,
        cpm: insight.cpm || "0",
        clicks: parseInt(insight.clicks) || 0,
        ctr: insight.ctr || "0",
        cpc: insight.cpc || "0"
      });
    }

    // For backward compatibility, set children to selected breakdown
    Array.from(adInsightsMap.entries()).forEach(([adId, entry]) => {
      if (breakdown === "body_asset") {
        entry.children = entry.bodyBreakdown;
      } else if (breakdown === "title_asset") {
        entry.children = entry.titleBreakdown;
      } else if (breakdown === "description_asset") {
        entry.children = entry.descriptionBreakdown;
      }
    });

    const result: any[] = [];

    for (const ad of ads) {
      const adSet = adSetMap.get(ad.adset_id);
      if (!adSet) continue;

      if (adSetFilter !== "all") {
        const selectedAdSets = adSetFilter.split(",");
        if (!selectedAdSets.includes(ad.adset_id)) continue;
      }

      const insightEntry = adInsightsMap.get(ad.id);
      const totals = insightEntry?.totals || { 
        impressions: 0, 
        clicks: 0, 
        spend: 0,
        reach: 0,
        frequency: 0,
        roas: null,
        purchases: 0,
        purchaseValue: 0
      };
      const children = insightEntry?.children || [];

      const totalImpressions = totals.impressions;
      const totalClicks = totals.clicks;
      const totalSpend = totals.spend;

      const ctr = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toString() : "0";
      const cpc = totalClicks > 0 ? (totalSpend / totalClicks).toString() : "0";
      const cpm = totalImpressions > 0 ? ((totalSpend / totalImpressions) * 1000).toString() : "0";

      const adResult: any = {
        id: ad.id,
        name: ad.name,
        status: ad.effective_status || ad.status,
        adSetId: ad.adset_id,
        adSetName: adSet.name,
        spend: totalSpend.toFixed(2),
        impressions: totalImpressions,
        cpm,
        clicks: totalClicks,
        ctr,
        cpc,
        reach: totals.reach || 0,
        frequency: totals.frequency?.toFixed(2) || "0",
        roas: totals.roas,
        purchases: totals.purchases || 0,
        purchaseValue: totals.purchaseValue || 0
      };

      // Add all 3 breakdown dimensions
      if (insightEntry) {
        adResult.bodyBreakdown = insightEntry.bodyBreakdown || [];
        adResult.titleBreakdown = insightEntry.titleBreakdown || [];
        adResult.descriptionBreakdown = insightEntry.descriptionBreakdown || [];
      }
      
      // For backward compatibility
      if (breakdown !== "none" && children.length > 0) {
        adResult.children = children;
      }

      result.push(adResult);
    }

    return {
      campaign: {
        id: campaign.id,
        name: campaign.name,
        status: campaign.effective_status || campaign.status,
      },
      adSets: adSets.map(as => {
        const insights = adSetInsightsMap.get(as.id);
        let purchases = 0;
        let purchaseValue = 0;
        let roas: number | null = null;
        
        if (insights?.actions) {
          for (const action of insights.actions) {
            if (action.action_type === "purchase" || action.action_type === "omni_purchase") {
              purchases += parseInt(action.value) || 0;
            }
          }
        }
        if (insights?.action_values) {
          for (const actionValue of insights.action_values) {
            if (actionValue.action_type === "purchase" || actionValue.action_type === "omni_purchase") {
              purchaseValue += parseFloat(actionValue.value) || 0;
            }
          }
        }
        if (insights?.purchase_roas && insights.purchase_roas.length > 0) {
          roas = parseFloat(insights.purchase_roas[0]?.value) || null;
        }
        
        return {
          id: as.id,
          name: as.name,
          status: as.effective_status || as.status,
          createdTime: as.created_time || null,
          spend: insights?.spend || "0",
          impressions: parseInt(insights?.impressions) || 0,
          clicks: parseInt(insights?.clicks) || 0,
          ctr: insights?.ctr || "0",
          cpc: insights?.cpc || "0",
          cpm: insights?.cpm || "0",
          reach: parseInt(insights?.reach) || 0,
          frequency: insights?.frequency || "0",
          purchases,
          purchaseValue,
          roas
        };
      }),
      ads: result,
      dateRange: datePreset,
      breakdown
    };
  }

  async syncCampaigns(): Promise<{ synced: number; errors: string[] }> {
    const errors: string[] = [];
    let synced = 0;

    try {
      const campaigns = await this.getCampaigns();

      for (const campaign of campaigns) {
        try {
          await db.insert(metaCampaigns)
            .values({
              id: campaign.id,
              userId: this.userId,
              adAccountId: this.adAccountId!,
              name: campaign.name,
              status: campaign.status,
              objective: campaign.objective,
              dailyBudget: campaign.daily_budget,
              lifetimeBudget: campaign.lifetime_budget,
              startTime: campaign.start_time ? new Date(campaign.start_time) : null,
              stopTime: campaign.stop_time ? new Date(campaign.stop_time) : null,
              createdTime: campaign.created_time ? new Date(campaign.created_time) : null,
              updatedTime: campaign.updated_time ? new Date(campaign.updated_time) : null,
              rawData: campaign,
              lastSyncedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: metaCampaigns.id,
              set: {
                name: campaign.name,
                status: campaign.status,
                objective: campaign.objective,
                dailyBudget: campaign.daily_budget,
                lifetimeBudget: campaign.lifetime_budget,
                startTime: campaign.start_time ? new Date(campaign.start_time) : null,
                stopTime: campaign.stop_time ? new Date(campaign.stop_time) : null,
                updatedTime: campaign.updated_time ? new Date(campaign.updated_time) : null,
                rawData: campaign,
                lastSyncedAt: new Date(),
              }
            });
          synced++;
        } catch (err: any) {
          errors.push(`Campaign ${campaign.id}: ${err.message}`);
        }
      }
    } catch (err: any) {
      errors.push(`Fetch campaigns failed: ${err.message}`);
    }

    return { synced, errors };
  }

  async syncAdSets(): Promise<{ synced: number; errors: string[] }> {
    const errors: string[] = [];
    let synced = 0;

    try {
      const adsets = await this.getAdSets();

      for (const adset of adsets) {
        try {
          await db.insert(metaAdsets)
            .values({
              id: adset.id,
              userId: this.userId,
              adAccountId: this.adAccountId!,
              campaignId: adset.campaign_id,
              name: adset.name,
              status: adset.effective_status || adset.status,
              dailyBudget: adset.daily_budget,
              lifetimeBudget: adset.lifetime_budget,
              targetingJson: adset.targeting,
              startTime: adset.start_time ? new Date(adset.start_time) : null,
              endTime: adset.end_time ? new Date(adset.end_time) : null,
              rawData: adset,
              lastSyncedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: metaAdsets.id,
              set: {
                name: adset.name,
                status: adset.effective_status || adset.status,
                dailyBudget: adset.daily_budget,
                lifetimeBudget: adset.lifetime_budget,
                targetingJson: adset.targeting,
                startTime: adset.start_time ? new Date(adset.start_time) : null,
                endTime: adset.end_time ? new Date(adset.end_time) : null,
                rawData: adset,
                lastSyncedAt: new Date(),
              }
            });
          synced++;
        } catch (err: any) {
          errors.push(`AdSet ${adset.id}: ${err.message}`);
        }
      }
    } catch (err: any) {
      errors.push(`Fetch adsets failed: ${err.message}`);
    }

    return { synced, errors };
  }

  async syncAds(): Promise<{ synced: number; errors: string[] }> {
    const errors: string[] = [];
    let synced = 0;

    try {
      const ads = await this.getAds();

      for (const ad of ads) {
        try {
          await db.insert(metaAds)
            .values({
              id: ad.id,
              userId: this.userId,
              adAccountId: this.adAccountId!,
              campaignId: ad.campaign_id,
              adsetId: ad.adset_id,
              name: ad.name,
              status: ad.status,
              creativeJson: ad.creative,
              rawData: ad,
              lastSyncedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: metaAds.id,
              set: {
                name: ad.name,
                status: ad.status,
                creativeJson: ad.creative,
                rawData: ad,
                lastSyncedAt: new Date(),
              }
            });
          synced++;
        } catch (err: any) {
          errors.push(`Ad ${ad.id}: ${err.message}`);
        }
      }
    } catch (err: any) {
      errors.push(`Fetch ads failed: ${err.message}`);
    }

    return { synced, errors };
  }

  async syncInsights(datePreset: string = "last_7d", campaignIds?: string[]): Promise<{ synced: number; errors: string[] }> {
    const errors: string[] = [];
    let synced = 0;

    try {
      const ids = campaignIds || (await this.getCampaigns()).map((c: any) => c.id);

      const INSIGHTS_BATCH = 5;
      for (let i = 0; i < ids.length; i += INSIGHTS_BATCH) {
        const batch = ids.slice(i, i + INSIGHTS_BATCH);
        const results = await Promise.allSettled(
          batch.map(async (campaignId: string) => {
            const insights = await this.getInsights(campaignId, "campaign", datePreset);
            for (const insight of insights) {
              await db.insert(metaInsights)
                .values({
                  userId: this.userId,
                  adAccountId: this.adAccountId!,
                  objectId: campaignId,
                  objectType: "campaign",
                  dateStart: insight.date_start || "",
                  dateStop: insight.date_stop || "",
                  impressions: parseInt(insight.impressions) || 0,
                  clicks: parseInt(insight.clicks) || 0,
                  spend: insight.spend,
                  reach: parseInt(insight.reach) || 0,
                  cpc: insight.cpc,
                  cpm: insight.cpm,
                  ctr: insight.ctr,
                  conversions: 0,
                  rawData: insight,
                  lastSyncedAt: new Date(),
                })
                .onConflictDoNothing();
              synced++;
            }
          })
        );
        for (const r of results) {
          if (r.status === 'rejected') {
            errors.push(`Insights batch error: ${r.reason?.message || r.reason}`);
          }
        }
        if (i + INSIGHTS_BATCH < ids.length) {
          await sleep(2000);
        }
      }
    } catch (err: any) {
      errors.push(`Fetch insights failed: ${err.message}`);
    }

    return { synced, errors };
  }

  async fullSync(): Promise<{ campaigns: number; adsets: number; ads: number; insights: number; errors: string[] }> {
    const allErrors: string[] = [];

    const campaignResult = await this.syncCampaigns();
    allErrors.push(...campaignResult.errors);

    await sleep(1000);

    const adsetResult = await this.syncAdSets();
    allErrors.push(...adsetResult.errors);

    await sleep(1000);

    const adResult = await this.syncAds();
    allErrors.push(...adResult.errors);

    await sleep(1000);

    const campaignIds = (await db.select({ id: metaCampaigns.id })
      .from(metaCampaigns)
      .where(eq(metaCampaigns.userId, this.userId)))
      .map(c => c.id);
    const insightsResult = await this.syncInsights("last_7d", campaignIds);
    allErrors.push(...insightsResult.errors);

    return {
      campaigns: campaignResult.synced,
      adsets: adsetResult.synced,
      ads: adResult.synced,
      insights: insightsResult.synced,
      errors: allErrors
    };
  }

  async getPixels(): Promise<Array<{ id: string; name: string; creation_time?: string }>> {
    if (!this.adAccountId) {
      throw new Error("No ad account selected");
    }

    const data = await this.apiRequest<{ data: any[] }>(
      `act_${this.adAccountId.replace('act_', '')}/adspixels`,
      {
        fields: "id,name,creation_time",
        limit: "100"
      }
    );

    return data.data || [];
  }

  async getCustomAudiences(): Promise<Array<{ id: string; name: string; subtype?: string }>> {
    if (!this.adAccountId) {
      throw new Error("No ad account selected");
    }

    const data = await this.apiRequest<{ data: any[] }>(
      `act_${this.adAccountId.replace('act_', '')}/customaudiences`,
      {
        fields: "id,name,subtype",
        limit: "100"
      }
    );

    return data.data || [];
  }

  async getSavedAudiences(): Promise<Array<{ id: string; name: string }>> {
    if (!this.adAccountId) {
      throw new Error("No ad account selected");
    }

    const data = await this.apiRequest<{ data: any[] }>(
      `act_${this.adAccountId.replace('act_', '')}/saved_audiences`,
      {
        fields: "id,name",
        limit: "100"
      }
    );

    return data.data || [];
  }

  // ===== Ad Creation Methods =====

  async createAdSet(params: {
    campaignId: string;
    name: string;
    status?: string;
    dailyBudget?: number;
    lifetimeBudget?: number;
    startTime?: string;
    endTime?: string;
    billingEvent?: string;
    optimizationGoal?: string;
    dailyMinSpendTarget?: number;
    dailySpendCap?: number;
    lifetimeSpendCap?: number;
    targeting?: {
      geoLocations?: { countries?: string[] };
      ageMin?: number;
      ageMax?: number;
      gender?: 'ALL' | 'MALE' | 'FEMALE';
      customAudiences?: Array<{ id: string }>;
      excludedCustomAudiences?: Array<{ id: string }>;
    };
    promotedObject?: { pixelId?: string; pageId?: string; customEventType?: string };
    dsaBeneficiary?: string;
    dsaPayor?: string;
    isDynamicCreative?: boolean;
    hasInstagramAccount?: boolean;  // Whether we have a valid Instagram account for placements
  }): Promise<{ id: string; name: string }> {
    if (!this.adAccountId || !this.accessToken) {
      throw new Error("No ad account selected or not authenticated");
    }

    const adAccountFormatted = this.adAccountId.startsWith('act_') 
      ? this.adAccountId 
      : `act_${this.adAccountId}`;

    const body = new URLSearchParams();
    body.append('name', params.name);
    body.append('campaign_id', params.campaignId);
    body.append('status', params.status || 'ACTIVE');
    body.append('billing_event', params.billingEvent || 'IMPRESSIONS');
    body.append('optimization_goal', params.optimizationGoal || 'LINK_CLICKS');
    body.append('bid_strategy', 'LOWEST_COST_WITHOUT_CAP');
    
    if (params.dailyBudget) {
      body.append('daily_budget', (params.dailyBudget * 100).toString());
    }
    if (params.lifetimeBudget) {
      body.append('lifetime_budget', (params.lifetimeBudget * 100).toString());
    }
    if (params.startTime) {
      body.append('start_time', params.startTime);
    }
    if (params.endTime) {
      body.append('end_time', params.endTime);
    }

    // Build targeting
    const targeting: Record<string, any> = {};
    if (params.targeting?.geoLocations?.countries) {
      targeting.geo_locations = { countries: params.targeting.geoLocations.countries };
    }
    if (params.targeting?.ageMin) {
      targeting.age_min = params.targeting.ageMin;
    }
    if (params.targeting?.ageMax) {
      targeting.age_max = params.targeting.ageMax;
    }
    if (params.targeting?.customAudiences) {
      targeting.custom_audiences = params.targeting.customAudiences;
    }
    if (params.targeting?.excludedCustomAudiences) {
      targeting.excluded_custom_audiences = params.targeting.excludedCustomAudiences;
    }
    // Gender targeting: Meta uses genders array [1] = male, [2] = female
    if (params.targeting?.gender && params.targeting.gender !== 'ALL') {
      targeting.genders = params.targeting.gender === 'MALE' ? [1] : [2];
    }
    
    // Use Advantage+ placements (automatic) - let Meta optimize across Facebook + Instagram
    // Don't restrict to specific platforms or positions - Meta will choose the best placements
    // Note: Instagram account ID is passed at the creative level, not targeting level
    
    if (Object.keys(targeting).length > 0) {
      body.append('targeting', JSON.stringify(targeting));
    } else {
      body.append('targeting', JSON.stringify({ geo_locations: { countries: ['US'] } }));
    }

    // Spending limits
    if (params.dailyMinSpendTarget) {
      body.append('daily_min_spend_target', (params.dailyMinSpendTarget * 100).toString());
    }
    if (params.dailySpendCap) {
      body.append('daily_spend_cap', (params.dailySpendCap * 100).toString());
    }
    if (params.lifetimeSpendCap) {
      body.append('lifetime_spend_cap', (params.lifetimeSpendCap * 100).toString());
    }

    if (params.promotedObject) {
      const promotedObj: Record<string, string> = {};
      if (params.promotedObject.pixelId) promotedObj.pixel_id = params.promotedObject.pixelId;
      if (params.promotedObject.pageId) promotedObj.page_id = params.promotedObject.pageId;
      if (params.promotedObject.customEventType) promotedObj.custom_event_type = params.promotedObject.customEventType;
      body.append('promoted_object', JSON.stringify(promotedObj));
    }

    // EU Digital Services Act (DSA) compliance - required for ads in EU countries
    if (params.dsaBeneficiary) {
      body.append('dsa_beneficiary', params.dsaBeneficiary);
    }
    if (params.dsaPayor) {
      body.append('dsa_payor', params.dsaPayor);
    }

    // is_dynamic_creative is required when using asset_feed_spec for Dynamic Creative Optimization (Flexible format)
    // This limits to 1 ad per ad set, but that ad contains ALL media assets and text variations
    // Only set to true if explicitly requested (for Flexible/Dynamic Creative format)
    if (params.isDynamicCreative === true) {
      body.append('is_dynamic_creative', 'true');
    }

    body.append('access_token', this.accessToken);

    // Log the full request for debugging
    const debugBody: Record<string, string> = {};
    body.forEach((value, key) => {
      if (key !== 'access_token') debugBody[key] = value;
    });
    console.log('[MetaAdsApi] createAdSet request:', JSON.stringify(debugBody, null, 2));

    // Rate limiting with retry logic
    const url = `${META_GRAPH_URL}/${adAccountFormatted}/adsets`;
    const data = await this.apiPostRequest<{ id: string }>(url, body);
    
    console.log('[MetaAdsApi] createAdSet response:', JSON.stringify(data, null, 2));

    return { id: data.id, name: params.name };
  }

  async uploadImage(imageBuffer: Buffer, filename: string, mimeType?: string): Promise<{ hash: string }> {
    if (!this.adAccountId || !this.accessToken) {
      throw new Error("No ad account selected or not authenticated");
    }

    const adAccountFormatted = this.adAccountId.startsWith('act_') 
      ? this.adAccountId 
      : `act_${this.adAccountId}`;

    // Ensure filename has proper extension for Meta API
    let filenameWithExt = filename;
    if (!filename.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
      // Add extension based on mimeType or default to .png
      const ext = mimeType === 'image/jpeg' ? '.jpg' : 
                  mimeType === 'image/gif' ? '.gif' :
                  mimeType === 'image/webp' ? '.webp' : '.png';
      filenameWithExt = `${filename}${ext}`;
    }

    // Use URLSearchParams with base64 bytes - NOT multipart FormData
    const url = `${META_GRAPH_URL}/${adAccountFormatted}/adimages`;
    
    const body = new URLSearchParams();
    body.append('access_token', this.accessToken);
    body.append('bytes', imageBuffer.toString('base64'));
    
    console.log('[MetaAdsApi] Image bytes length (base64):', body.get('bytes')?.length);
    
    const data = await this.apiPostRequest<{ images: Record<string, { hash: string }> }>(url, body);
    
    console.log('[MetaAdsApi] uploadImage response:', JSON.stringify(data, null, 2));

    const images = data.images || {};
    const imageKey = Object.keys(images)[0];
    return { hash: images[imageKey]?.hash };
  }

  /**
   * Get video thumbnail URL from Meta
   * Returns the first available thumbnail for a video
   */
  async getVideoThumbnail(videoId: string): Promise<string | null> {
    if (!this.accessToken) {
      console.warn('[MetaAdsApi] No access token for getVideoThumbnail');
      return null;
    }

    try {
      const url = `${META_GRAPH_URL}/${videoId}?fields=thumbnails&access_token=${this.accessToken}`;
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.error) {
        console.warn('[MetaAdsApi] getVideoThumbnail error:', data.error.message);
        return null;
      }

      const thumbnails = data.thumbnails?.data || [];
      if (thumbnails.length > 0) {
        // Return the first thumbnail URI
        return thumbnails[0].uri || null;
      }

      return null;
    } catch (error) {
      console.warn('[MetaAdsApi] getVideoThumbnail failed:', error);
      return null;
    }
  }

  // Core video upload logic shared by uploadVideo and uploadVideoNoWait
  private async uploadVideoCore(videoUrlOrPath: string, name: string, options?: { localPath?: string }): Promise<{ id: string; transcodeResult?: TranscodeResult }> {
    const uploadStartTime = Date.now();
    
    if (!this.adAccountId || !this.accessToken) {
      throw new Error("No ad account selected or not authenticated");
    }

    const adAccountFormatted = this.adAccountId.startsWith('act_') 
      ? this.adAccountId 
      : `act_${this.adAccountId}`;

    console.log('[MetaAdsApi] Downloading and analyzing video for Meta compatibility');
    let downloadedPath: string | null = options?.localPath || null;
    let transcodedPath: string | null = null;
    let transcodeResult: TranscodeResult | undefined;

    try {
      const maxDownloadRetries = 3;
      for (let attempt = 1; attempt <= maxDownloadRetries; attempt++) {
        try {
          if (!downloadedPath) {
            downloadedPath = await downloadToTemp(videoUrlOrPath, name);
          }
          console.log('[MetaAdsApi] Video downloaded to:', downloadedPath);

          transcodeResult = await prepareVideoForMeta(downloadedPath, name);
          console.log('[MetaAdsApi] Transcode result:', { 
            ok: transcodeResult.ok, 
            transcoded: transcodeResult.transcoded,
            reasons: transcodeResult.reasons 
          });

          if (!transcodeResult.ok) {
            const errorMsg = transcodeResult.logs.error || transcodeResult.reasons.join(', ');
            if (attempt < maxDownloadRetries && (errorMsg.includes('moov atom') || errorMsg.includes('ffprobe failed') || errorMsg.includes('Invalid data'))) {
              console.warn(`[MetaAdsApi] Video preparation failed (attempt ${attempt}/${maxDownloadRetries}): ${errorMsg} - retrying download...`);
              if (downloadedPath) {
                try { fs.unlinkSync(downloadedPath); } catch {}
              }
              await new Promise(r => setTimeout(r, 2000 * attempt));
              continue;
            }
            throw new Error(`Video preparation failed: ${errorMsg}`);
          }
          break;
        } catch (err: any) {
          if (attempt < maxDownloadRetries && (err.message?.includes('moov atom') || err.message?.includes('ffprobe failed') || err.message?.includes('Invalid data') || err.message?.includes('Download failed') || err.message?.includes('ECONNRESET') || err.message?.includes('ENOENT'))) {
            console.warn(`[MetaAdsApi] Download/prepare failed (attempt ${attempt}/${maxDownloadRetries}): ${err.message} - retrying...`);
            if (downloadedPath) {
              try { fs.unlinkSync(downloadedPath); } catch {}
              downloadedPath = null;
            }
            await new Promise(r => setTimeout(r, 2000 * attempt));
            continue;
          }
          throw err;
        }
      }

      if (!transcodeResult) {
        throw new Error("Video preparation failed: no transcode result");
      }

      const uploadPath = transcodeResult.usedPath;
      if (transcodeResult.transcoded) {
        transcodedPath = uploadPath;
      }

      const uploadUrl = `${META_VIDEO_URL}/${adAccountFormatted}/advideos`;
      const maxRetries = 3;
      const canUseSupabaseStorage = hasSupabaseStorageConfig();
      let video_id: string | undefined;
      
      if (transcodeResult.transcoded) {
        if (!canUseSupabaseStorage) {
          throw new Error(
            "Video requires transcoding, but Supabase storage is not configured (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_STORAGE_BUCKET)",
          );
        }
        console.log('[MetaAdsApi] Video was transcoded - uploading to Supabase Storage first');
        
        const videoBuffer = fs.readFileSync(uploadPath);
        const fileSizeMB = videoBuffer.length / (1024 * 1024);
        console.log('[MetaAdsApi] Transcoded video size:', videoBuffer.length, `(${fileSizeMB.toFixed(2)} MB)`);
        
        const uniqueId = crypto.randomBytes(8).toString('hex');
        const objectName = `transcoded-videos/${uniqueId}.mp4`;
        
        const objectStorageStart = Date.now();
        await uploadBufferToSupabaseStorage({
          objectPath: objectName,
          contentType: "video/mp4",
          buffer: videoBuffer,
        });

        const signedUrl = await createSignedSupabaseDownloadUrl({
          objectPath: objectName,
          expiresInSeconds: 3600,
        });
        const objectStorageTime = ((Date.now() - objectStorageStart) / 1000).toFixed(2);
        console.log(`[MetaAdsApi] SUPABASE STORAGE UPLOAD: ${fileSizeMB.toFixed(2)}MB in ${objectStorageTime}s`);
        
        const uploadParams = new URLSearchParams({
          file_url: signedUrl,
          title: name,
          access_token: this.accessToken!,
        });
        
        const metaUploadStart = Date.now();
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          console.log(`[MetaAdsApi] file_url upload attempt ${attempt}/${maxRetries} (from Supabase Storage)...`);
          try {
            const uploadResponse = await fetch(`${uploadUrl}?${uploadParams.toString()}`, { method: 'POST' });
            const uploadData = await uploadResponse.json() as { id?: string; error?: any };
            console.log('[MetaAdsApi] file_url upload response:', JSON.stringify(uploadData, null, 2));
            
            if (uploadData.id) {
              video_id = uploadData.id;
              const metaUploadTime = ((Date.now() - metaUploadStart) / 1000).toFixed(2);
              console.log(`[MetaAdsApi] META API UPLOAD: video_id ${video_id} in ${metaUploadTime}s`);
              break;
            }
            if (uploadData.error) {
              console.error(`[MetaAdsApi] file_url upload attempt ${attempt} failed:`, uploadData.error);
              if (uploadData.error.is_transient && attempt < maxRetries) {
                await sleep(attempt * 5000);
                continue;
              }
              throw new Error(`Video upload failed: ${JSON.stringify(uploadData.error)}`);
            }
          } catch (err: any) {
            console.error(`[MetaAdsApi] file_url upload attempt ${attempt} error:`, err);
            if (attempt >= maxRetries) throw err;
            await sleep(attempt * 5000);
          }
        }
        
        if (downloadedPath) { await cleanupTempFile(downloadedPath); downloadedPath = null; }
        if (transcodedPath && transcodedPath !== downloadedPath) { await cleanupTempFile(transcodedPath); transcodedPath = null; }
      } else if (options?.localPath && canUseSupabaseStorage) {
        console.log('[MetaAdsApi] Video NOT transcoded (local path) - uploading via Supabase Storage');
        
        const videoBuffer = fs.readFileSync(uploadPath);
        const fileSizeMB = videoBuffer.length / (1024 * 1024);

        const uniqueId = crypto.randomBytes(8).toString('hex');
        const objectName = `raw-videos/${uniqueId}.mp4`;

        await uploadBufferToSupabaseStorage({
          objectPath: objectName,
          contentType: "video/mp4",
          buffer: videoBuffer,
        });
        const signedUrl = await createSignedSupabaseDownloadUrl({
          objectPath: objectName,
          expiresInSeconds: 3600,
        });
        console.log(`[MetaAdsApi] Uploaded ${fileSizeMB.toFixed(2)}MB to Supabase Storage for Meta`);
        
        if (downloadedPath) { await cleanupTempFile(downloadedPath); downloadedPath = null; }
        
        const uploadParams = new URLSearchParams({
          file_url: signedUrl,
          title: name,
          access_token: this.accessToken,
        });
        
        const metaUploadStart = Date.now();
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          console.log(`[MetaAdsApi] file_url upload attempt ${attempt}/${maxRetries} (from Supabase Storage)...`);
          const uploadResponse = await fetch(`${uploadUrl}?${uploadParams.toString()}`, { method: 'POST' });
          const uploadData = await uploadResponse.json() as { id?: string; error?: any };
          
          if (uploadData.id) {
            video_id = uploadData.id;
            const metaUploadTime = ((Date.now() - metaUploadStart) / 1000).toFixed(2);
            console.log(`[MetaAdsApi] META API UPLOAD (local→ObjStorage): video_id ${video_id} in ${metaUploadTime}s`);
            break;
          }
          if (uploadData.error) {
            console.error(`[MetaAdsApi] file_url upload attempt ${attempt} failed:`, uploadData.error);
            if (uploadData.error.is_transient && attempt < maxRetries) {
              await sleep(attempt * 5000);
              continue;
            }
            throw new Error(`Video upload failed: ${JSON.stringify(uploadData.error)}`);
          }
        }
      } else {
        if (options?.localPath && !canUseSupabaseStorage) {
          console.warn(
            "[MetaAdsApi] Local video available but Supabase storage is not configured; falling back to direct file_url upload",
          );
        }
        console.log('[MetaAdsApi] Video NOT transcoded - using file_url method');
        
        if (downloadedPath) { await cleanupTempFile(downloadedPath); downloadedPath = null; }
        
        const uploadParams = new URLSearchParams({
          file_url: videoUrlOrPath,
          title: name,
          access_token: this.accessToken,
        });
        
        const metaUploadStart = Date.now();
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          console.log(`[MetaAdsApi] file_url upload attempt ${attempt}/${maxRetries}...`);
          const uploadResponse = await fetch(`${uploadUrl}?${uploadParams.toString()}`, { method: 'POST' });
          const uploadData = await uploadResponse.json() as { id?: string; error?: any };
          console.log('[MetaAdsApi] file_url upload response:', JSON.stringify(uploadData, null, 2));
          
          if (uploadData.id) {
            video_id = uploadData.id;
            const metaUploadTime = ((Date.now() - metaUploadStart) / 1000).toFixed(2);
            console.log(`[MetaAdsApi] META API UPLOAD (direct): video_id ${video_id} in ${metaUploadTime}s`);
            break;
          }
          if (uploadData.error) {
            console.error(`[MetaAdsApi] file_url upload attempt ${attempt} failed:`, uploadData.error);
            if (uploadData.error.is_transient && attempt < maxRetries) {
              await sleep(attempt * 5000);
              continue;
            }
            throw new Error(`Video upload failed: ${JSON.stringify(uploadData.error)}`);
          }
        }
      }
      
      if (!video_id) {
        throw new Error('Video upload failed: no video_id returned');
      }

      const totalTime = ((Date.now() - uploadStartTime) / 1000).toFixed(2);
      console.log(`[MetaAdsApi] Video uploaded: ${video_id} in ${totalTime}s`);
      
      return { id: video_id, transcodeResult };
    } finally {
      // Cleanup any remaining temp files (in case of error before buffer read)
      if (downloadedPath) {
        await cleanupTempFile(downloadedPath);
      }
      if (transcodedPath && transcodedPath !== downloadedPath) {
        await cleanupTempFile(transcodedPath);
      }
    }
  }

  async uploadVideo(videoUrl: string, name: string): Promise<{ id: string; thumbnailUrl?: string; transcodeResult?: TranscodeResult }> {
    const result = await this.uploadVideoCore(videoUrl, name);
    const thumbnailUrl = await this.waitForVideoReady(result.id);
    return { id: result.id, thumbnailUrl, transcodeResult: result.transcodeResult };
  }

  async uploadVideoNoWait(videoUrl: string, name: string, options?: { localPath?: string }): Promise<{ id: string; transcodeResult?: TranscodeResult }> {
    return this.uploadVideoCore(videoUrl, name, options);
  }

  private async apiPostRequestMultipart<T>(url: string, createFormData: () => FormData): Promise<T> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt < RATE_LIMIT_CONFIG.maxRetries; attempt++) {
      if (attempt > 0) {
        const backoff = Math.min(
          RATE_LIMIT_CONFIG.baseBackoffMs * Math.pow(2, attempt),
          RATE_LIMIT_CONFIG.maxBackoffMs
        );
        console.log(`[MetaAdsApi] Retrying multipart upload in ${backoff}ms (attempt ${attempt + 1})`);
        await sleep(backoff);
      }

      const formData = createFormData();
      const headers = formData.getHeaders();
      console.log('[MetaAdsApi] Multipart upload headers:', headers);

      try {
        console.log('[MetaAdsApi] Starting fetch to:', url.substring(0, 80) + '...');
        const response = await fetch(url, {
          method: 'POST',
          body: formData as any,
          headers: headers,
        });

        console.log('[MetaAdsApi] Fetch response status:', response.status, response.statusText);
        const data = await response.json();
        console.log('[MetaAdsApi] Response data:', JSON.stringify(data).substring(0, 500));

        if (!response.ok) {
          const errorCode = data?.error?.code;
          if (RATE_LIMIT_CONFIG.rateLimitCodes.includes(errorCode)) {
            lastError = new Error(`Rate limited: ${JSON.stringify(data.error)}`);
            continue;
          }
          throw new Error(`Meta API error: ${JSON.stringify(data.error || data)}`);
        }

        return data as T;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (!lastError.message.includes('Rate limited')) {
          throw lastError;
        }
      }
    }

    throw lastError || new Error('Upload failed after max retries');
  }

  async waitForVideoReady(videoId: string, maxAttempts: number = 30): Promise<string | undefined> {
    console.log('[MetaAdsApi] Waiting for video to be ready:', videoId);
    
    // Exponential backoff: start at 2s, max 10s
    let delay = 2000;
    const maxDelay = 10000;
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await fetch(
          `${META_GRAPH_URL}/${videoId}?fields=thumbnails,status&access_token=${this.accessToken}`
        );
        const data = await response.json();
        console.log(`[MetaAdsApi] Video status check (attempt ${attempt + 1}):`, JSON.stringify(data, null, 2));
        
        const videoStatus = data.status?.video_status;
        const processingPhase = data.status?.processing_phase?.status;
        
        // Video is ready when video_status is "ready" or processing_phase is "complete"
        if (videoStatus === 'ready' || processingPhase === 'complete') {
          const thumbnailUrl = data.thumbnails?.data?.[0]?.uri;
          console.log('[MetaAdsApi] Video ready! Thumbnail:', thumbnailUrl);
          return thumbnailUrl;
        }
        
        // If video failed, throw error
        if (videoStatus === 'error' || processingPhase === 'error') {
          throw new Error(`Video processing failed: ${videoId}`);
        }
        
        // If video is still processing, wait with exponential backoff
        if (videoStatus === 'processing' || processingPhase === 'in_progress') {
          console.log(`[MetaAdsApi] Video still processing, waiting ${delay/1000}s...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          delay = Math.min(delay * 1.5, maxDelay);
        }
      } catch (error) {
        console.error('[MetaAdsApi] Error checking video status:', error);
        throw error;
      }
    }
    
    console.log('[MetaAdsApi] Video not ready after max attempts');
    throw new Error(`Video ${videoId} did not become ready after ${maxAttempts} attempts`);
  }

  async createCreative(params: {
    name: string;
    pageId: string;
    instagramAccountId?: string;
    linkUrl: string;
    displayLink?: string;
    message?: string;
    headline?: string;
    description?: string;
    callToAction?: string;
    imageHash?: string;
    imageUrl?: string;
    videoId?: string;
  }): Promise<{ id: string }> {
    if (!this.adAccountId || !this.accessToken) {
      throw new Error("No ad account selected or not authenticated");
    }

    const adAccountFormatted = this.adAccountId.startsWith('act_') 
      ? this.adAccountId 
      : `act_${this.adAccountId}`;

    const linkData: Record<string, any> = {
      link: params.linkUrl,
      message: params.message || "",
    };

    if (params.headline) {
      linkData.name = params.headline;
    }
    if (params.description) {
      linkData.description = params.description;
    }
    if (params.callToAction) {
      linkData.call_to_action = { type: params.callToAction };
    }
    if (params.displayLink) {
      linkData.display_link = params.displayLink;
    }
    if (params.imageHash) {
      linkData.image_hash = params.imageHash;
    }

    const objectStorySpec: Record<string, any> = {
      page_id: params.pageId,
    };
    
    // Add Instagram actor ID if provided
    if (params.instagramAccountId) {
      objectStorySpec.instagram_user_id = params.instagramAccountId;
    }

    if (params.videoId) {
      // For video creatives, link goes ONLY in call_to_action.value.link, NOT as standalone link field
      const videoData: Record<string, any> = {
        video_id: params.videoId,
        title: params.headline || "",
        message: params.message || "",
        link_description: params.description || "",
        // call_to_action with link is required for video ads (link NOT as standalone field)
        call_to_action: { 
          type: params.callToAction || "LEARN_MORE", 
          value: { link: params.linkUrl } 
        },
      };
      
      // Add thumbnail - required for video ads
      if (params.imageHash) {
        videoData.image_hash = params.imageHash;
      } else if (params.imageUrl) {
        videoData.image_url = params.imageUrl;
      }
      
      objectStorySpec.video_data = videoData;
    } else {
      objectStorySpec.link_data = linkData;
    }

    // Build creative_features_spec nested inside degrees_of_freedom_spec
    // standard_enhancements is deprecated and must NOT be included
    const creativeFeaturesSpec: Record<string, any> = {
      inline_comment: { enroll_status: "OPT_IN" },
      enhance_cta: { enroll_status: "OPT_OUT" },
      image_brightness_and_contrast: { enroll_status: "OPT_OUT" },
      image_animation: { enroll_status: "OPT_OUT" },
      image_touchups: { enroll_status: "OPT_OUT" },
      image_uncrop: { enroll_status: "OPT_OUT" },
      text_optimizations: { enroll_status: "OPT_OUT" },
      product_extensions: { enroll_status: "OPT_OUT" },
      site_extensions: { enroll_status: "OPT_OUT" },
      adapt_to_placement: { enroll_status: "OPT_OUT" },
      advantage_plus_creative: { enroll_status: "OPT_OUT" },
      image_background_gen: { enroll_status: "OPT_OUT" },
      image_templates: { enroll_status: "OPT_OUT" },
      text_translation: { enroll_status: "OPT_OUT" },
    };

    const degreesOfFreedomSpec = {
      creative_features_spec: creativeFeaturesSpec
    };

    const body = new URLSearchParams();
    body.append('name', params.name);
    body.append('object_story_spec', JSON.stringify(objectStorySpec));
    body.append('degrees_of_freedom_spec', JSON.stringify(degreesOfFreedomSpec));
    body.append('access_token', this.accessToken);

    console.log('[MetaAdsApi] createCreative request:', {
      name: params.name,
      pageId: params.pageId,
      linkUrl: params.linkUrl,
      hasVideoId: !!params.videoId,
      hasImageHash: !!params.imageHash,
      objectStorySpec: JSON.stringify(objectStorySpec, null, 2),
    });

    const response = await fetch(
      `${META_GRAPH_URL}/${adAccountFormatted}/adcreatives`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      }
    );

    const data = await response.json();
    console.log('[MetaAdsApi] createCreative response:', JSON.stringify(data, null, 2));

    if (data.error) {
      console.error('[MetaAdsApi] createCreative error:', data.error);
      throw new Error(data.error.message || "Failed to create creative");
    }

    return { id: data.id };
  }

  // Create "Flexible Ad Format" creative using FORMAT_AUTOMATION
  // This is the correct way to create Flexible ads (NOT Dynamic Creative)
  // Each creative gets all text variations for A/B testing, with ONE image/video
  // Multiple ads can be created in the same ad set (unlike Dynamic Creative which limits to 1)
  // Reference: asset_feed_spec with optimization_type=FORMAT_AUTOMATION + ad_formats=AUTOMATIC_FORMAT
  async createFlexibleSpecCreative(params: {
    name: string;
    pageId: string;
    instagramAccountId?: string;
    linkUrl: string;
    displayLink?: string;
    primaryTexts: string[]; // Max 5 - all will be used for A/B testing
    headlines: string[]; // Max 5 - all will be used for A/B testing
    descriptions: string[]; // Max 5 - all will be used for A/B testing
    callToAction?: string;
    imageHash?: string;
    videoId?: string;
    thumbnailUrl?: string;
  }): Promise<{ id: string }> {
    if (!this.adAccountId || !this.accessToken) {
      throw new Error("No ad account selected or not authenticated");
    }

    const adAccountFormatted = this.adAccountId.startsWith('act_') 
      ? this.adAccountId 
      : `act_${this.adAccountId}`;

    // Limit to max 5 of each (Meta's limit)
    const bodies = params.primaryTexts.slice(0, 5).map(text => ({ text: text.trim() }));
    const titles = params.headlines.slice(0, 5).map(text => ({ text: text.trim() }));
    const descriptions = params.descriptions.slice(0, 5).map(text => ({ text: text.trim() }));

    console.log('[MetaAdsApi] createFlexibleSpecCreative (FORMAT_AUTOMATION) request:', {
      name: params.name,
      pageId: params.pageId,
      instagramAccountId: params.instagramAccountId,
      linkUrl: params.linkUrl,
      bodiesCount: bodies.length,
      titlesCount: titles.length,
      descriptionsCount: descriptions.length,
      hasVideoId: !!params.videoId,
      hasImageHash: !!params.imageHash,
    });

    const makeRequest = async (includeInstagram: boolean): Promise<{ id: string }> => {
      // Determine if using FORMAT_AUTOMATION (videos only) or DEGREES_OF_FREEDOM (images)
      // Meta API only supports: COLLECTION, CAROUSEL, SINGLE_VIDEO for FORMAT_AUTOMATION
      // SINGLE_IMAGE is NOT supported for FORMAT_AUTOMATION!
      const useFormatAutomation = !!params.videoId;
      const optimizationType = useFormatAutomation ? "FORMAT_AUTOMATION" : "DEGREES_OF_FREEDOM";
      
      // Build object_story_spec - structure differs for images vs videos
      const storySpec: Record<string, any> = {
        page_id: params.pageId,
      };

      if (includeInstagram && params.instagramAccountId) {
        storySpec.instagram_user_id = params.instagramAccountId;
      }

      // For IMAGES (DEGREES_OF_FREEDOM): image_hash and call_to_action go in link_data
      // For VIDEOS (FORMAT_AUTOMATION): use video_data with thumbnail (enables true Flexible format)
      if (params.imageHash) {
        // Image: put image_hash and CTA in object_story_spec.link_data
        storySpec.link_data = {
          link: params.linkUrl,
          image_hash: params.imageHash,
          call_to_action: {
            type: params.callToAction || "LEARN_MORE"
          }
        };
        if (params.displayLink) {
          storySpec.link_data.display_link = params.displayLink;
        }
      } else if (params.videoId) {
        // Video: use video_data with thumbnail for true Flexible format (SINGLE_VIDEO + CAROUSEL)
        // Get video thumbnail
        let thumbnailUrl: string | null = null;
        try {
          thumbnailUrl = await this.getVideoThumbnail(params.videoId);
          console.log('[MetaAdsApi] Got video thumbnail:', thumbnailUrl ? 'yes' : 'no');
        } catch (e) {
          console.warn('[MetaAdsApi] Failed to get video thumbnail:', e);
        }
        
        storySpec.video_data = {
          video_id: params.videoId,
          call_to_action: {
            type: params.callToAction || "LEARN_MORE",
            value: {
              link: params.linkUrl
            }
          },
          // Use first body/title as default message/title
          message: bodies[0]?.text || "Check this out!",
          title: titles[0]?.text || "Learn More"
        };
        
        // Note: display_link is only supported for link_data (image ads), not video_data
        
        // Add thumbnail if available
        if (thumbnailUrl) {
          storySpec.video_data.image_url = thumbnailUrl;
        }
      }
      
      // Build asset_feed_spec
      const assetFeedSpec: Record<string, any> = {
        optimization_type: optimizationType,
        bodies,
        titles,
      };

      // Only add descriptions if we have them
      if (descriptions.length > 0 && descriptions[0].text) {
        assetFeedSpec.descriptions = descriptions;
      }
      
      // For FORMAT_AUTOMATION (videos): add ad_formats, link_urls, call_to_action_types, and videos
      if (useFormatAutomation) {
        assetFeedSpec.ad_formats = ["SINGLE_VIDEO", "CAROUSEL"];
        assetFeedSpec.link_urls = [{ website_url: params.linkUrl }];
        assetFeedSpec.call_to_action_types = [params.callToAction || "LEARN_MORE"];
        
        if (params.videoId) {
          // Simplified: just video_id, no thumbnail_url
          assetFeedSpec.videos = [{ video_id: params.videoId }];
        }
      }
      // For DEGREES_OF_FREEDOM (images): NO link_urls, NO call_to_action_types, NO images in asset_feed_spec
      // Image and CTA are already in object_story_spec.link_data

      // Build creative_features_spec nested inside degrees_of_freedom_spec
      // standard_enhancements is deprecated and must NOT be included
      const creativeFeaturesSpec: Record<string, any> = {
        inline_comment: { enroll_status: "OPT_IN" },
        enhance_cta: { enroll_status: "OPT_OUT" },
        image_brightness_and_contrast: { enroll_status: "OPT_OUT" },
        image_animation: { enroll_status: "OPT_OUT" },
        image_touchups: { enroll_status: "OPT_OUT" },
        image_uncrop: { enroll_status: "OPT_OUT" },
        text_optimizations: { enroll_status: "OPT_OUT" },
        product_extensions: { enroll_status: "OPT_OUT" },
        site_extensions: { enroll_status: "OPT_OUT" },
        adapt_to_placement: { enroll_status: "OPT_OUT" },
        advantage_plus_creative: { enroll_status: "OPT_OUT" },
        image_background_gen: { enroll_status: "OPT_OUT" },
        image_templates: { enroll_status: "OPT_OUT" },
        text_translation: { enroll_status: "OPT_OUT" },
      };

      const degreesOfFreedomSpec = {
        creative_features_spec: creativeFeaturesSpec
      };

      const requestBody = new URLSearchParams();
      requestBody.append('name', params.name);
      requestBody.append('object_story_spec', JSON.stringify(storySpec));
      requestBody.append('asset_feed_spec', JSON.stringify(assetFeedSpec));
      requestBody.append('degrees_of_freedom_spec', JSON.stringify(degreesOfFreedomSpec));
      requestBody.append('access_token', this.accessToken!);

      console.log('[MetaAdsApi] createFlexibleSpecCreative object_story_spec:', JSON.stringify(storySpec, null, 2));
      console.log('[MetaAdsApi] createFlexibleSpecCreative asset_feed_spec:', JSON.stringify(assetFeedSpec, null, 2));
      console.log('[MetaAdsApi] createFlexibleSpecCreative degrees_of_freedom_spec:', JSON.stringify(degreesOfFreedomSpec, null, 2));

      const response = await fetch(
        `${META_GRAPH_URL}/${adAccountFormatted}/adcreatives`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: requestBody.toString(),
        }
      );

      const data = await response.json();
      console.log('[MetaAdsApi] createFlexibleSpecCreative response:', JSON.stringify(data, null, 2));

      if (data.error) {
        throw { ...data.error, isMetaError: true };
      }

      return { id: data.id };
    };

    // Try with Instagram first, then retry without if Instagram error
    try {
      return await makeRequest(true);
    } catch (err: any) {
      if (err.isMetaError && (err.message?.includes('instagram_user_id') || err.message?.includes('instagram_actor_id') || err.message?.includes('Instagram'))) {
        console.log('[MetaAdsApi] Instagram account invalid, retrying without Instagram...');
        return await makeRequest(false);
      }
      console.error('[MetaAdsApi] createFlexibleSpecCreative error:', err);
      throw new Error(err.message || "Failed to create flexible spec creative");
    }
  }

  // Create Dynamic Creative with multiple images/videos in asset_feed_spec
  // This allows Meta to test all combinations of assets + copy variations
  async createDynamicCreative(params: {
    name: string;
    pageId: string;
    instagramAccountId?: string;
    linkUrl: string;
    primaryTexts: string[]; // Max 5
    headlines: string[]; // Max 5
    descriptions: string[]; // Max 5
    callToAction?: string;
    imageHashes?: string[]; // Max 10 images
    videoIds?: string[]; // Max 10 videos
  }): Promise<{ id: string }> {
    if (!this.adAccountId || !this.accessToken) {
      throw new Error("No ad account selected or not authenticated");
    }

    const adAccountFormatted = this.adAccountId.startsWith('act_') 
      ? this.adAccountId 
      : `act_${this.adAccountId}`;

    // Limit to max 5 of each for text (Meta's limit)
    const bodies = params.primaryTexts.slice(0, 5).map(text => ({ text: text.trim() }));
    const titles = params.headlines.slice(0, 5).map(text => ({ text: text.trim() }));
    const descriptions = params.descriptions.slice(0, 5).map(text => ({ text: text.trim() }));

    // Build asset_feed_spec with multiple assets
    const assetFeedSpec: Record<string, any> = {
      bodies,
      titles,
      descriptions: descriptions.length > 0 ? descriptions : [{ text: "" }],
      link_urls: [{ website_url: params.linkUrl }],
      call_to_action_types: [params.callToAction || "LEARN_MORE"],
    };

    // Add images (max 10)
    if (params.imageHashes && params.imageHashes.length > 0) {
      assetFeedSpec.images = params.imageHashes.slice(0, 10).map(hash => ({ hash }));
      assetFeedSpec.ad_formats = ["SINGLE_IMAGE"];
    }
    
    // Add videos (max 10) - if both images and videos, Meta will test both
    if (params.videoIds && params.videoIds.length > 0) {
      assetFeedSpec.videos = params.videoIds.slice(0, 10).map(video_id => ({ video_id }));
      // If we have videos, use SINGLE_VIDEO format (or Meta will choose based on assets)
      if (!params.imageHashes || params.imageHashes.length === 0) {
        assetFeedSpec.ad_formats = ["SINGLE_VIDEO"];
      } else {
        // Mixed media - don't specify ad_formats, let Meta handle it
        delete assetFeedSpec.ad_formats;
      }
    }

    // Build object_story_spec with page and optional Instagram
    const objectStorySpec: Record<string, any> = {
      page_id: params.pageId,
    };
    
    if (params.instagramAccountId) {
      objectStorySpec.instagram_user_id = params.instagramAccountId;
    }

    const body = new URLSearchParams();
    body.append('name', params.name);
    body.append('object_story_spec', JSON.stringify(objectStorySpec));
    body.append('asset_feed_spec', JSON.stringify(assetFeedSpec));
    body.append('access_token', this.accessToken);

    console.log('[MetaAdsApi] createDynamicCreative request:', {
      name: params.name,
      pageId: params.pageId,
      instagramAccountId: params.instagramAccountId,
      linkUrl: params.linkUrl,
      bodiesCount: bodies.length,
      titlesCount: titles.length,
      descriptionsCount: descriptions.length,
      imageCount: params.imageHashes?.length || 0,
      videoCount: params.videoIds?.length || 0,
      assetFeedSpec: JSON.stringify(assetFeedSpec, null, 2),
    });

    const makeRequest = async (includeInstagram: boolean): Promise<{ id: string }> => {
      const requestBody = new URLSearchParams();
      requestBody.append('name', params.name);
      
      const storySpec: Record<string, any> = { page_id: params.pageId };
      if (includeInstagram && params.instagramAccountId) {
        storySpec.instagram_user_id = params.instagramAccountId;
      }
      
      requestBody.append('object_story_spec', JSON.stringify(storySpec));
      requestBody.append('asset_feed_spec', JSON.stringify(assetFeedSpec));
      requestBody.append('access_token', this.accessToken!);

      // Rate limiting with retry logic
      const url = `${META_GRAPH_URL}/${adAccountFormatted}/adcreatives`;
      try {
        const data = await this.apiPostRequest<{ id: string }>(url, requestBody);
        return { id: data.id };
      } catch (err: any) {
        if (err.metaError) {
          throw { ...err.metaError, isMetaError: true };
        }
        throw err;
      }
    };

    // Try with Instagram first, then retry without if Instagram error
    try {
      return await makeRequest(true);
    } catch (err: any) {
      if (err.isMetaError && (err.message?.includes('instagram_user_id') || err.message?.includes('instagram_actor_id') || err.message?.includes('Instagram'))) {
        console.log('[MetaAdsApi] Instagram account invalid, retrying without Instagram...');
        return await makeRequest(false);
      }
      console.error('[MetaAdsApi] createDynamicCreative error:', err);
      throw new Error(err.message || "Failed to create dynamic creative");
    }
  }

  // Create flexible creative using asset_feed_spec for multiple primary texts/headlines
  async createFlexibleCreative(params: {
    name: string;
    pageId: string;
    instagramAccountId?: string;
    linkUrl: string;
    primaryTexts: string[]; // Max 5
    headlines: string[]; // Max 5
    descriptions: string[]; // Max 5
    callToAction?: string;
    imageHash?: string;
    imageUrl?: string;
    videoId?: string;
  }): Promise<{ id: string }> {
    if (!this.adAccountId || !this.accessToken) {
      throw new Error("No ad account selected or not authenticated");
    }

    const adAccountFormatted = this.adAccountId.startsWith('act_') 
      ? this.adAccountId 
      : `act_${this.adAccountId}`;

    // Limit to max 5 of each (Meta's limit)
    const bodies = params.primaryTexts.slice(0, 5).map(text => ({ text: text.trim() }));
    const titles = params.headlines.slice(0, 5).map(text => ({ text: text.trim() }));
    const descriptions = params.descriptions.slice(0, 5).map(text => ({ text: text.trim() }));

    // Build asset_feed_spec (per Meta Graph API documentation)
    // Must include exactly one ad_format
    const assetFeedSpec: Record<string, any> = {
      bodies,
      titles,
      descriptions: descriptions.length > 0 ? descriptions : [{ text: "" }],
      link_urls: [{ website_url: params.linkUrl }],
      call_to_action_types: [params.callToAction || "LEARN_MORE"],
    };

    // Add media and set ad_format - exactly one format required
    if (params.videoId) {
      assetFeedSpec.videos = [{ video_id: params.videoId }];
      assetFeedSpec.ad_formats = ["SINGLE_VIDEO"];
    } else if (params.imageHash) {
      assetFeedSpec.images = [{ hash: params.imageHash }];
      assetFeedSpec.ad_formats = ["SINGLE_IMAGE"];
    }

    console.log('[MetaAdsApi] createFlexibleCreative request:', {
      name: params.name,
      pageId: params.pageId,
      instagramAccountId: params.instagramAccountId,
      linkUrl: params.linkUrl,
      bodiesCount: bodies.length,
      titlesCount: titles.length,
      descriptionsCount: descriptions.length,
      hasVideoId: !!params.videoId,
      hasImageHash: !!params.imageHash,
      assetFeedSpec: JSON.stringify(assetFeedSpec, null, 2),
    });

    const makeRequest = async (includeInstagram: boolean): Promise<{ id: string }> => {
      const storySpec: Record<string, any> = { page_id: params.pageId };
      if (includeInstagram && params.instagramAccountId) {
        storySpec.instagram_user_id = params.instagramAccountId;
      }

      const requestBody = new URLSearchParams();
      requestBody.append('name', params.name);
      requestBody.append('object_story_spec', JSON.stringify(storySpec));
      requestBody.append('asset_feed_spec', JSON.stringify(assetFeedSpec));
      requestBody.append('access_token', this.accessToken!);

      const response = await fetch(
        `${META_GRAPH_URL}/${adAccountFormatted}/adcreatives`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: requestBody.toString(),
        }
      );

      const data = await response.json();
      console.log('[MetaAdsApi] createFlexibleCreative response:', JSON.stringify(data, null, 2));

      if (data.error) {
        throw { ...data.error, isMetaError: true };
      }

      return { id: data.id };
    };

    // Try with Instagram first, then retry without if Instagram error
    try {
      return await makeRequest(true);
    } catch (err: any) {
      if (err.isMetaError && (err.message?.includes('instagram_user_id') || err.message?.includes('instagram_actor_id') || err.message?.includes('Instagram'))) {
        console.log('[MetaAdsApi] Instagram account invalid, retrying without Instagram...');
        return await makeRequest(false);
      }
      console.error('[MetaAdsApi] createFlexibleCreative error:', err);
      throw new Error(err.message || "Failed to create flexible creative");
    }
  }

  // Create standard creative with degrees_of_freedom_spec for Format Automation
  // This allows Meta to optimize placements WITHOUT triggering Dynamic Creative
  // Key: uses object_story_spec.link_data/video_data structure (NOT asset_feed_spec)
  async createStandardCreativeWithDOF(params: {
    name: string;
    pageId: string;
    instagramAccountId?: string;
    linkUrl: string;
    message: string; // Primary text (single)
    headline: string; // Single headline
    description?: string;
    callToAction?: string;
    imageHash?: string;
    videoId?: string;
    thumbnailUrl?: string;
  }): Promise<{ id: string }> {
    if (!this.adAccountId || !this.accessToken) {
      throw new Error("No ad account selected or not authenticated");
    }

    const adAccountFormatted = this.adAccountId.startsWith('act_') 
      ? this.adAccountId 
      : `act_${this.adAccountId}`;

    // Build object_story_spec with standard link_data or video_data structure
    // This is the "classic" non-dynamic creative format
    const objectStorySpec: Record<string, any> = {
      page_id: params.pageId,
    };
    
    // Instagram handling: Use instagram_user_id (matches working Ad Set 6 format)
    // Only add if Instagram account is provided - don't use page_id as fallback
    if (params.instagramAccountId) {
      objectStorySpec.instagram_user_id = params.instagramAccountId;
    }
    // If no Instagram account, don't add instagram field (Facebook only)

    if (params.videoId) {
      // Video creative: use video_data structure
      objectStorySpec.video_data = {
        video_id: params.videoId,
        title: params.headline || "",
        message: params.message || "",
        link_description: params.description || "",
        call_to_action: { 
          type: params.callToAction || "LEARN_MORE", 
          value: { link: params.linkUrl } 
        },
      };
      
      if (params.thumbnailUrl) {
        objectStorySpec.video_data.image_url = params.thumbnailUrl;
      }
    } else {
      // Image creative: use link_data structure
      objectStorySpec.link_data = {
        link: params.linkUrl,
        message: params.message || "",
        name: params.headline || "",
        description: params.description || "",
        call_to_action: { type: params.callToAction || "LEARN_MORE" },
      };
      
      if (params.imageHash) {
        objectStorySpec.link_data.image_hash = params.imageHash;
      }
    }

    // NOTE: degrees_of_freedom_spec with standard_enhancements is DEPRECATED by Meta
    // We now create standard creatives without DOF - Meta still applies format optimization automatically
    
    const body = new URLSearchParams();
    body.append('name', params.name);
    body.append('object_story_spec', JSON.stringify(objectStorySpec));
    body.append('access_token', this.accessToken);

    console.log('[MetaAdsApi] createStandardCreativeWithDOF request:', {
      name: params.name,
      pageId: params.pageId,
      instagramAccountId: params.instagramAccountId,
      linkUrl: params.linkUrl,
      hasVideoId: !!params.videoId,
      hasImageHash: !!params.imageHash,
      objectStorySpec: JSON.stringify(objectStorySpec, null, 2),
    });

    const makeRequest = async (includeInstagram: boolean): Promise<{ id: string }> => {
      const storySpec = { ...objectStorySpec };
      if (!includeInstagram) {
        delete storySpec.instagram_user_id;
      }

      const requestBody = new URLSearchParams();
      requestBody.append('name', params.name);
      requestBody.append('object_story_spec', JSON.stringify(storySpec));
      // Note: Flexible format requires asset_feed_spec which needs special permissions
      // We create multiple single ads instead to achieve similar A/B testing
      requestBody.append('access_token', this.accessToken!);

      const response = await fetch(
        `${META_GRAPH_URL}/${adAccountFormatted}/adcreatives`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: requestBody.toString(),
        }
      );

      const data = await response.json();
      console.log('[MetaAdsApi] createStandardCreativeWithDOF response:', JSON.stringify(data, null, 2));

      if (data.error) {
        throw { ...data.error, isMetaError: true };
      }

      return { id: data.id };
    };

    // Try with Instagram first, then retry without if Instagram error
    try {
      return await makeRequest(true);
    } catch (err: any) {
      if (err.isMetaError && (err.message?.includes('instagram_user_id') || err.message?.includes('instagram_actor_id') || err.message?.includes('Instagram'))) {
        console.log('[MetaAdsApi] Instagram account invalid, retrying without Instagram...');
        return await makeRequest(false);
      }
      console.error('[MetaAdsApi] createStandardCreativeWithDOF error:', err);
      throw new Error(err.message || "Failed to create standard creative with DOF");
    }
  }

  // Create Single format creative with multiple text variations
  // HYBRID APPROACH: object_story_spec contains media (video/image) + asset_feed_spec contains ONLY text variations
  // This enables "Multiple Text Options" / "Optimize text per person" feature WITHOUT requiring asset_feed_spec permissions for media
  // Shows as "Single image or video" in Ads Manager but with text optimization enabled
  async createSingleCreativeWithTextVariations(params: {
    name: string;
    pageId: string;
    instagramAccountId?: string;
    linkUrl: string;
    displayLink?: string;
    primaryTexts: string[];
    headlines: string[];
    descriptions?: string[];
    callToAction?: string;
    imageHash?: string;
    videoId?: string;
    thumbnailUrl?: string;
    creativeEnhancements?: Record<string, boolean>;
  }): Promise<{ id: string }> {
    if (!this.adAccountId || !this.accessToken) {
      throw new Error("No ad account selected or not authenticated");
    }

    const adAccountFormatted = this.adAccountId.startsWith('act_') 
      ? this.adAccountId 
      : `act_${this.adAccountId}`;

    // ORIGINAL FORMAT: object_story_spec has media + CTA, asset_feed_spec has ONLY text variations
    // asset_feed_spec: bodies, titles, descriptions, optimization_type only (NO link_urls, NO call_to_action_types, NO images/videos)
    const assetFeedSpec: Record<string, any> = {
      bodies: params.primaryTexts.slice(0, 5).map(text => ({ text })),
      titles: params.headlines.slice(0, 5).map(text => ({ text })),
      optimization_type: "DEGREES_OF_FREEDOM",
    };

    if (params.descriptions && params.descriptions.length > 0) {
      assetFeedSpec.descriptions = params.descriptions.slice(0, 5).map(text => ({ text }));
    }


    console.log('[MetaAdsApi] createSingleCreativeWithTextVariations request:', {
      name: params.name,
      pageId: params.pageId,
      instagramAccountId: params.instagramAccountId,
      linkUrl: params.linkUrl,
      bodiesCount: assetFeedSpec.bodies.length,
      titlesCount: assetFeedSpec.titles.length,
      descriptionsCount: assetFeedSpec.descriptions?.length || 0,
      hasVideoId: !!params.videoId,
      hasImageHash: !!params.imageHash,
    });
    console.log('[MetaAdsApi] Received creativeEnhancements from UI:', JSON.stringify(params.creativeEnhancements, null, 2));

    const makeRequest = async (includeInstagram: boolean): Promise<{ id: string }> => {
      // Build object_story_spec with media + CTA + page_id + instagram
      const objectStorySpec: Record<string, any> = {
        page_id: params.pageId,
      };

      if (includeInstagram && params.instagramAccountId) {
        objectStorySpec.instagram_user_id = params.instagramAccountId;
      }

      if (params.videoId) {
        const ctaValue: Record<string, any> = { link: params.linkUrl };
        if (params.displayLink) {
          ctaValue.link_caption = params.displayLink;
        }
        objectStorySpec.video_data = {
          video_id: params.videoId,
          call_to_action: {
            type: params.callToAction || "LEARN_MORE",
            value: ctaValue
          },
        };
        if (params.thumbnailUrl) {
          objectStorySpec.video_data.image_url = params.thumbnailUrl;
        }
      } else if (params.imageHash) {
        objectStorySpec.link_data = {
          link: params.linkUrl,
          image_hash: params.imageHash,
          call_to_action: {
            type: params.callToAction || "LEARN_MORE"
          },
        };
        if (params.displayLink) {
          objectStorySpec.link_data.caption = params.displayLink;
        }
      }

      // Build creative_features_spec from user-selected enhancements
      // MUST be nested inside degrees_of_freedom_spec (not top-level) for Meta to store them
      // standard_enhancements is deprecated and must NOT be included
      // Enhancement keys map to Meta API creative_features_spec field names
      const enh = params.creativeEnhancements || {};
      const isVideo = !!params.videoId;
      const s = (key: string) => (enh[key] ?? false) ? "OPT_IN" : "OPT_OUT";
      const creativeFeaturesSpec: Record<string, any> = {};
      if (isVideo) {
        // Video creative mapping for all UI toggles:
        // Visual touch-ups -> video_auto_crop
        // Text improvements -> text_optimizations
        // Add video effects -> advantage_plus_creative
        // Show summaries -> product_extensions
        // Relevant comments -> inline_comment
        // Enhance CTA -> enhance_cta
        // Reveal details over time -> image_animation
        // Show spotlights -> site_extensions
        creativeFeaturesSpec.video_auto_crop = { enroll_status: s("visual_touch_ups") };
        creativeFeaturesSpec.text_optimizations = { enroll_status: s("text_improvements") };
        creativeFeaturesSpec.advantage_plus_creative = { enroll_status: s("add_video_effects") };
        creativeFeaturesSpec.product_extensions = { enroll_status: s("show_summaries") };
        creativeFeaturesSpec.inline_comment = { enroll_status: s("relevant_comments") };
        creativeFeaturesSpec.enhance_cta = { enroll_status: s("enhance_cta") };
        creativeFeaturesSpec.image_animation = { enroll_status: s("reveal_details") };
        creativeFeaturesSpec.site_extensions = { enroll_status: s("show_spotlights") };
      } else {
        // Image creative mapping for all UI toggles:
        // Add overlays -> image_uncrop
        // Visual touch-ups -> image_touchups
        // Add music -> music_overlay
        // Text improvements -> text_optimizations
        // Show summaries -> product_extensions
        // Relevant comments -> inline_comment
        // Enhance CTA -> enhance_cta
        // Adjust brightness and contrast -> image_brightness_and_contrast
        // Reveal details over time -> image_animation
        // Show spotlights -> site_extensions
        creativeFeaturesSpec.image_uncrop = { enroll_status: s("add_overlays") };
        creativeFeaturesSpec.image_touchups = { enroll_status: s("visual_touch_ups") };
        creativeFeaturesSpec.music_overlay = { enroll_status: s("add_music") };
        creativeFeaturesSpec.text_optimizations = { enroll_status: s("text_improvements") };
        creativeFeaturesSpec.product_extensions = { enroll_status: s("show_summaries") };
        creativeFeaturesSpec.inline_comment = { enroll_status: s("relevant_comments") };
        creativeFeaturesSpec.enhance_cta = { enroll_status: s("enhance_cta") };
        creativeFeaturesSpec.image_brightness_and_contrast = { enroll_status: s("brightness_and_contrast") };
        creativeFeaturesSpec.image_animation = { enroll_status: s("reveal_details") };
        creativeFeaturesSpec.site_extensions = { enroll_status: s("show_spotlights") };
      }

      const hasCreativeFeatures = Object.keys(creativeFeaturesSpec).length > 0;
      const degreesOfFreedomSpec = hasCreativeFeatures
        ? { creative_features_spec: creativeFeaturesSpec }
        : {};

      console.log('[MetaAdsApi] object_story_spec:', JSON.stringify(objectStorySpec, null, 2));
      console.log('[MetaAdsApi] asset_feed_spec:', JSON.stringify(assetFeedSpec, null, 2));
      if (hasCreativeFeatures) {
        console.log('[MetaAdsApi] degrees_of_freedom_spec:', JSON.stringify(degreesOfFreedomSpec, null, 2));
      } else {
        console.log('[MetaAdsApi] Skipping creative_features_spec for video creative (not supported via API)');
      }

      const requestBody = new URLSearchParams();
      requestBody.append('name', params.name);
      requestBody.append('object_story_spec', JSON.stringify(objectStorySpec));
      requestBody.append('asset_feed_spec', JSON.stringify(assetFeedSpec));
      if (hasCreativeFeatures) {
        requestBody.append('degrees_of_freedom_spec', JSON.stringify(degreesOfFreedomSpec));
      }
      requestBody.append('access_token', this.accessToken!);

      const response = await fetch(
        `${META_GRAPH_URL}/${adAccountFormatted}/adcreatives`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: requestBody.toString(),
        }
      );

      const data = await response.json();
      console.log('[MetaAdsApi] createSingleCreativeWithTextVariations response:', JSON.stringify(data, null, 2));

      if (data.error) {
        console.error('[MetaAdsApi] createSingleCreativeWithTextVariations API error:', data.error);
        throw { ...data.error, isMetaError: true };
      }

      // Read back creative from Meta to verify what was actually stored
      try {
        const verifyResponse = await fetch(
          `${META_GRAPH_URL}/${data.id}?fields=degrees_of_freedom_spec{creative_features_spec},name&access_token=${this.accessToken}`
        );
        const verifyData = await verifyResponse.json();
        console.log('[MetaAdsApi] VERIFICATION - Creative read-back from Meta:', JSON.stringify(verifyData, null, 2));
      } catch (verifyErr) {
        console.log('[MetaAdsApi] VERIFICATION failed (non-critical):', verifyErr);
      }

      return { id: data.id };
    };

    // Try with Instagram first, then retry without if Instagram error
    try {
      return await makeRequest(true);
    } catch (err: any) {
      if (err.isMetaError && (err.message?.includes('instagram_user_id') || err.message?.includes('instagram_actor_id') || err.message?.includes('Instagram'))) {
        console.log('[MetaAdsApi] Instagram account invalid, retrying without Instagram...');
        return await makeRequest(false);
      }
      console.error('[MetaAdsApi] createSingleCreativeWithTextVariations error:', err);
      throw new Error(err.error_user_msg || err.message || "Failed to create single creative with text variations");
    }
  }

  // Check if ad set is dynamic creative (required before creating ads)
  async checkAdSetDynamicStatus(adSetId: string): Promise<{ isDynamicCreative: boolean }> {
    if (!this.accessToken) {
      throw new Error("Not authenticated");
    }

    const response = await fetch(
      `${META_GRAPH_URL}/${adSetId}?fields=is_dynamic_creative&access_token=${this.accessToken}`
    );

    const data = await response.json();
    console.log('[MetaAdsApi] checkAdSetDynamicStatus response:', JSON.stringify(data, null, 2));

    if (data.error) {
      throw new Error(data.error.message || "Failed to check ad set status");
    }

    return { isDynamicCreative: data.is_dynamic_creative === true };
  }

  // Check creative's ad_handle_type after creation (post-check)
  async checkCreativeHandleType(creativeId: string): Promise<{ adHandleType: string }> {
    if (!this.accessToken) {
      throw new Error("Not authenticated");
    }

    const response = await fetch(
      `${META_GRAPH_URL}/${creativeId}?fields=id,name,ad_handle_type&access_token=${this.accessToken}`
    );

    const data = await response.json();
    console.log('[MetaAdsApi] checkCreativeHandleType response:', JSON.stringify(data, null, 2));

    if (data.error) {
      throw new Error(data.error.message || "Failed to check creative handle type");
    }

    return { adHandleType: data.ad_handle_type || "UNKNOWN" };
  }

  async createAd(params: {
    name: string;
    adSetId: string;
    creativeId: string;
    status?: string;
  }): Promise<{ id: string; name: string }> {
    if (!this.adAccountId || !this.accessToken) {
      throw new Error("No ad account selected or not authenticated");
    }

    const adAccountFormatted = this.adAccountId.startsWith('act_') 
      ? this.adAccountId 
      : `act_${this.adAccountId}`;

    const body = new URLSearchParams();
    body.append('name', params.name);
    body.append('adset_id', params.adSetId);
    body.append('creative', JSON.stringify({ creative_id: params.creativeId }));
    body.append('status', params.status || 'ACTIVE');
    // Disable multi-advertiser ads (your ad appearing with other advertisers)
    body.append('multi_advertiser_ads', 'false');
    body.append('access_token', this.accessToken);
    
    console.log('[MetaAdsApi] createAd request:', {
      name: params.name,
      adset_id: params.adSetId,
      creative_id: params.creativeId,
      status: params.status || 'ACTIVE',
      adAccount: adAccountFormatted,
    });

    // Rate limiting with retry logic
    const url = `${META_GRAPH_URL}/${adAccountFormatted}/ads`;
    const data = await this.apiPostRequest<{ id: string }>(url, body);
    
    return { id: data.id, name: params.name };
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  getAdAccountId(): string | null {
    return this.adAccountId;
  }
}

export async function createSyncLog(
  userId: string, 
  syncType: string, 
  status: string = "pending"
): Promise<string> {
  const result = await db.insert(syncLogs)
    .values({
      userId,
      syncType,
      status,
    })
    .returning({ id: syncLogs.id });
  
  return result[0].id;
}

export async function updateSyncLog(
  logId: string, 
  updates: { 
    status?: string; 
    recordsProcessed?: number; 
    errorMessage?: string;
    errorDetails?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  await db.update(syncLogs)
    .set({
      ...updates,
      completedAt: updates.status === "completed" || updates.status === "failed" 
        ? new Date() 
        : undefined,
    })
    .where(eq(syncLogs.id, logId));
}

export async function runScheduledSync(userId: string): Promise<void> {
  const logId = await createSyncLog(userId, "full", "running");
  
  try {
    const api = new MetaAdsApi(userId);
    const initialized = await api.initialize();
    
    if (!initialized) {
      await updateSyncLog(logId, {
        status: "failed",
        errorMessage: "Failed to initialize Meta API - not connected or token expired"
      });
      return;
    }

    const result = await api.fullSync();
    const totalSynced = result.campaigns + result.adsets + result.ads;

    await updateSyncLog(logId, {
      status: result.errors.length > 0 ? "completed" : "completed",
      recordsProcessed: totalSynced,
      errorMessage: result.errors.length > 0 ? `${result.errors.length} errors occurred` : undefined,
      errorDetails: result.errors.length > 0 ? { errors: result.errors } : undefined,
      metadata: {
        campaigns: result.campaigns,
        adsets: result.adsets,
        ads: result.ads
      }
    });

    console.log(`[MetaSync] Synced for user ${userId}: ${result.campaigns} campaigns, ${result.adsets} adsets, ${result.ads} ads`);
    if (result.errors.length > 0) {
      console.warn(`[MetaSync] Errors:`, result.errors);
    }
  } catch (err: any) {
    console.error(`[MetaSync] Fatal error for user ${userId}:`, err);
    await updateSyncLog(logId, {
      status: "failed",
      errorMessage: err.message,
      errorDetails: { stack: err.stack }
    });
  }
}

// Periodic sync scheduler - runs every 4 hours to avoid Meta rate limits
let syncInterval: NodeJS.Timeout | null = null;

export function startPeriodicSync(intervalMs: number = 4 * 60 * 60 * 1000): void {
  if (syncInterval) {
    clearInterval(syncInterval);
  }

  console.log(`[MetaSync] Starting periodic sync every ${intervalMs / 1000 / 60} minutes`);

  syncInterval = setInterval(async () => {
    console.log("[MetaSync] Running scheduled sync...");
    
    // Get all connected Meta users
    const connections = await db.select()
      .from(oauthConnections)
      .where(and(
        eq(oauthConnections.provider, "meta"),
        eq(oauthConnections.status, "connected")
      ));

    for (const connection of connections) {
      if (connection.userId) {
        await runScheduledSync(connection.userId);
      }
    }
  }, intervalMs);
}

export function stopPeriodicSync(): void {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
    console.log("[MetaSync] Stopped periodic sync");
  }
}
