import { Router, Request, Response } from "express";
import "express-session";
import crypto from "crypto";

declare module "express-session" {
  interface SessionData {
    userId?: string;
    metaOauthState?: string;
    googleOauthState?: string;
  }
}
import { db } from "./db";
import { storage } from "./storage";
import { getClearSessionCookieOptions } from "./session-config";
import { 
  oauthConnections, 
  metaAssets, 
  googleDriveLinks, 
  oauthStates,
  metaObjects,
  extractedAds,
  uploadedAssets,
  docxUploads,
  bulkUploadJobs,
  adAccountSettings,
  globalSettings,
  connections,
  users,
  adsets
} from "@shared/schema";
import { inArray } from "drizzle-orm";
import { eq, and, lt, or, sql } from "drizzle-orm";

const router = Router();

const TOKEN_ENC_KEY = process.env.TOKEN_ENC_KEY || process.env.SESSION_SECRET;

if (!TOKEN_ENC_KEY) {
  console.warn("WARNING: TOKEN_ENC_KEY or SESSION_SECRET not set. Token encryption will fail.");
}

function encrypt(text: string): string {
  if (!TOKEN_ENC_KEY) throw new Error("Encryption key not configured");
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(TOKEN_ENC_KEY, 'salt', 32);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return iv.toString('hex') + ':' + encrypted + ':' + authTag;
}

function decrypt(encryptedText: string): string {
  if (!TOKEN_ENC_KEY) throw new Error("Encryption key not configured");
  try {
    const parts = encryptedText.split(':');
    if (parts.length === 3) {
      const [ivHex, encrypted, authTagHex] = parts;
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');
      const key = crypto.scryptSync(TOKEN_ENC_KEY, 'salt', 32);
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } else if (parts.length === 2) {
      const [ivHex, encrypted] = parts;
      const iv = Buffer.from(ivHex, 'hex');
      const key = crypto.scryptSync(TOKEN_ENC_KEY, 'salt', 32);
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    }
    return encryptedText;
  } catch {
    return encryptedText;
  }
}

export { encrypt, decrypt };

const META_APP_ID = process.env.META_APP_ID || "";
const META_APP_SECRET = process.env.META_APP_SECRET || "";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";

const APP_BASE_URL_RAW = process.env.APP_BASE_URL || process.env.PUBLIC_BASE_URL || "";
const APP_BASE_URL = APP_BASE_URL_RAW ? APP_BASE_URL_RAW.replace(/\/+$/, "") : "";
const ENABLE_DEV_AUTH_BYPASS = process.env.ENABLE_DEV_AUTH_BYPASS === "true";

function getBaseUrl(req: Request): string {
  const protocol = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers.host || "localhost:5000";
  return `${protocol}://${host}`;
}

function getMetaRedirectUri(req: Request): string {
  const baseUrl = APP_BASE_URL || getBaseUrl(req);
  return `${baseUrl}/auth/meta/callback`;
}

// ============ META OAUTH ============

function popupResponse(type: string, error?: string | null, redirect?: string): string {
  const msg: Record<string, string> = { type };
  if (error) msg.error = error;
  if (redirect) msg.redirect = redirect;
  return `<!DOCTYPE html><html><body><script>
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(${JSON.stringify(msg)}, window.location.origin);
    }
    window.close();
  </script><p>Login complete. You can close this window.</p></body></html>`;
}

const META_API_VERSION = process.env.META_API_VERSION || "v20.0";

