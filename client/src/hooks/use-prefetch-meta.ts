import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";

interface Connection {
  id: number;
  provider: string;
  status: string;
}

interface Campaign {
  id: string;
  name: string;
  status: string;
  effective_status?: string;
  objective?: string;
  daily_budget?: string;
  lifetime_budget?: string;
}

const MAX_CONCURRENT_PREFETCH = 2;
const DELAY_BETWEEN_BATCHES_MS = 3000;

export function usePrefetchMetaData() {
  const prefetchedRef = useRef<Set<string>>(new Set());
  const prefetchingRef = useRef(false);

  const { data: connections = [] } = useQuery<Connection[]>({
    queryKey: ["/api/connections"],
  });

  const metaConnected = connections.some(
    (c) => c.provider === "meta" && c.status === "connected"
  );

  const { data: campaignsData } = useQuery<{
    data: Campaign[];
    source: string;
  }>({
    queryKey: ["/api/meta/campaigns", "live"],
    queryFn: async () => {
      const res = await fetch("/api/meta/campaigns?live=true");
      if (!res.ok) throw new Error("Failed to fetch campaigns");
      return res.json();
    },
    enabled: metaConnected,
    retry: 1,
  });

  const campaigns = campaignsData?.data || [];

  useEffect(() => {
    if (!metaConnected || campaigns.length === 0 || prefetchingRef.current) return;

    const activeCampaigns = campaigns.filter((campaign) => 
      campaign.effective_status === "ACTIVE" || campaign.status === "ACTIVE"
    );

    const toPrefetch = activeCampaigns.filter((campaign) => {
      if (prefetchedRef.current.has(campaign.id)) return false;
      const queryKey = [`/api/meta/adsets?live=true&campaignId=${campaign.id}`];
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
            const queryKey = [`/api/meta/adsets?live=true&campaignId=${campaign.id}`];
            return queryClient.prefetchQuery({ queryKey, staleTime: Infinity });
          })
        );
        if (i + MAX_CONCURRENT_PREFETCH < toPrefetch.length) {
          await new Promise((r) => setTimeout(r, DELAY_BETWEEN_BATCHES_MS));
        }
      }
      prefetchingRef.current = false;
    })();
  }, [metaConnected, campaigns]);
}
