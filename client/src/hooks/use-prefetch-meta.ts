import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { fetchMetaCampaigns, metaCampaignsQueryKey, type MetaCampaignList } from "@/lib/meta-campaigns";

interface Connection {
  id: number;
  provider: string;
  status: string;
}

const MAX_CONCURRENT_PREFETCH = 1;
const DELAY_BETWEEN_BATCHES_MS = 4000;
// Only the per-campaign ad set prefetch waits: those are live Meta calls. The
// campaign list is read from the app's cache and loads right away.
const PREFETCH_START_DELAY_MS = 2500;

export function usePrefetchMetaData() {
  const prefetchedRef = useRef<Set<string>>(new Set());
  const prefetchingRef = useRef(false);
  const [prefetchReady, setPrefetchReady] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setPrefetchReady(true), PREFETCH_START_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);

  const { data: connections = [] } = useQuery<Connection[]>({
    queryKey: ["/api/connections"],
  });

  const metaConnected = connections.some(
    (c) => c.provider === "meta" && c.status === "connected"
  );

  // Same query and key as the sidebar, so this costs no extra request.
  const { data: adAccountsData } = useQuery<{ selectedAdAccountId: string | null }>({
    queryKey: ["/api/meta/ad-accounts"],
    enabled: metaConnected,
  });
  const selectedAdAccountId = adAccountsData?.selectedAdAccountId || "";

  // Load the campaign list as soon as the ad account is known, under the key
  // the Launch page reads, so the campaign picker does not wait.
  const { data: campaignsData } = useQuery<MetaCampaignList>({
    queryKey: metaCampaignsQueryKey(selectedAdAccountId),
    queryFn: fetchMetaCampaigns,
    enabled: metaConnected && !!selectedAdAccountId,
    retry: 1,
  });

  const campaigns = campaignsData?.data || [];

  useEffect(() => {
    if (!metaConnected || !prefetchReady || campaigns.length === 0 || prefetchingRef.current) return;

    const activeCampaigns = campaigns.filter((campaign) => 
      campaign.effective_status === "ACTIVE" || campaign.status === "ACTIVE"
    );

    const toPrefetch = activeCampaigns.filter((campaign) => {
      if (prefetchedRef.current.has(campaign.id)) return false;
      const queryKey = ["/api/meta/adsets", campaign.id];
      const existing = queryClient.getQueryState(queryKey);
      return !existing?.data;
    });

    if (toPrefetch.length === 0) return;

    prefetchingRef.current = true;

    (async () => {
      for (let i = 0; i < toPrefetch.length; i += MAX_CONCURRENT_PREFETCH) {
        const batch = toPrefetch.slice(i, i + MAX_CONCURRENT_PREFETCH);
        await Promise.allSettled(
          batch.map((campaign) => {
            prefetchedRef.current.add(campaign.id);
            const queryKey = ["/api/meta/adsets", campaign.id];
            return queryClient.prefetchQuery({
              queryKey,
              queryFn: async () => {
                const res = await fetch(`/api/meta/adsets?campaignId=${encodeURIComponent(campaign.id)}`, {
                  credentials: "include",
                });
                if (!res.ok) throw new Error("Failed to prefetch ad sets");
                return res.json();
              },
              staleTime: Infinity,
            });
          })
        );
        if (i + MAX_CONCURRENT_PREFETCH < toPrefetch.length) {
          await new Promise((r) => setTimeout(r, DELAY_BETWEEN_BATCHES_MS));
        }
      }
      prefetchingRef.current = false;
    })();
  }, [metaConnected, campaigns, prefetchReady]);
}
