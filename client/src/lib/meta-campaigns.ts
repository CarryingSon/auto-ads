// One definition of the campaign list query, so the app-wide prefetch and the
// Launch page share a cache entry: campaigns start loading as soon as the ad
// account is known, and Launch finds them already there.

export interface MetaCampaignListItem {
  id: string;
  name: string;
  status: string;
  effective_status?: string;
  objective?: string;
  daily_budget?: string;
  lifetime_budget?: string;
}

export interface MetaCampaignList {
  data: MetaCampaignListItem[];
  source: string;
}

export function metaCampaignsQueryKey(adAccountId: string | null | undefined) {
  return ["/api/meta/campaigns", adAccountId || "none"] as const;
}

// The server answers for the account selected on the session; the key carries
// the account id so switching accounts never shows the previous list.
export async function fetchMetaCampaigns(): Promise<MetaCampaignList> {
  const res = await fetch("/api/meta/campaigns", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch campaigns");
  return res.json();
}