router.get("/meta/start", async (req: Request, res: Response) => {
  try {
    const state = crypto.randomBytes(32).toString('hex');
    // For Meta login, we don't have a userId yet - we'll get it from the callback
    // Store a placeholder that will be replaced with the real Meta user ID after login
    const pendingUserId = "pending_" + crypto.randomBytes(16).toString('hex');
    
    const isPopup = req.query.popup === "1";
    
    // Store state in DATABASE instead of session (fixes cross-domain issue)
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    await db.insert(oauthStates).values({
      state: isPopup ? `popup:${state}` : state,
      provider: "meta",
      userId: pendingUserId,
      expiresAt,
    });
    
    // Clean up expired states
    await db.delete(oauthStates).where(lt(oauthStates.expiresAt, new Date()));
    
    // Use dynamic redirect URI based on current domain
    const redirectUri = getMetaRedirectUri(req);
    
    // Build scope from FIXED ARRAY - never copy from text/UI
    // Required scopes for Meta Ads with Instagram placement:
    // - public_profile: Always needed
    // - pages_show_list: For page selection
    // - pages_read_engagement: For promote_pages API
    // - pages_manage_metadata: For accessing page_backed_instagram_accounts (critical for Instagram)
    // - instagram_basic: For reading connected Instagram accounts
    // - ads_management, ads_read: For creating and reading ads
    const scopeArray = ["public_profile", "pages_show_list", "pages_read_engagement", "pages_manage_metadata", "instagram_basic", "ads_management", "ads_read"];
    const scopeRaw = scopeArray.join(",");
    
    console.log("=== META OAUTH START ===");
    console.log("State saved to DB:", state.substring(0, 16) + "...");
    console.log("pendingUserId:", pendingUserId);
    console.log("redirect_uri:", redirectUri);
    console.log("scope:", scopeRaw);
    
    // Build OAuth URL
    const oauthUrl = new URL(`https://www.facebook.com/${META_API_VERSION}/dialog/oauth`);
    oauthUrl.searchParams.set("client_id", META_APP_ID);
    oauthUrl.searchParams.set("redirect_uri", redirectUri);
    oauthUrl.searchParams.set("state", state);
    oauthUrl.searchParams.set("scope", scopeRaw);
    oauthUrl.searchParams.set("response_type", "code");
    
    console.log("Redirecting to:", oauthUrl.toString());
    console.log("========================");
    
    res.redirect(oauthUrl.toString());
  } catch (err) {
    console.error("Meta OAuth start error:", err);
    res.redirect("/connections?meta=error&message=Failed+to+start+OAuth");
  }
});

