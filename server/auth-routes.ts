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
import { db } from "./db.js";
import { storage } from "./storage.js";
import { getClearSessionCookieOptions } from "./session-config.js";
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
} from "../shared/schema.js";
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

const DEFAULT_APP_BASE_URL = "https://auto-ads.vercel.app";
const APP_BASE_URL_RAW = process.env.APP_BASE_URL || DEFAULT_APP_BASE_URL;
const APP_BASE_URL = APP_BASE_URL_RAW.replace(/\/+$/, "");
const ENABLE_DEV_AUTH_BYPASS = process.env.ENABLE_DEV_AUTH_BYPASS === "true";

function getMetaRedirectUri(): string {
  return `${APP_BASE_URL}/auth/meta/callback`;
}

// ============ META OAUTH ============

function popupResponse(type: string, error?: string | null, redirect?: string, traceId?: string): string {
  const msg: Record<string, string> = { type };
  if (error) msg.error = error;
  if (redirect) msg.redirect = redirect;
  if (traceId) msg.traceId = traceId;
  const redirectPath = redirect || null;
  return `<!DOCTYPE html><html><body><script>
    (() => {
      const msg = ${JSON.stringify(msg)};
      const canonicalOrigin = window.location.origin;
      const redirectPath = ${JSON.stringify(redirectPath)};
      const redirectUrl = redirectPath ? canonicalOrigin + redirectPath : null;

      if (window.opener && !window.opener.closed) {
        try { window.opener.postMessage(msg, canonicalOrigin); } catch {}
        try { window.opener.postMessage(msg, "*"); } catch {}
        if (redirectUrl) {
          // Cross-origin-safe fallback: force opener to canonical origin.
          try { window.opener.location.href = redirectUrl; } catch {}
        }
      }
      window.close();
    })();
  </script><p>${type === "oauth-error" ? "Connection failed." : "Login complete."}${traceId ? ` Trace: ${traceId}` : ""} You can close this window.</p></body></html>`;
}

const META_API_VERSION = process.env.META_API_VERSION || "v20.0";

function createMetaTraceId(seed?: string | null): string {
  const sanitized = (seed || "").replace(/[^a-zA-Z0-9]/g, "");
  if (sanitized.length >= 8) return sanitized.substring(0, 8);
  return crypto.randomBytes(4).toString("hex");
}

