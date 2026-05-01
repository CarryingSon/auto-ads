import "../server/load-env.js";

import crypto from "node:crypto";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db, pool } from "../server/db.js";
import { metaAssets, oauthConnections } from "../shared/schema.js";

const META_API_VERSION = process.env.META_API_VERSION || "v21.0";
const TOKEN_ENC_KEY = process.env.TOKEN_ENC_KEY || process.env.SESSION_SECRET;

function decrypt(encryptedText: string): string {
  if (!TOKEN_ENC_KEY) throw new Error("TOKEN_ENC_KEY or SESSION_SECRET is not configured");

  try {
    const parts = encryptedText.split(":");
    if (parts.length === 3) {
      const [ivHex, encrypted, authTagHex] = parts;
      const iv = Buffer.from(ivHex, "hex");
      const authTag = Buffer.from(authTagHex, "hex");
      const key = crypto.scryptSync(TOKEN_ENC_KEY, "salt", 32);
      const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(encrypted, "hex", "utf8");
      decrypted += decipher.final("utf8");
      return decrypted;
    }
  } catch {
    // Legacy rows may be plaintext from older local/test installs.
  }

  return encryptedText;
}

function graphUrl(path: string, params: Record<string, string>) {
  const url = new URL(`https://graph.facebook.com/${META_API_VERSION}/${path.replace(/^\//, "")}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url;
}

async function graphGet(path: string, accessToken: string, params: Record<string, string> = {}) {
  const url = graphUrl(path, { ...params, access_token: accessToken });
  const response = await fetch(url);
  const json = await response.json();
  return { ok: response.ok && !json?.error, status: response.status, json };
}

function compactError(json: any) {
  if (!json?.error) return null;
  return {
    message: json.error.message,
    type: json.error.type,
    code: json.error.code,
    error_subcode: json.error.error_subcode,
  };
}

function printResult(name: string, result: Awaited<ReturnType<typeof graphGet>>, extra: Record<string, unknown> = {}) {
  console.log(`\n${name}`);
  console.log(JSON.stringify({
    ok: result.ok,
    status: result.status,
    ...extra,
    error: compactError(result.json),
  }, null, 2));
}

async function main() {
  const connections = await db.select()
    .from(oauthConnections)
    .where(and(
      eq(oauthConnections.provider, "meta"),
      eq(oauthConnections.status, "connected"),
      isNotNull(oauthConnections.accessToken),
    ))
    .orderBy(desc(oauthConnections.updatedAt), desc(oauthConnections.connectedAt));

  let selected: typeof connections[number] | null = null;
  let userToken = "";
  let me: any = null;

  for (const connection of connections) {
    const token = decrypt(connection.accessToken || "");
    if (!token) continue;

    const result = await graphGet("/me", token, { fields: "id,name" });
    if (result.ok) {
      selected = connection;
      userToken = token;
      me = result.json;
      printResult("1. User token check: GET /me", result, {
        metaUserId: result.json.id,
        name: result.json.name,
      });
      break;
    }
  }

  if (!selected || !userToken) {
    throw new Error("No valid connected Meta token found. Reconnect Meta first, then rerun this script.");
  }

  if (process.env.META_APP_ID && process.env.META_APP_SECRET) {
    const debugUrl = graphUrl("/debug_token", {
      input_token: userToken,
      access_token: `${process.env.META_APP_ID}|${process.env.META_APP_SECRET}`,
    });
    const debugResponse = await fetch(debugUrl);
    const debugData = await debugResponse.json();
    const scopes = Array.isArray(debugData?.data?.scopes) ? debugData.data.scopes : [];
    console.log("\n2. Token scopes: GET /debug_token");
    console.log(JSON.stringify({
      ok: debugResponse.ok && !debugData?.error,
      status: debugResponse.status,
      appId: debugData?.data?.app_id || null,
      userId: debugData?.data?.user_id || null,
      requiredScopes: {
        pages_show_list: scopes.includes("pages_show_list"),
        pages_manage_metadata: scopes.includes("pages_manage_metadata"),
      },
      scopes,
      error: compactError(debugData),
    }, null, 2));
  }

  const accounts = await graphGet("/me/accounts", userToken, {
    fields: "id,name,access_token,tasks",
    limit: "10",
  });
  const pages = Array.isArray(accounts.json?.data) ? accounts.json.data : [];
  printResult("3. Page list: GET /me/accounts", accounts, {
    pageCount: pages.length,
    pages: pages.map((page: any) => ({
      id: page.id,
      name: page.name,
      hasPageAccessToken: Boolean(page.access_token),
      tasks: page.tasks || [],
    })),
  });

  const [assets] = await db.select()
    .from(metaAssets)
    .where(eq(metaAssets.userId, selected.userId || me.id))
    .limit(1);

  let promotePages: Awaited<ReturnType<typeof graphGet>> | null = null;
  let promotedPages: any[] = [];
  if (assets?.selectedAdAccountId) {
    promotePages = await graphGet(`/${assets.selectedAdAccountId}/promote_pages`, userToken, {
      fields: "id,name,access_token",
      limit: "10",
    });
    promotedPages = Array.isArray(promotePages.json?.data) ? promotePages.json.data : [];
    printResult("4. Ad account scoped Pages: GET /{ad-account-id}/promote_pages", promotePages, {
      adAccountId: assets.selectedAdAccountId,
      pageCount: promotedPages.length,
      pages: promotedPages.map((page: any) => ({
        id: page.id,
        name: page.name,
        hasPageAccessToken: Boolean(page.access_token),
      })),
    });
  }

  const firstPage =
    pages.find((page: any) => page?.id && page?.access_token) ||
    promotedPages.find((page: any) => page?.id && page?.access_token);

  if (!firstPage) {
    throw new Error(
      "No Page access token returned by /me/accounts or /promote_pages. Reconnect Meta with pages_show_list + pages_manage_metadata and choose a user that manages a Facebook Page.",
    );
  }

  const subscribedApps = await graphGet(`/${firstPage.id}/subscribed_apps`, firstPage.access_token, {
    fields: "id,name",
    limit: "25",
  });
  printResult("5. Metadata permission check: GET /{page-id}/subscribed_apps", subscribedApps, {
    pageId: firstPage.id,
    subscribedAppCount: Array.isArray(subscribedApps.json?.data) ? subscribedApps.json.data.length : null,
  });

  const pageMetadata = await graphGet(`/${firstPage.id}`, firstPage.access_token, {
    fields: "id,name,category,link,instagram_business_account{id,username,name},connected_instagram_account{id,username,name}",
  });
  printResult("6. Page metadata: GET /{page-id}", pageMetadata, {
    pageId: pageMetadata.json?.id || firstPage.id,
    pageName: pageMetadata.json?.name || firstPage.name,
    category: pageMetadata.json?.category || null,
    hasInstagramBusinessAccount: Boolean(pageMetadata.json?.instagram_business_account),
    hasConnectedInstagramAccount: Boolean(pageMetadata.json?.connected_instagram_account),
  });
}

main()
  .catch((error) => {
    console.error("\nMeta review API call test failed:");
    console.error(error?.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