router.get("/meta/callback", async (req: Request, res: Response) => {
  const { code, state, error, error_description } = req.query;
  let isPopup = false;
  
  console.log("=== META OAUTH CALLBACK ===");
  console.log("Received state:", state ? String(state).substring(0, 16) + "..." : "none");
  console.log("Has code:", !!code);
  console.log("Error:", error || "none");
  
  if (error) {
    console.error("Meta OAuth error:", error, error_description);
    if (error === "access_denied") {
      return res.redirect("/");
    }
    return res.redirect(`/connections?meta=error&message=${encodeURIComponent(String(error_description || error))}`);
  }
  
  if (!state) {
    console.error("No state parameter received");
    return res.redirect("/connections?meta=error&message=No+state+received");
  }
  
  // Verify state from DATABASE instead of session
  const stateStr = String(state);
  const savedStates = await db.select()
    .from(oauthStates)
    .where(and(
      eq(oauthStates.provider, "meta"),
      or(
        eq(oauthStates.state, stateStr),
        eq(oauthStates.state, `popup:${stateStr}`)
      )
    ))
    .limit(1);
  
  const savedState = savedStates[0];
  
  if (!savedState) {
    console.error("State not found in database:", stateStr.substring(0, 16));
    return res.redirect("/connections?meta=error&message=Invalid+or+expired+state");
  }
  
  isPopup = savedState.state.startsWith("popup:");
  
  // Check if state is expired
  if (new Date() > savedState.expiresAt) {
    console.error("State expired:", savedState.state.substring(0, 16));
    await db.delete(oauthStates).where(eq(oauthStates.id, savedState.id));
    return res.redirect("/connections?meta=error&message=State+expired");
  }
  
  // Delete used state
  await db.delete(oauthStates).where(eq(oauthStates.id, savedState.id));
  
  // State verified - userId will be set from Meta user data in the callback
  console.log("State verified, proceeding with OAuth flow");
  
  if (!code) {
    return res.redirect("/connections?meta=error&message=No+code+received");
  }
  
  try {
    const redirectUri = getMetaRedirectUri(req);
    
    const tokenUrl = new URL(`https://graph.facebook.com/${META_API_VERSION}/oauth/access_token`);
    tokenUrl.searchParams.set("client_id", META_APP_ID);
    tokenUrl.searchParams.set("client_secret", META_APP_SECRET);
    tokenUrl.searchParams.set("redirect_uri", redirectUri);
    tokenUrl.searchParams.set("code", String(code));
    
    const tokenResponse = await fetch(tokenUrl.toString());
    const tokenData = await tokenResponse.json();
    
    if (tokenData.error) {
      console.error("Meta token error:", tokenData.error);
      return res.redirect(`/connections?meta=error&message=${encodeURIComponent(tokenData.error.message)}`);
    }
    
    const accessToken = tokenData.access_token;
    const expiresIn = tokenData.expires_in;
    
    // Exchange short-lived token for long-lived token (60 days)
    console.log("Exchanging short-lived token for long-lived token (60 days)...");
    const longLivedUrl = new URL(`https://graph.facebook.com/${META_API_VERSION}/oauth/access_token`);
    longLivedUrl.searchParams.set("grant_type", "fb_exchange_token");
    longLivedUrl.searchParams.set("client_id", META_APP_ID);
    longLivedUrl.searchParams.set("client_secret", META_APP_SECRET);
    longLivedUrl.searchParams.set("fb_exchange_token", accessToken);
    
    const longLivedResponse = await fetch(longLivedUrl.toString());
    const longLivedData = await longLivedResponse.json();
    
    let finalToken = accessToken;
    let finalExpires = expiresIn;
    
    if (longLivedData.error) {
      console.error("Long-lived token exchange failed:", longLivedData.error);
      console.log("Using short-lived token instead (will expire in ~1-2 hours)");
    } else if (longLivedData.access_token) {
      finalToken = longLivedData.access_token;
      finalExpires = longLivedData.expires_in;
      const expiresInDays = Math.round((finalExpires || 0) / 86400);
      console.log(`Long-lived token obtained successfully! Expires in ${expiresInDays} days (${finalExpires} seconds)`);
    } else {
      console.warn("Long-lived token response missing access_token, using short-lived token");
    }
    
    // Note: email removed from fields since we don't request email scope anymore
    const meResponse = await fetch(`https://graph.facebook.com/${META_API_VERSION}/me?fields=id,name,picture.type(large)&access_token=${finalToken}`);
    const meData = await meResponse.json();
    
    if (meData.error) {
      console.error("Meta /me error:", meData.error);
      return res.redirect(`/connections?meta=error&message=${encodeURIComponent(meData.error.message || "Failed to fetch user info")}`);
    }
    
    console.log("Fetching ad accounts...");
    const adAccountsResponse = await fetch(
      `https://graph.facebook.com/${META_API_VERSION}/me/adaccounts?fields=id,name,account_status&access_token=${finalToken}`
    );
    const adAccountsData = await adAccountsResponse.json();
    console.log("Ad accounts fetched:", adAccountsData.data?.length || 0, "accounts");
    
    if (adAccountsData.error) {
      console.error("Meta /adaccounts error:", adAccountsData.error);
      return res.redirect(`/connections?meta=error&message=${encodeURIComponent(adAccountsData.error.message || "Failed to fetch ad accounts")}`);
    }
    
    const pagesResponse = await fetch(
      `https://graph.facebook.com/${META_API_VERSION}/me/accounts?fields=id,name,access_token&access_token=${finalToken}`
    );
    const pagesData = await pagesResponse.json();
    
    if (pagesData.error) {
      console.error("Meta /accounts error:", pagesData.error);
      return res.redirect(`/connections?meta=error&message=${encodeURIComponent(pagesData.error.message || "Failed to fetch pages")}`);
    }
    
    // For each Page, fetch connected Instagram accounts using the Page Access Token
    // This way we have the IG IDs stored and don't need to re-fetch during launch
    if (pagesData.data) {
      for (const page of pagesData.data) {
        if (!page.access_token) continue;
        try {
          // Try connected instagram_accounts first
          const igResp = await fetch(
            `https://graph.facebook.com/${META_API_VERSION}/${page.id}/instagram_accounts?fields=id,username&access_token=${page.access_token}`
          );
          const igData = await igResp.json();
          if (igData.data && igData.data.length > 0) {
            page.instagram_accounts = igData.data;
            console.log(`Page ${page.name} (${page.id}): found ${igData.data.length} Instagram account(s): ${igData.data.map((a: any) => `${a.id} (@${a.username || '?'})`).join(', ')}`);
          } else {
            // Try page_backed_instagram_accounts
            const igBackedResp = await fetch(
              `https://graph.facebook.com/${META_API_VERSION}/${page.id}/page_backed_instagram_accounts?fields=id,username&access_token=${page.access_token}`
            );
            const igBackedData = await igBackedResp.json();
            if (igBackedData.data && igBackedData.data.length > 0) {
              page.instagram_accounts = igBackedData.data;
              page.instagram_is_page_backed = true;
              console.log(`Page ${page.name} (${page.id}): found page-backed IG: ${igBackedData.data[0].id}`);
            } else {
              page.instagram_accounts = [];
              console.log(`Page ${page.name} (${page.id}): no Instagram accounts found`);
            }
          }
        } catch (err) {
          console.log(`Failed to fetch Instagram for page ${page.id}:`, err);
          page.instagram_accounts = [];
        }
      }
    }
    
    // Note: /me/businesses requires business_management scope which we removed
    // Skip business fetching - we don't need it for basic ad creation
    const businesses: Array<{id: string, name: string}> = [];
    const businessOwnedPages: Array<{business_id: string, pages: Array<{id: string, name: string}>}> = [];
    
    // Use Meta user ID as the userId for this user
    const userId = meData.id;
    
    // Save userId to session - this is the login!
    (req.session as any).userId = userId;
    (req.session as any).userName = meData.name;
    (req.session as any).userEmail = meData.email || null; // May be null without email scope
    (req.session as any).userPicture = meData.picture?.data?.url || null;
    
    const tokenExpiresAt = finalExpires ? new Date(Date.now() + finalExpires * 1000) : null;
    
    const existingConnection = await db.select()
      .from(oauthConnections)
      .where(and(
        eq(oauthConnections.userId, userId),
        eq(oauthConnections.provider, "meta")
      ))
      .limit(1);
    
    // Match the scopes requested in /meta/start - includes Instagram access
    const scopes = ["public_profile", "pages_show_list", "pages_read_engagement", "pages_manage_metadata", "instagram_basic", "ads_management", "ads_read"];
    
    if (existingConnection.length > 0) {
      await db.update(oauthConnections)
        .set({
          status: "connected",
          accessToken: encrypt(finalToken),
          tokenExpiresAt,
          accountName: meData.name,
          accountEmail: meData.email || null,
          metaUserId: meData.id,
          scopes,
          connectedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(oauthConnections.id, existingConnection[0].id));
    } else {
      await db.insert(oauthConnections).values({
        userId,
        provider: "meta",
        status: "connected",
        accessToken: encrypt(finalToken),
        tokenExpiresAt,
        accountName: meData.name,
        accountEmail: meData.email || null,
        metaUserId: meData.id,
        scopes,
        connectedAt: new Date(),
      });
    }
    
    const existingAssets = await db.select()
      .from(metaAssets)
      .where(eq(metaAssets.userId, userId))
      .limit(1);
    
    const adAccounts = adAccountsData.data || [];
    const pages = pagesData.data || [];
    
    // Always require ad account selection on each OAuth flow
    console.log("Existing assets:", existingAssets.length > 0 ? "yes" : "no");
    console.log("Requiring ad account selection for", adAccounts.length, "accounts");
    
    if (existingAssets.length > 0) {
      // Update existing record - always require ad account selection
      await db.update(metaAssets)
        .set({
          metaUserId: meData.id,
          adAccountsJson: [], // Clear existing - user must select
          pendingAdAccountsJson: adAccounts, // Store for selection
          pagesJson: pages,
          businessesJson: businesses,
          businessOwnedPagesJson: businessOwnedPages,
          selectedAdAccountId: null, // Clear until user selects
          selectedPageId: existingAssets[0].selectedPageId || pages[0]?.id || null,
          updatedAt: new Date(),
        })
        .where(eq(metaAssets.id, existingAssets[0].id));
    } else {
      console.log("New user, creating meta assets entry...");
      await db.insert(metaAssets).values({
        userId,
        metaUserId: meData.id,
        adAccountsJson: [], // Empty until user selects
        pendingAdAccountsJson: adAccounts, // Store for selection
        pagesJson: pages,
        businessesJson: businesses,
        businessOwnedPagesJson: businessOwnedPages,
        selectedAdAccountId: null,
        selectedPageId: pages[0]?.id || null,
      });
    }
    
    // Save session and redirect to ad account selection page
    console.log("Saving session and redirecting to /select-ad-account...");
    req.session.save((err) => {
      if (err) {
        console.error("Session save error:", err);
        if (isPopup) {
          return res.send(popupResponse("oauth-error", "Session save failed"));
        }
        return res.redirect("/login?error=Session+save+failed");
      }
      
      if (isPopup) {
        return res.send(popupResponse("oauth-success", null, "/select-ad-account"));
      }
      
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      res.redirect(`${baseUrl}/select-ad-account`);
    });
    
  } catch (err) {
    console.error("Meta OAuth error:", err);
    if (isPopup) {
      return res.send(popupResponse("oauth-error", "Connection failed"));
    }
    res.redirect("/login?error=Connection+failed");
  }
});

router.get("/meta/test", async (req: Request, res: Response) => {
  try {
    const userId = (req.session as any).userId;
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    
    const connection = await db.select()
      .from(oauthConnections)
      .where(and(
        eq(oauthConnections.userId, userId),
        eq(oauthConnections.provider, "meta")
      ))
      .limit(1);
    
    if (!connection.length || !connection[0].accessToken) {
      return res.json({ success: false, error: "Not connected" });
    }
    
    const accessToken = decrypt(connection[0].accessToken);
    const meResponse = await fetch(`https://graph.facebook.com/${META_API_VERSION}/me?access_token=${accessToken}`);
    const meData = await meResponse.json();
    
    if (meData.error) {
      await db.update(oauthConnections)
        .set({ status: "expired", lastTestedAt: new Date() })
        .where(eq(oauthConnections.id, connection[0].id));
      return res.json({ success: false, error: meData.error.message });
    }
    
    await db.update(oauthConnections)
      .set({ lastTestedAt: new Date() })
      .where(eq(oauthConnections.id, connection[0].id));
    
    res.json({ success: true, user: meData });
  } catch (err: any) {
    res.json({ success: false, error: err.message });
  }
});

router.post("/meta/disconnect", async (req: Request, res: Response) => {
  try {
    const userId = (req.session as any).userId;
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    
    await db.update(oauthConnections)
      .set({ 
        status: "disconnected", 
        accessToken: null, 
        refreshToken: null,
        updatedAt: new Date() 
      })
      .where(and(
        eq(oauthConnections.userId, userId),
        eq(oauthConnections.provider, "meta")
      ));
    
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post("/meta/set-defaults", async (req: Request, res: Response) => {
  try {
    const userId = (req.session as any).userId;
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    const { selected_ad_account_id, selected_page_id } = req.body;
    
    const assets = await db.select()
      .from(metaAssets)
      .where(eq(metaAssets.userId, userId))
      .limit(1);
    
    if (!assets.length) {
      return res.status(404).json({ success: false, error: "No Meta assets found" });
    }
    
    const adAccounts = assets[0].adAccountsJson || [];
    const pages = assets[0].pagesJson || [];
    
    if (selected_ad_account_id) {
      const validAdAccount = adAccounts.find((a: any) => a.id === selected_ad_account_id);
      if (!validAdAccount) {
        return res.status(400).json({ success: false, error: "Invalid ad account ID" });
      }
    }
    
    if (selected_page_id) {
      const validPage = pages.find((p: any) => p.id === selected_page_id);
      if (!validPage) {
        return res.status(400).json({ success: false, error: "Invalid page ID" });
      }
    }
    
    await db.update(metaAssets)
      .set({
        selectedAdAccountId: selected_ad_account_id || assets[0].selectedAdAccountId,
        selectedPageId: selected_page_id || assets[0].selectedPageId,
        updatedAt: new Date(),
      })
      .where(eq(metaAssets.id, assets[0].id));
    
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============ GOOGLE OAUTH ============

router.get("/google/start", (req: Request, res: Response) => {
  const userId = (req.session as any)?.userId;
  if (!userId) {
    return res.redirect("/login?error=Please+login+first");
  }
  
  const state = crypto.randomBytes(32).toString('hex');
  (req.session as any).googleOauthState = state;
  
  const baseUrl = APP_BASE_URL || getBaseUrl(req);
  const redirectUri = `${baseUrl}/auth/google/callback`;
  
  const scopes = [
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile"
  ].join(" ");
  
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", GOOGLE_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", scopes);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  
  res.redirect(authUrl.toString());
});

router.get("/google/callback", async (req: Request, res: Response) => {
  const { code, state, error } = req.query;
  
  if (error) {
    console.error("Google OAuth error:", error);
    return res.redirect(`/connections?google=error&message=${encodeURIComponent(String(error))}`);
  }
  
  const savedState = (req.session as any).googleOauthState;
  if (!state || state !== savedState) {
    console.error("Google OAuth state mismatch");
    return res.redirect("/connections?google=error&message=Invalid+state");
  }
  
  delete (req.session as any).googleOauthState;
  
  if (!code) {
    return res.redirect("/connections?google=error&message=No+code+received");
  }
  
  try {
    const baseUrl = APP_BASE_URL || getBaseUrl(req);
    const redirectUri = `${baseUrl}/auth/google/callback`;
    
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: String(code),
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    
    const tokenData = await tokenResponse.json();
    
    if (tokenData.error) {
      console.error("Google token error:", tokenData.error);
      return res.redirect(`/connections?google=error&message=${encodeURIComponent(tokenData.error_description || tokenData.error)}`);
    }
    
    const { access_token, refresh_token, expires_in } = tokenData;
    
    const userInfoResponse = await fetch(
      `https://www.googleapis.com/oauth2/v2/userinfo?access_token=${access_token}`
    );
    const userInfo = await userInfoResponse.json();
    
    const userId = (req.session as any).userId;
    if (!userId) {
      console.error("Google OAuth callback: User not authenticated");
      return res.redirect("/login?error=Not+authenticated");
    }
    const tokenExpiresAt = expires_in ? new Date(Date.now() + expires_in * 1000) : null;
    
    const existingConnection = await db.select()
      .from(oauthConnections)
      .where(and(
        eq(oauthConnections.userId, userId),
        eq(oauthConnections.provider, "google")
      ))
      .limit(1);
    
    if (existingConnection.length > 0) {
      await db.update(oauthConnections)
        .set({
          status: "connected",
          accessToken: encrypt(access_token),
          refreshToken: refresh_token ? encrypt(refresh_token) : existingConnection[0].refreshToken,
          tokenExpiresAt,
          accountName: userInfo.name,
          accountEmail: userInfo.email,
          scopes: ["drive.readonly"],
          connectedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(oauthConnections.id, existingConnection[0].id));
    } else {
      await db.insert(oauthConnections).values({
        userId,
        provider: "google",
        status: "connected",
        accessToken: encrypt(access_token),
        refreshToken: refresh_token ? encrypt(refresh_token) : null,
        tokenExpiresAt,
        accountName: userInfo.name,
        accountEmail: userInfo.email,
        scopes: ["drive.readonly"],
        connectedAt: new Date(),
      });
    }
    
    const existingDriveLink = await db.select()
      .from(googleDriveLinks)
      .where(eq(googleDriveLinks.userId, userId))
      .limit(1);
    
    if (!existingDriveLink.length) {
      await db.insert(googleDriveLinks).values({ userId });
    }
    
    await storage.upsertConnection({
      provider: "google_drive",
      status: "connected",
      accountName: userInfo.name || "Google Drive",
      accountEmail: userInfo.email || "",
      scopes: ["drive.readonly"],
      connectedAt: new Date(),
    });
    
    res.redirect("/settings?google=connected");
    
  } catch (err) {
    console.error("Google OAuth error:", err);
    res.redirect("/settings?google=error&message=Connection+failed");
  }
});

router.get("/google/test", async (req: Request, res: Response) => {
  try {
    const userId = (req.session as any).userId;
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    
    const connection = await db.select()
      .from(oauthConnections)
      .where(and(
        eq(oauthConnections.userId, userId),
        eq(oauthConnections.provider, "google")
      ))
      .limit(1);
    
    if (!connection.length || !connection[0].accessToken) {
      return res.json({ success: false, error: "Not connected" });
    }
    
    const accessToken = decrypt(connection[0].accessToken);
    const aboutResponse = await fetch(
      `https://www.googleapis.com/drive/v3/about?fields=user&access_token=${accessToken}`
    );
    const aboutData = await aboutResponse.json();
    
    if (aboutData.error) {
      if (aboutData.error.code === 401 && connection[0].refreshToken) {
        return res.json({ success: false, error: "Token expired", needsRefresh: true });
      }
      await db.update(oauthConnections)
        .set({ status: "expired", lastTestedAt: new Date() })
        .where(eq(oauthConnections.id, connection[0].id));
      return res.json({ success: false, error: aboutData.error.message });
    }
    
    await db.update(oauthConnections)
      .set({ lastTestedAt: new Date() })
      .where(eq(oauthConnections.id, connection[0].id));
    
    res.json({ success: true, user: aboutData.user });
  } catch (err: any) {
    res.json({ success: false, error: err.message });
  }
});

router.post("/google/disconnect", async (req: Request, res: Response) => {
  try {
    const userId = (req.session as any).userId;
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    
    await db.update(oauthConnections)
      .set({ 
        status: "disconnected", 
        accessToken: null, 
        refreshToken: null,
        updatedAt: new Date() 
      })
      .where(and(
        eq(oauthConnections.userId, userId),
        eq(oauthConnections.provider, "google")
      ));
    
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============ CONNECTION STATUS ============

router.get("/status", async (req: Request, res: Response) => {
  try {
    const userId = (req.session as any).userId;
    if (!userId) {
      return res.json({
        meta: { status: "disconnected" },
        google: { status: "disconnected" },
      });
    }
    
    const connections = await db.select()
      .from(oauthConnections)
      .where(eq(oauthConnections.userId, userId));
    
    const assets = await db.select()
      .from(metaAssets)
      .where(eq(metaAssets.userId, userId))
      .limit(1);
    
    const metaConnection = connections.find(c => c.provider === "meta");
    const googleConnection = connections.find(c => c.provider === "google");
    
    res.json({
      meta: metaConnection ? {
        status: metaConnection.status,
        accountName: metaConnection.accountName,
        accountEmail: metaConnection.accountEmail,
        connectedAt: metaConnection.connectedAt,
        lastTestedAt: metaConnection.lastTestedAt,
        adAccounts: assets[0]?.adAccountsJson || [],
        pages: assets[0]?.pagesJson || [],
        selectedAdAccountId: assets[0]?.selectedAdAccountId,
        selectedPageId: assets[0]?.selectedPageId,
      } : { status: "disconnected" },
      google: googleConnection ? {
        status: googleConnection.status,
        accountName: googleConnection.accountName,
        accountEmail: googleConnection.accountEmail,
        connectedAt: googleConnection.connectedAt,
        lastTestedAt: googleConnection.lastTestedAt,
      } : { status: "disconnected" },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/meta/assets", async (req: Request, res: Response) => {
  try {
    const userId = (req.session as any).userId;
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    const { selectedAdAccountId, selectedPageId } = req.body;
    
    await db.update(metaAssets)
      .set({
        selectedAdAccountId,
        selectedPageId,
        updatedAt: new Date(),
      })
      .where(eq(metaAssets.userId, userId));
    
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============ USER SESSION ============

// Verify login token and establish session (for dev environment OAuth flow)
router.post("/verify-login-token", async (req: Request, res: Response) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ success: false, error: "Token required" });
    }
    
    console.log("Verifying login token...");
    
    // Look up the token in the database
    const tokenRecord = await db.select()
      .from(oauthStates)
      .where(eq(oauthStates.state, `login_token_${token}`))
      .limit(1);
    
    if (tokenRecord.length === 0) {
      console.log("Login token not found");
      return res.status(401).json({ success: false, error: "Invalid or expired token" });
    }
    
    const record = tokenRecord[0];
    
    // Check if token has expired
    if (record.expiresAt && new Date() > record.expiresAt) {
      console.log("Login token expired");
      await db.delete(oauthStates).where(eq(oauthStates.id, record.id));
      return res.status(401).json({ success: false, error: "Token expired" });
    }
    
    const userId = record.userId;
    console.log("Login token valid for userId:", userId);
    
    if (!userId) {
      console.log("Login token has no userId");
      return res.status(401).json({ success: false, error: "Invalid token" });
    }
    
    // Delete the token (one-time use)
    await db.delete(oauthStates).where(eq(oauthStates.id, record.id));
    
    // Get user info from the connection
    const connection = await db.select()
      .from(oauthConnections)
      .where(and(
        eq(oauthConnections.userId, userId),
        eq(oauthConnections.provider, "meta")
      ))
      .limit(1);
    
    if (connection.length === 0) {
      return res.status(401).json({ success: false, error: "User not found" });
    }
    
    // Set up the session
    (req.session as any).userId = userId;
    (req.session as any).userName = connection[0].accountName;
    (req.session as any).userEmail = connection[0].accountEmail;
    (req.session as any).userPicture = null;
    
    req.session.save((err) => {
      if (err) {
        console.error("Session save error:", err);
        return res.status(500).json({ success: false, error: "Session save failed" });
      }
      console.log("Session established via token for userId:", userId);
      res.json({ 
        success: true, 
        user: {
          id: userId,
          name: connection[0].accountName,
          email: connection[0].accountEmail,
        }
      });
    });
  } catch (err: any) {
    console.error("Token verification error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get current user
router.get("/me", async (req: Request, res: Response) => {
  let userId = (req.session as any).userId;
  let userName = (req.session as any).userName;
  let userEmail = (req.session as any).userEmail;
  let userPicture = (req.session as any).userPicture;
  
  const host = req.get("host") || "";
  const isLocalHost = host.includes("localhost") || host.startsWith("127.0.0.1");
  const allowDevBypass = ENABLE_DEV_AUTH_BYPASS && isLocalHost;
  
  console.log("/auth/me called, session userId:", userId || "none", "sessionID:", req.sessionID?.substring(0, 8) + "...", "host:", host);
  
  // Optional local-only bypass for development troubleshooting
  if (!userId && allowDevBypass) {
    console.log("Local dev auth bypass enabled, attempting auto-login...");
    // Find the most recent Meta connection
    const connection = await db.select()
      .from(oauthConnections)
      .where(eq(oauthConnections.provider, "meta"))
      .orderBy(sql`${oauthConnections.connectedAt} DESC`)
      .limit(1);
    
    if (connection.length > 0) {
      userId = connection[0].userId;
      userName = connection[0].accountName;
      userEmail = connection[0].accountEmail;
      
      (req.session as any).userId = userId;
      (req.session as any).userName = userName;
      (req.session as any).userEmail = userEmail;
      
      console.log("Local dev auth bypass successful for userId:", userId);

      return req.session.save((err) => {
        if (err) console.error("Session save error:", err);
        res.json({
          authenticated: true,
          user: { id: userId, name: userName, email: userEmail, picture: userPicture }
        });
      });
    }
  }
  
  if (!userId) {
    return res.json({ authenticated: false });
  }
  
  res.json({
    authenticated: true,
    user: {
      id: userId,
      name: userName,
      email: userEmail,
      picture: userPicture,
    }
  });
});

// Logout
router.post("/logout", (req: Request, res: Response) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Logout error:", err);
      return res.status(500).json({ error: "Logout failed" });
    }
    res.clearCookie("connect.sid", getClearSessionCookieOptions());
    res.json({ success: true });
  });
});

// Logout via GET (for redirect)
router.get("/logout", (req: Request, res: Response) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Logout error:", err);
    }
    res.clearCookie("connect.sid", getClearSessionCookieOptions());
    res.redirect("/");
  });
});

// Delete all user data
router.delete("/delete-my-data", async (req: Request, res: Response) => {
  const userId = (req.session as any).userId;
  
  if (!userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  
  try {
    // First, get all job IDs for this user
    const userJobs = await db.select({ id: bulkUploadJobs.id })
      .from(bulkUploadJobs)
      .where(eq(bulkUploadJobs.userId, userId));
    
    const jobIds = userJobs.map(j => j.id);
    
    if (jobIds.length > 0) {
      // Delete job-related data (these tables have jobId, not userId)
      await db.delete(metaObjects).where(inArray(metaObjects.jobId, jobIds));
      await db.delete(extractedAds).where(inArray(extractedAds.jobId, jobIds));
      await db.delete(uploadedAssets).where(inArray(uploadedAssets.jobId, jobIds));
      await db.delete(docxUploads).where(inArray(docxUploads.jobId, jobIds));
      await db.delete(adsets).where(inArray(adsets.jobId, jobIds));
    }
    
    // Delete bulk upload jobs
    await db.delete(bulkUploadJobs).where(eq(bulkUploadJobs.userId, userId));
    
    // Delete user-specific data
    await db.delete(adAccountSettings).where(eq(adAccountSettings.userId, userId));
    await db.delete(globalSettings).where(eq(globalSettings.userId, userId));
    await db.delete(metaAssets).where(eq(metaAssets.userId, userId));
    await db.delete(googleDriveLinks).where(eq(googleDriveLinks.userId, userId));
    await db.delete(oauthConnections).where(eq(oauthConnections.userId, userId));
    await db.delete(connections).where(eq(connections.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
    
    // Destroy session
    req.session.destroy((err) => {
      if (err) {
        console.error("Session destroy error after data deletion:", err);
      }
    });
    
    res.json({ success: true, message: "All your data has been deleted" });
  } catch (err: any) {
    console.error("Delete user data error:", err);
    res.status(500).json({ error: "Failed to delete data", details: err.message });
  }
});

export default router;
