// Demo data for the onboarding screen recording (record.mjs). Every /api and
// /auth request is answered here, so the recording never reaches a real backend.

const ACCOUNT = { id: "act_1001", name: "AudioCore EU", hasSettings: true, account_status: 1 };
const PAGE = { id: "page_1", name: "AudioCore", source: "live" };
const SA_EMAIL = "auto-ads@autoads-drive.iam.gserviceaccount.com";

const copy = {
  primaryTexts: ["Hear every detail. Free shipping this week only.", "Studio sound, all-day comfort."],
  headlines: ["Spring Sale: 30% off"],
  descriptions: ["Limited time only"],
};

const DCTS = [
  { name: "Spring_Sale", dct: "DCT 161 Spring_Sale", images: 4, videos: 0 },
  { name: "Comparison", dct: "DCT 162 Comparison", images: 3, videos: 0 },
  { name: "Video_Ads", dct: "DCT 163 Video_Ads", images: 0, videos: 2 },
  { name: "New_Concepts", dct: "DCT 164 New_Concepts", images: 5, videos: 0 },
];

const adSets = DCTS.map((d, i) => ({
  id: `adset_${i + 1}`,
  name: d.name,
  folderName: d.dct,
  dctName: d.dct,
  videoCount: d.videos,
  imageCount: d.images,
  creativeCount: d.videos + d.images,
  hasDocx: true,
  docxFileName: "ad_copy",
  docxSource: "global",
  parsedCopy: copy,
  status: "valid",
  validationErrors: [],
  useDefaults: true,
  overrideSettings: {},
}));

const settings = {
  facebookPageId: PAGE.id,
  facebookPageName: PAGE.name,
  instagramPageId: null,
  instagramPageName: null,
  websiteUrl: "https://audiocore.example/spring",
  displayLink: "audiocore.example",
  defaultCta: "SHOP_NOW",
  pixelId: "px_1",
  creativeEnhancements: {},
};

export function mockResponse(method, path, url) {
  if (path === "/auth/me") {
    return { authenticated: true, user: { id: "demo", name: "Demo User", email: "demo@autoads.example" } };
  }
  if (path === "/auth/csrf" || path.endsWith("/csrf-token")) return { csrfToken: "demo" };

  switch (path) {
    case "/api/sidebar-data":
      return {
        adAccounts: [ACCOUNT],
        selectedAdAccountId: ACCOUNT.id,
        hasPendingAccounts: false,
        pages: [PAGE],
        selectedPageId: PAGE.id,
        filteredByAdAccount: true,
        autoSelected: false,
        instagramAccounts: [],
        settings: { planType: "pro", uploadsRemaining: null, instagramPageId: null, instagramPageName: null, facebookPageName: PAGE.name },
        drive: { email: SA_EMAIL, connected: true },
      };
    case "/api/billing/status":
      return { planType: "pro", uploadsUsed: 12, uploadsLimit: null, uploadsRemaining: null };
    case "/api/connections":
      return [
        { id: 1, provider: "meta", status: "connected" },
        { id: 2, provider: "google_drive", status: "connected" },
      ];
    case "/api/meta/ad-accounts":
      return { data: [ACCOUNT], selectedAdAccountId: ACCOUNT.id, connectionUpdatedAt: null };
    case "/api/meta/connection-health":
      return { connected: true, tokenExpiresAt: null, daysLeft: 50, expired: false };
    case "/api/meta/ad-account-timezone":
      return { timezoneName: "Europe/Ljubljana", utcOffset: "+01:00" };
    case "/api/meta/campaigns":
      return {
        data: [
          { id: "cmp_1", name: "AudioCore · Spring Sale · Prospecting", status: "ACTIVE", effective_status: "ACTIVE", objective: "OUTCOME_SALES", daily_budget: "15000" },
          { id: "cmp_2", name: "AudioCore · Retargeting", status: "PAUSED", effective_status: "PAUSED", objective: "OUTCOME_SALES" },
        ],
        source: "live",
      };
    case "/api/meta/pages":
      return { data: [PAGE], selectedPageId: PAGE.id, filteredByAdAccount: true, autoSelected: false, source: "live" };
    case "/api/meta/instagram-accounts":
      return { data: [] };
    case "/api/meta/pixels":
      return { data: [{ id: "px_1", name: "AudioCore Pixel" }] };
    case "/api/meta/adsets":
      return { data: [] };
    case "/api/ad-account-settings":
      return { settings, adAccountId: ACCOUNT.id, adAccountName: ACCOUNT.name, isConfigured: true };
    case "/api/settings":
      return settings;
    case "/api/user/settings":
      return {};
    case "/api/drive/connected-email":
      return { email: SA_EMAIL, connected: true };
    case "/api/jobs":
      return [];
    case "/api/drive/sync":
    case "/api/drive/import-private":
      return {
        jobId: "job_demo",
        campaignId: "cmp_1",
        driveRootFolderId: "folder_demo",
        driveRootFolderName: "Spring Campaign",
        adSets,
        globalDocxFound: true,
      };
    case "/api/drive/adsets":
      return adSets;
    case "/api/bulk-ads/dry-run":
      return { jobId: "job_demo", adsCount: 14, validAds: 14, invalidAds: 0, preview: [] };
  }

  if (path.startsWith("/api/meta/campaigns/") && path.endsWith("/details")) {
    return { id: "cmp_1", name: "AudioCore · Spring Sale · Prospecting", daily_budget: "15000", objective: "OUTCOME_SALES" };
  }
  if (method === "PATCH" || method === "POST") return { ok: true };
  return {};
}
