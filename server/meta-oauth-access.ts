export type MetaGraphError = {
  code?: number | string;
  message?: string;
};

export type MetaAdAccount = {
  id: string;
  name: string;
  account_status: number;
  [key: string]: unknown;
};

export type PromotePagesResponse = {
  data?: Array<Record<string, unknown>>;
  error?: MetaGraphError;
};

export type AdAccountAccessIssue =
  | "missing_ad_account_permission"
  | "meta_auth_error"
  | "meta_fetch_error"
  | "no_promotable_pages";

export type AdAccountAccessCheckResult = {
  account: MetaAdAccount;
  allowed: boolean;
  issue: AdAccountAccessIssue | null;
  promotablePageCount: number;
};

export type PendingAdAccount = MetaAdAccount & {
  access_verified: boolean;
  access_issue: AdAccountAccessIssue | null;
  promotable_pages_count: number;
};

export type MetaOauthAccessOptions = {
  apiVersion: string;
  log?: (message: string, details?: Record<string, unknown>) => void;
  fetchFn?: typeof fetch;
};

function log(options: MetaOauthAccessOptions, message: string, details?: Record<string, unknown>) {
  if (!options.log) return;
  options.log(message, details);
}

export function classifyMetaAccessIssue(error: MetaGraphError): Exclude<AdAccountAccessIssue, "no_promotable_pages"> {
  const rawCode = error?.code;
  const code = typeof rawCode === "number" ? rawCode : Number(rawCode);
  const message = String(error?.message || "");
  const lower = message.toLowerCase();

  const isPermissionError =
    code === 10 ||
    code === 200 ||
    lower.includes("permission") ||
    lower.includes("not authorized") ||
    lower.includes("not have access") ||
    lower.includes("insufficient");

  if (isPermissionError) return "missing_ad_account_permission";

  const isAuthError =
    code === 190 ||
    lower.includes("access token") ||
    lower.includes("oauth");

  if (isAuthError) return "meta_auth_error";
  return "meta_fetch_error";
}

export function normalizeMetaAdAccount(rawAccount: unknown): MetaAdAccount | null {
  if (!rawAccount || typeof rawAccount !== "object") return null;
  const account = rawAccount as Record<string, unknown>;
  const id = String(account.id || "").trim();
  if (!id) return null;

  const rawStatus = account.account_status;
  const numericStatus = typeof rawStatus === "number" ? rawStatus : Number(rawStatus);

  return {
    ...account,
    id,
    name: String(account.name || id),
    account_status: Number.isFinite(numericStatus) ? numericStatus : 0,
  };
}

export async function checkAdAccountPromotePagesAccess(
  account: MetaAdAccount,
  userAccessToken: string,
  options: MetaOauthAccessOptions,
): Promise<AdAccountAccessCheckResult> {
  const adAccountId = String(account.id || "");
  if (!adAccountId) {
    return {
      account,
      allowed: false,
      issue: "meta_fetch_error",
      promotablePageCount: 0,
    };
  }

  const url =
    `https://graph.facebook.com/${options.apiVersion}/${adAccountId}` +
    `/promote_pages?fields=id,name,access_token&limit=10&access_token=${encodeURIComponent(userAccessToken)}`;

  const fetchFn = options.fetchFn || fetch;

  try {
    const response = await fetchFn(url);
    const payload = (await response.json()) as PromotePagesResponse;

    if (payload?.error) {
      const issue = classifyMetaAccessIssue(payload.error);
      log(options, "Ad account excluded after promote_pages error", {
        adAccountId,
        accountName: account.name || null,
        issue,
        code: payload.error.code ?? null,
        message: payload.error.message ?? null,
      });
      return {
        account,
        allowed: false,
        issue,
        promotablePageCount: 0,
      };
    }

    const pageCount = Array.isArray(payload?.data) ? payload.data.length : 0;
    if (pageCount === 0) {
      // Treat accounts without promotable pages as not currently accessible for this app.
      // This guarantees reconnect returns only accounts that can immediately map to a Page.
      log(options, "Ad account excluded because no promotable pages were returned", {
        adAccountId,
        accountName: account.name || null,
      });
      return {
        account,
        allowed: false,
        issue: "no_promotable_pages",
        promotablePageCount: 0,
      };
    }

    return {
      account,
      allowed: true,
      issue: null,
      promotablePageCount: pageCount,
    };
  } catch (error) {
    log(options, "Ad account promote_pages access check failed with exception", {
      adAccountId,
      accountName: account.name || null,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      account,
      allowed: false,
      issue: "meta_fetch_error",
      promotablePageCount: 0,
    };
  }
}

export async function filterAccessibleAdAccounts(
  adAccounts: MetaAdAccount[],
  userAccessToken: string,
  options: MetaOauthAccessOptions,
): Promise<{
  pendingAccounts: PendingAdAccount[];
  allowedAccounts: MetaAdAccount[];
  blockedByIssue: Record<AdAccountAccessIssue, number>;
}> {
  const checks: AdAccountAccessCheckResult[] = [];
  const batchSize = 4;

  for (let index = 0; index < adAccounts.length; index += batchSize) {
    const batch = adAccounts.slice(index, index + batchSize);
    const results = await Promise.all(
      batch.map((account) => checkAdAccountPromotePagesAccess(account, userAccessToken, options)),
    );
    checks.push(...results);
  }

  const blockedByIssue: Record<AdAccountAccessIssue, number> = {
    missing_ad_account_permission: 0,
    meta_auth_error: 0,
    meta_fetch_error: 0,
    no_promotable_pages: 0,
  };

  for (const result of checks) {
    if (!result.allowed && result.issue) {
      blockedByIssue[result.issue] += 1;
    }
  }

  const pendingAccounts: PendingAdAccount[] = checks.map((result) => ({
    ...result.account,
    access_verified: result.allowed,
    access_issue: result.issue,
    promotable_pages_count: result.promotablePageCount,
  }));

  const allowedAccounts = pendingAccounts.filter((account) => account.access_verified);

  return { pendingAccounts, allowedAccounts, blockedByIssue };
}

export function buildNoUsableAdAccountsMessage(
  rawCount: number,
  blockedByIssue: Record<AdAccountAccessIssue, number>,
): string {
  if (rawCount === 0) {
    return "Meta did not return any ad accounts for this profile.";
  }

  const details: string[] = [];
  if (blockedByIssue.missing_ad_account_permission > 0) {
    details.push(`${blockedByIssue.missing_ad_account_permission} missing permissions`);
  }
  if (blockedByIssue.no_promotable_pages > 0) {
    details.push(`${blockedByIssue.no_promotable_pages} with no promotable pages`);
  }
  if (blockedByIssue.meta_auth_error > 0) {
    details.push(`${blockedByIssue.meta_auth_error} auth issues`);
  }
  if (blockedByIssue.meta_fetch_error > 0) {
    details.push(`${blockedByIssue.meta_fetch_error} fetch errors`);
  }

  if (details.length === 0) {
    return "No usable ad accounts were found for this reconnect.";
  }

  return `No usable ad accounts were found for this reconnect (${details.join(", ")}).`;
}