function maskValue(value?: string | null, keepStart = 12): string {
  if (!value) return "none";
  if (value.length <= keepStart) return value;
  return `${value.substring(0, keepStart)}...`;
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function metaLog(traceId: string, message: string, details?: Record<string, unknown>) {
  if (details) {
    console.log(`[MetaOAuth][${traceId}] ${message}`, details);
    return;
  }
  console.log(`[MetaOAuth][${traceId}] ${message}`);
}

function metaErrorRedirect(message: string, traceId: string): string {
  return `/connections?meta=error&trace=${encodeURIComponent(traceId)}&message=${encodeURIComponent(message)}`;
}

function sendMetaOauthError(res: Response, isPopup: boolean, message: string, traceId: string) {
  const redirectPath = metaErrorRedirect(message, traceId);
  if (isPopup) {
    return res.send(popupResponse("oauth-error", message, redirectPath, traceId));
  }
  return res.redirect(redirectPath);
}

router.get("/meta/start", async (req: Request, res: Response) => {
  let traceId = createMetaTraceId();
  try {
    const state = crypto.randomBytes(32).toString('hex');
    traceId = createMetaTraceId(state);
    // For Meta login, we don't have a userId yet - we'll get it from the callback
    // Store a placeholder that will be replaced with the real Meta user ID after login
    const pendingUserId = "pending_" + crypto.randomBytes(16).toString('hex');
    
    const isPopup = req.query.popup === "1";
    metaLog(traceId, "START request received", {
      isPopup,
      host: req.get("host") || null,
      xForwardedProto: req.get("x-forwarded-proto") || null,
      origin: req.get("origin") || null,
      referer: req.get("referer") || null,
      appBaseUrl: APP_BASE_URL,
      apiVersion: META_API_VERSION,
    });
    const requestHost = (req.get("host") || "").toLowerCase();
    const appHost = new URL(APP_BASE_URL).host.toLowerCase();
    if (requestHost && requestHost !== appHost) {
      metaLog(traceId, "Host mismatch: request host differs from canonical APP_BASE_URL host", {
        requestHost,
        canonicalHost: appHost,
      });
    }
    
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
    metaLog(traceId, "State stored in oauth_states", {
      statePrefix: maskValue(state),
      popupStatePrefix: isPopup ? maskValue(`popup:${state}`) : null,
      expiresAt: expiresAt.toISOString(),
      pendingUserId,
    });
    
    // Always use canonical app domain for OAuth redirect URI
    const redirectUri = getMetaRedirectUri();
    
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
    
    // Build OAuth URL
    const oauthUrl = new URL(`https://www.facebook.com/${META_API_VERSION}/dialog/oauth`);
    oauthUrl.searchParams.set("client_id", META_APP_ID);
    oauthUrl.searchParams.set("redirect_uri", redirectUri);
    oauthUrl.searchParams.set("state", state);
    oauthUrl.searchParams.set("scope", scopeRaw);
    oauthUrl.searchParams.set("response_type", "code");
    
    metaLog(traceId, "Redirecting to Facebook OAuth dialog", {
      redirectUri,
      scope: scopeRaw,
      hasClientId: Boolean(META_APP_ID),
      isPopup,
      reminder: "If Facebook shows redirect_uri error, verify this exact redirectUri in Valid OAuth Redirect URIs.",
    });
    
    res.redirect(oauthUrl.toString());
  } catch (err) {
    metaLog(traceId, "START failed", {
      error: getErrorMessage(err),
      stack: err instanceof Error ? err.stack || null : null,
    });
    res.redirect(metaErrorRedirect("Failed to start OAuth", traceId));
  }
});

router.get("/meta/callback", async (req: Request, res: Response) => {
  const rawCode = Array.isArray(req.query.code) ? req.query.code[0] : req.query.code;
  const rawState = Array.isArray(req.query.state) ? req.query.state[0] : req.query.state;
  const rawError = Array.isArray(req.query.error) ? req.query.error[0] : req.query.error;
  const rawErrorDescription = Array.isArray(req.query.error_description) ? req.query.error_description[0] : req.query.error_description;

  const code = rawCode ? String(rawCode) : null;
  const state = rawState ? String(rawState) : null;
  const error = rawError ? String(rawError) : null;
  const errorDescription = rawErrorDescription ? String(rawErrorDescription) : null;
  let isPopup = false;
  const traceId = createMetaTraceId(state);
  
  metaLog(traceId, "CALLBACK request received", {
    statePrefix: maskValue(state),
    hasCode: Boolean(code),
    error,
    errorDescription,
    host: req.get("host") || null,
    xForwardedProto: req.get("x-forwarded-proto") || null,
    origin: req.get("origin") || null,
    referer: req.get("referer") || null,
    userAgent: req.get("user-agent") || null,
    appBaseUrl: APP_BASE_URL,
  });
  const callbackRequestHost = (req.get("host") || "").toLowerCase();
  const callbackAppHost = new URL(APP_BASE_URL).host.toLowerCase();
  if (callbackRequestHost && callbackRequestHost !== callbackAppHost) {
    metaLog(traceId, "Host mismatch on callback", {
      callbackRequestHost,
      canonicalHost: callbackAppHost,
    });
  }

  try {
    // Best effort lookup for popup mode and state validity (also useful when callback has error params)
    let savedState: any | undefined;
    if (state) {
      const savedStates = await db.select()
        .from(oauthStates)
        .where(and(
          eq(oauthStates.provider, "meta"),
          or(
            eq(oauthStates.state, state),
            eq(oauthStates.state, `popup:${state}`)
          )
        ))
        .limit(1);

      savedState = savedStates[0];
      isPopup = !!savedState?.state?.startsWith("popup:");
      metaLog(traceId, "State lookup completed", {
        stateFound: Boolean(savedState),
        isPopup,
        stateId: savedState?.id || null,
        stateExpiresAt: savedState?.expiresAt ? new Date(savedState.expiresAt).toISOString() : null,
      });
    }

    if (error) {
      metaLog(traceId, "CALLBACK includes Meta error query params", {
        error,
        errorDescription,
      });
      if (error === "access_denied") {
        return sendMetaOauthError(res, isPopup, "Access denied by user", traceId);
      }
      return sendMetaOauthError(res, isPopup, errorDescription || error, traceId);
    }

    if (!state) {
      metaLog(traceId, "CALLBACK missing state parameter");
      return sendMetaOauthError(res, isPopup, "No state received", traceId);
    }

    if (!savedState) {
      metaLog(traceId, "CALLBACK state not found in database", {
        statePrefix: maskValue(state),
      });
      return sendMetaOauthError(res, isPopup, "Invalid or expired state", traceId);
    }

    // Check if state is expired
    if (new Date() > savedState.expiresAt) {
      metaLog(traceId, "CALLBACK state expired", {
        statePrefix: maskValue(savedState.state),
        expiresAt: new Date(savedState.expiresAt).toISOString(),
      });
      await db.delete(oauthStates).where(eq(oauthStates.id, savedState.id));
      return sendMetaOauthError(res, isPopup, "State expired", traceId);
    }

    // Delete used state
    await db.delete(oauthStates).where(eq(oauthStates.id, savedState.id));
    metaLog(traceId, "State verified and consumed", {
      stateId: savedState.id,
      statePrefix: maskValue(savedState.state),
      isPopup,
    });

    if (!code) {
      metaLog(traceId, "CALLBACK missing code parameter");
      return sendMetaOauthError(res, isPopup, "No code received", traceId);
    }

    const redirectUri = getMetaRedirectUri();
    metaLog(traceId, "Exchanging authorization code for access token", {
      redirectUri,
      codeLength: code.length,
    });
    
    const tokenUrl = new URL(`https://graph.facebook.com/${META_API_VERSION}/oauth/access_token`);
    tokenUrl.searchParams.set("client_id", META_APP_ID);
    tokenUrl.searchParams.set("client_secret", META_APP_SECRET);
    tokenUrl.searchParams.set("redirect_uri", redirectUri);
    tokenUrl.searchParams.set("code", code);
    
    const tokenResponse = await fetch(tokenUrl.toString());
    metaLog(traceId, "Short-lived token HTTP response", {
      status: tokenResponse.status,
      statusText: tokenResponse.statusText,
      ok: tokenResponse.ok,
    });
    const tokenData = await tokenResponse.json();
    
    if (tokenData.error) {
      metaLog(traceId, "Short-lived token error", {
        status: tokenResponse.status,
        metaError: tokenData.error,
      });
      return sendMetaOauthError(res, isPopup, tokenData.error.message || "Failed to exchange token", traceId);
    }
    
    const accessToken = tokenData.access_token;
    const expiresIn = tokenData.expires_in;
    metaLog(traceId, "Short-lived token obtained", { expiresIn });
    
    // Exchange short-lived token for long-lived token (60 days)
    metaLog(traceId, "Exchanging short-lived token for long-lived token");
    const longLivedUrl = new URL(`https://graph.facebook.com/${META_API_VERSION}/oauth/access_token`);
    longLivedUrl.searchParams.set("grant_type", "fb_exchange_token");
    longLivedUrl.searchParams.set("client_id", META_APP_ID);
    longLivedUrl.searchParams.set("client_secret", META_APP_SECRET);
    longLivedUrl.searchParams.set("fb_exchange_token", accessToken);
    
    const longLivedResponse = await fetch(longLivedUrl.toString());
    metaLog(traceId, "Long-lived token HTTP response", {
      status: longLivedResponse.status,
      statusText: longLivedResponse.statusText,
      ok: longLivedResponse.ok,
    });
    const longLivedData = await longLivedResponse.json();
    
    let finalToken = accessToken;
    let finalExpires = expiresIn;
    
    if (longLivedData.error) {
      metaLog(traceId, "Long-lived token exchange failed; continuing with short-lived token", {
        metaError: longLivedData.error,
      });
    } else if (longLivedData.access_token) {
      finalToken = longLivedData.access_token;
      finalExpires = longLivedData.expires_in;
      const expiresInDays = Math.round((finalExpires || 0) / 86400);
      metaLog(traceId, "Long-lived token obtained", {
        expiresInSeconds: finalExpires || null,
        expiresInDays,
      });
    } else {
      metaLog(traceId, "Long-lived token response missing access_token; continuing with short-lived token");
    }
    
    // Note: email removed from fields since we don't request email scope anymore
    const meResponse = await fetch(`https://graph.facebook.com/${META_API_VERSION}/me?fields=id,name,picture.type(large)&access_token=${finalToken}`);
    metaLog(traceId, "Meta /me HTTP response", {
      status: meResponse.status,
      statusText: meResponse.statusText,
      ok: meResponse.ok,
    });
    const meData = await meResponse.json();
    
    if (meData.error) {
      metaLog(traceId, "Meta /me error", { metaError: meData.error });
      return sendMetaOauthError(res, isPopup, meData.error.message || "Failed to fetch user info", traceId);
    }
    metaLog(traceId, "Meta /me success", {
      metaUserId: meData.id,
      accountName: meData.name,
    });
    
    metaLog(traceId, "Fetching ad accounts");
    const adAccountsResponse = await fetch(
      `https://graph.facebook.com/${META_API_VERSION}/me/adaccounts?fields=id,name,account_status&access_token=${finalToken}`
    );
    metaLog(traceId, "Meta /adaccounts HTTP response", {
      status: adAccountsResponse.status,
      statusText: adAccountsResponse.statusText,
      ok: adAccountsResponse.ok,
    });
    const adAccountsData = await adAccountsResponse.json();
    
    if (adAccountsData.error) {
      metaLog(traceId, "Meta /adaccounts error", { metaError: adAccountsData.error });
      return sendMetaOauthError(res, isPopup, adAccountsData.error.message || "Failed to fetch ad accounts", traceId);
    }
    metaLog(traceId, "Ad accounts fetched", {
      count: adAccountsData.data?.length || 0,
    });
    
    const pagesResponse = await fetch(
      `https://graph.facebook.com/${META_API_VERSION}/me/accounts?fields=id,name,access_token&access_token=${finalToken}`
    );
    metaLog(traceId, "Meta /accounts HTTP response", {
      status: pagesResponse.status,
      statusText: pagesResponse.statusText,
      ok: pagesResponse.ok,
    });
    const pagesData = await pagesResponse.json();
    
    if (pagesData.error) {
      metaLog(traceId, "Meta /accounts error", { metaError: pagesData.error });
      return sendMetaOauthError(res, isPopup, pagesData.error.message || "Failed to fetch pages", traceId);
    }
    metaLog(traceId, "Pages fetched", { count: pagesData.data?.length || 0 });
    
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
          metaLog(traceId, `Failed to fetch Instagram for page ${page.id}`, {
            error: getErrorMessage(err),
          });
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
      metaLog(traceId, "Updated existing oauth_connections row", {
        userId,
        connectionId: existingConnection[0].id,
      });
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
      metaLog(traceId, "Inserted new oauth_connections row", { userId });
    }
    
    const existingAssets = await db.select()
      .from(metaAssets)
      .where(eq(metaAssets.userId, userId))
      .limit(1);
    
    const adAccounts = adAccountsData.data || [];
    const pages = pagesData.data || [];
    
    // Always require ad account selection on each OAuth flow
    metaLog(traceId, "Preparing meta_assets update", {
      userId,
      hasExistingAssets: existingAssets.length > 0,
      adAccountsCount: adAccounts.length,
      pagesCount: pages.length,
    });
    
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
      metaLog(traceId, "Creating new meta_assets row for user", { userId });
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
    metaLog(traceId, "Saving session and finalizing OAuth", {
      userId,
      isPopup,
      redirect: "/select-ad-account",
    });
    req.session.save((err) => {
      if (err) {
        metaLog(traceId, "Session save failed", {
          error: getErrorMessage(err),
        });
        return sendMetaOauthError(res, isPopup, "Session save failed", traceId);
      }
      
      if (isPopup) {
        metaLog(traceId, "Popup OAuth success response sent", {
          redirect: "/select-ad-account",
        });
        return res.send(popupResponse("oauth-success", null, "/select-ad-account", traceId));
      }
      
      metaLog(traceId, "OAuth success redirect sent", { redirect: "/select-ad-account" });
      res.redirect("/select-ad-account");
    });
    
  } catch (err) {
    metaLog(traceId, "CALLBACK failed with exception", {
      error: getErrorMessage(err),
      stack: err instanceof Error ? err.stack || null : null,
      isPopup,
    });
    return sendMetaOauthError(res, isPopup, "Connection failed", traceId);
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
  
  const baseUrl = APP_BASE_URL;
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
    const baseUrl = APP_BASE_URL;
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
