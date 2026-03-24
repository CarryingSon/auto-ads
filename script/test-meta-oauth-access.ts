import assert from "node:assert/strict";
import {
  buildNoUsableAdAccountsMessage,
  checkAdAccountPromotePagesAccess,
  classifyMetaAccessIssue,
  filterAccessibleAdAccounts,
  normalizeMetaAdAccount,
  type MetaAdAccount,
  type MetaOauthAccessOptions,
  type PromotePagesResponse,
} from "../server/meta-oauth-access.js";

type FetchResponseLike = { json(): Promise<unknown> };
type FetchMock = (input: string | URL | Request, init?: RequestInit) => Promise<FetchResponseLike>;

function createFetchMockByAccountId(
  map: Record<string, PromotePagesResponse | Error>,
  calls: string[],
): FetchMock {
  return async (input) => {
    const url = String(input);
    calls.push(url);
    const match = url.match(/\/([^/]+)\/promote_pages\?/);
    const adAccountId = match?.[1];
    if (!adAccountId) {
      throw new Error(`Could not parse ad account id from url: ${url}`);
    }

    const behavior = map[adAccountId];
    if (!behavior) {
      return {
        async json() {
          return { data: [] };
        },
      };
    }

    if (behavior instanceof Error) {
      throw behavior;
    }

    return {
      async json() {
        return behavior;
      },
    };
  };
}

async function run() {
  // classifyMetaAccessIssue
  assert.equal(classifyMetaAccessIssue({ code: 10, message: "Permission error" }), "missing_ad_account_permission");
  assert.equal(classifyMetaAccessIssue({ code: 200, message: "Not authorized" }), "missing_ad_account_permission");
  assert.equal(classifyMetaAccessIssue({ code: 190, message: "Invalid OAuth access token" }), "meta_auth_error");
  assert.equal(classifyMetaAccessIssue({ message: "insufficient permissions to access this resource" }), "missing_ad_account_permission");
  assert.equal(classifyMetaAccessIssue({ code: 500, message: "Unknown" }), "meta_fetch_error");

  // normalizeMetaAdAccount
  assert.equal(normalizeMetaAdAccount(null), null);
  assert.equal(normalizeMetaAdAccount({}), null);
  const normalized = normalizeMetaAdAccount({ id: "act_123", name: "", account_status: "1", extra: true });
  assert.ok(normalized);
  assert.equal(normalized?.id, "act_123");
  assert.equal(normalized?.name, "act_123");
  assert.equal(normalized?.account_status, 1);

  // checkAdAccountPromotePagesAccess
  const calls: string[] = [];
  const options: MetaOauthAccessOptions = {
    apiVersion: "v21.0",
    fetchFn: createFetchMockByAccountId(
      {
        act_perm: { error: { code: 10, message: "Missing permission" } },
        act_auth: { error: { code: 190, message: "OAuth token expired" } },
        act_empty: { data: [] },
        act_ok: { data: [{ id: "p1", name: "Page 1" }, { id: "p2", name: "Page 2" }] },
        act_throw: new Error("network"),
      },
      calls,
    ) as unknown as typeof fetch,
  };

  const account = (id: string): MetaAdAccount => ({ id, name: id, account_status: 1 });

  const emptyIdResult = await checkAdAccountPromotePagesAccess(
    { id: "", name: "empty", account_status: 1 },
    "token",
    options,
  );
  assert.equal(emptyIdResult.allowed, false);
  assert.equal(emptyIdResult.issue, "meta_fetch_error");

  const permResult = await checkAdAccountPromotePagesAccess(account("act_perm"), "token", options);
  assert.equal(permResult.allowed, false);
  assert.equal(permResult.issue, "missing_ad_account_permission");

  const authResult = await checkAdAccountPromotePagesAccess(account("act_auth"), "token", options);
  assert.equal(authResult.allowed, false);
  assert.equal(authResult.issue, "meta_auth_error");

  const emptyResult = await checkAdAccountPromotePagesAccess(account("act_empty"), "token", options);
  assert.equal(emptyResult.allowed, false);
  assert.equal(emptyResult.issue, "no_promotable_pages");

  const okResult = await checkAdAccountPromotePagesAccess(account("act_ok"), "token", options);
  assert.equal(okResult.allowed, true);
  assert.equal(okResult.issue, null);
  assert.equal(okResult.promotablePageCount, 2);

  const throwResult = await checkAdAccountPromotePagesAccess(account("act_throw"), "token", options);
  assert.equal(throwResult.allowed, false);
  assert.equal(throwResult.issue, "meta_fetch_error");

  // filterAccessibleAdAccounts (mixed scenario + batch > 4)
  const mixedAccounts = ["act_ok", "act_perm", "act_auth", "act_empty", "act_throw", "act_unknown"]
    .map((id) => account(id));
  const filtered = await filterAccessibleAdAccounts(mixedAccounts, "token", options);

  assert.equal(filtered.pendingAccounts.length, 6);
  assert.equal(filtered.allowedAccounts.length, 1);
  assert.equal(filtered.allowedAccounts[0].id, "act_ok");
  assert.equal(filtered.blockedByIssue.missing_ad_account_permission, 1);
  assert.equal(filtered.blockedByIssue.meta_auth_error, 1);
  assert.equal(filtered.blockedByIssue.no_promotable_pages, 2); // act_empty + act_unknown default empty
  assert.equal(filtered.blockedByIssue.meta_fetch_error, 1); // act_throw
  assert.ok(filtered.pendingAccounts.some((acc) => acc.id === "act_perm" && acc.access_verified === false));
  assert.ok(filtered.pendingAccounts.some((acc) => acc.id === "act_ok" && acc.access_verified === true));

  const filteredEmpty = await filterAccessibleAdAccounts([], "token", options);
  assert.equal(filteredEmpty.pendingAccounts.length, 0);
  assert.equal(filteredEmpty.allowedAccounts.length, 0);
  assert.equal(filteredEmpty.blockedByIssue.missing_ad_account_permission, 0);
  assert.equal(filteredEmpty.blockedByIssue.meta_auth_error, 0);
  assert.equal(filteredEmpty.blockedByIssue.meta_fetch_error, 0);
  assert.equal(filteredEmpty.blockedByIssue.no_promotable_pages, 0);

  // buildNoUsableAdAccountsMessage
  assert.equal(
    buildNoUsableAdAccountsMessage(0, {
      missing_ad_account_permission: 0,
      meta_auth_error: 0,
      meta_fetch_error: 0,
      no_promotable_pages: 0,
    }),
    "Meta did not return any ad accounts for this profile.",
  );

  const message = buildNoUsableAdAccountsMessage(4, {
    missing_ad_account_permission: 2,
    meta_auth_error: 1,
    meta_fetch_error: 0,
    no_promotable_pages: 1,
  });
  assert.equal(
    message,
    "No usable ad accounts were found for this reconnect (2 missing permissions, 1 with no promotable pages, 1 auth issues).",
  );
  assert.equal(
    buildNoUsableAdAccountsMessage(3, {
      missing_ad_account_permission: 0,
      meta_auth_error: 0,
      meta_fetch_error: 0,
      no_promotable_pages: 0,
    }),
    "No usable ad accounts were found for this reconnect.",
  );

  assert.ok(calls.length >= 11); // 5 single checks + 6 from mixed batch

  console.log("PASS script/test-meta-oauth-access.ts");
  console.log(`Cases covered: classify=5, normalize=3, access-check=6, filter=2, message=3`);
}

run().catch((error) => {
  console.error("FAIL script/test-meta-oauth-access.ts");
  console.error(error);
  process.exit(1);
});
