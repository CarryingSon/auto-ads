import { useState, useEffect, useMemo, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Loader2, Lock } from "lucide-react";
import { SiFacebook, SiInstagram } from "react-icons/si";
import { useAuth } from "@/hooks/use-auth";

interface MetaPage {
  id: string;
  name: string;
  source: string;
  instagram_accounts?: Array<{ id: string; username?: string; name?: string; profile_picture_url?: string }>;
  instagram_is_page_backed?: boolean;
}

interface AdAccount {
  id: string;
  name: string;
  account_status: number;
  hasSettings?: boolean;
}

interface InstagramAccount {
  id: string;
  username: string;
  name?: string;
  profile_picture_url?: string;
}

interface SidebarData {
  adAccounts: AdAccount[];
  selectedAdAccountId: string | null;
  hasPendingAccounts: boolean;
  pages: MetaPage[];
  selectedPageId: string | null;
  filteredByAdAccount: boolean;
  autoSelected: boolean;
  instagramAccounts: InstagramAccount[];
  settings: {
    planType: string | null;
    uploadsRemaining: number | null;
    instagramPageId: string | null;
    instagramPageName: string | null;
    facebookPageName: string | null;
  };
  drive: { email: string | null; connected: boolean };
}

interface SidebarPagesResponse {
  data: MetaPage[];
  selectedPageId: string | null;
  filteredByAdAccount?: boolean;
  autoSelected?: boolean;
  source?: string;
  accessIssue?: "missing_ad_account_permission" | "meta_auth_error" | "meta_not_connected" | "meta_fetch_error" | null;
}

interface BillingStatusSummary {
  planType: "free" | "pro";
  uploadsUsed: number;
  uploadsLimit: number | null;
  uploadsRemaining: number | null;
}

const SIDEBAR_CACHE_PREFIX = "auto_ads_sidebar_cache_v1";
const SIDEBAR_CACHE_MAX_AGE_MS = 12 * 60 * 60 * 1000;

interface SidebarCacheEntry {
  cachedAt: number;
  data: SidebarData;
}

function readSidebarCache(userId?: string): SidebarData | undefined {
  if (typeof window === "undefined" || !userId) return undefined;
  try {
    const raw = window.localStorage.getItem(`${SIDEBAR_CACHE_PREFIX}:${userId}`);
    if (!raw) return undefined;

    const parsed = JSON.parse(raw) as SidebarCacheEntry;
    if (!parsed?.data || typeof parsed.cachedAt !== "number") return undefined;

    if (Date.now() - parsed.cachedAt > SIDEBAR_CACHE_MAX_AGE_MS) {
      window.localStorage.removeItem(`${SIDEBAR_CACHE_PREFIX}:${userId}`);
      return undefined;
    }

    return parsed.data;
  } catch {
    return undefined;
  }
}

function writeSidebarCache(userId: string, data: SidebarData): void {
  if (typeof window === "undefined" || !userId) return;
  try {
    const payload: SidebarCacheEntry = {
      cachedAt: Date.now(),
      data,
    };
    window.localStorage.setItem(`${SIDEBAR_CACHE_PREFIX}:${userId}`, JSON.stringify(payload));
  } catch {
    // Ignore localStorage failures (quota/private mode).
  }
}

const navigationItems = [
  {
    title: "Dashboard",
    url: "/dashboard",
    icon: "grid_view",
  },
  {
    title: "Launch",
    url: "/bulk-ads",
    icon: "rocket_launch",
  },
  {
    title: "Statistics",
    url: "/statistics",
    icon: "monitoring",
  },
  {
    title: "History",
    url: "/history",
    icon: "history",
  },
];

const managementItems = [
  {
    title: "Settings",
    url: "/settings",
    icon: "settings",
  },
];

interface ActiveJob {
  id: string;
  status: string;
}

export function AppSidebar() {
  const [location, setLocation] = useLocation();
  const { user } = useAuth();
  const userId = user?.id;

  const [isAdAccountSwitching, setIsAdAccountSwitching] = useState(false);
  const cachedSidebarData = useMemo(() => readSidebarCache(userId), [userId]);

  // Single combined query — render instantly from local cache, then refresh in background.
  const { data: sidebarData, isFetching: isSidebarFetching } = useQuery<SidebarData>({
    queryKey: ["/api/sidebar-data"],
    placeholderData: cachedSidebarData,
    staleTime: 30_000,
    refetchOnMount: "always",
  });

  const { data: billingStatus } = useQuery<BillingStatusSummary>({
    queryKey: ["/api/billing/status"],
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!userId || !sidebarData) return;
    writeSidebarCache(userId, sidebarData);
  }, [userId, sidebarData]);
  const selectedAdAccountId = sidebarData?.selectedAdAccountId || "";

  // Fallback: if account-scoped pages are missing/unresolved, fetch /api/meta/pages to refresh cache
  const hasSelectedAdAccount = !!sidebarData?.selectedAdAccountId;
  const isAccountScopeResolved = sidebarData?.filteredByAdAccount === true;
  const sidebarPageCount = sidebarData?.pages?.length ?? 0;
  const hasSelectedPage = !!sidebarData?.selectedPageId;
  const needsPagesFetch = !isSidebarFetching &&
    hasSelectedAdAccount &&
    (
      !isAccountScopeResolved ||
      !hasSelectedPage
    );

  const {
    data: fallbackPagesData,
    isFetching: isFallbackPagesFetching,
    isFetched: isFallbackPagesFetched,
  } = useQuery<SidebarPagesResponse>({
    // Scope fallback pages cache to currently selected ad account so we never
    // reuse pages from a different account.
    queryKey: ["sidebar-meta-pages", selectedAdAccountId || "none"],
    queryFn: async () => {
      const res = await fetch("/api/meta/pages?refresh=true", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch pages");
      return res.json();
    },
    enabled: needsPagesFetch,
    staleTime: 60_000,
  });

  // When /api/meta/pages finishes fetching, refresh sidebar-data to pick up newly cached pages
  useEffect(() => {
    if (isFallbackPagesFetched) {
      queryClient.invalidateQueries({ queryKey: ["/api/sidebar-data"] });
    }
  }, [isFallbackPagesFetched]);

  const adAccounts = sidebarData?.adAccounts || [];
  const hasPendingAccounts = sidebarData?.hasPendingAccounts || false;
  const fallbackPages = fallbackPagesData?.data || [];
  const usingFallbackPages = needsPagesFetch && isFallbackPagesFetched;
  const metaPages = usingFallbackPages ? fallbackPages : (sidebarData?.pages || []);
  const selectedPageId = (usingFallbackPages
    ? (fallbackPagesData?.selectedPageId || sidebarData?.selectedPageId || "")
    : (sidebarData?.selectedPageId || "")) || "";
  const isPageAutoSelected = (usingFallbackPages ? fallbackPagesData?.autoSelected : sidebarData?.autoSelected) || metaPages.length === 1;
  const selectedPageFromList = metaPages.find((p) => p.id === selectedPageId) as MetaPage | undefined;
  const derivedInstagramAccounts = (selectedPageFromList?.instagram_accounts || []).map((a) => ({
    id: a.id,
    username: a.username || "",
    name: a.name,
    profile_picture_url: a.profile_picture_url,
  }));
  const instagramAccounts = (sidebarData?.instagramAccounts && sidebarData.instagramAccounts.length > 0)
    ? sidebarData.instagramAccounts
    : derivedInstagramAccounts;
  const settings = sidebarData?.settings;
  const savedInstagramId = settings?.instagramPageId || "";
  const selectedInstagram = instagramAccounts.find(a => a.id === savedInstagramId) ||
    (instagramAccounts.length > 0 ? instagramAccounts[0] : null);

  // Redirect to ad account selection if pending
  useEffect(() => {
    if (!isSidebarFetching && hasPendingAccounts && adAccounts.length === 0 && !location.startsWith("/select-ad-account")) {
      setLocation("/select-ad-account");
    }
  }, [hasPendingAccounts, isSidebarFetching, adAccounts.length, location, setLocation]);

  const { data: activeJobs } = useQuery<ActiveJob[]>({
    queryKey: ["/api/bulk-ads/jobs"],
    enabled: location.startsWith("/bulk-ads"),
  });

  const hasActiveJob = location.startsWith("/bulk-ads") &&
    activeJobs?.some(
      (job) =>
        job.status === "pending" ||
        job.status === "queued" ||
        job.status === "processing" ||
        job.status === "retrying" ||
        job.status === "launched",
    );

  const lastAutoSelectedForAdAccount = useRef<string | null>(null);
  const [hasManualPageOverride, setHasManualPageOverride] = useState(false);

  const normalizeName = (name: string): string => {
    return name.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
  };

  const findMatchingPage = (adAccountName: string): MetaPage | undefined => {
    const normalizedAdName = normalizeName(adAccountName);
    let match = metaPages.find(page => normalizeName(page.name) === normalizedAdName);
    if (!match) {
      match = metaPages.find(page =>
        normalizeName(page.name).includes(normalizedAdName) ||
        normalizedAdName.includes(normalizeName(page.name))
      );
    }
    return match;
  };

  const updatePageMutation = useMutation({
    mutationFn: async (pageId: string) => {
      const res = await apiRequest("PATCH", "/api/meta/pages/selected", { pageId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sidebar-data"] });
      queryClient.invalidateQueries({ queryKey: ["/api/meta/campaigns"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/settings"] });
    },
  });

  const updateAdAccountMutation = useMutation({
    mutationFn: async (adAccountId: string) => {
      const res = await apiRequest("PATCH", "/api/meta/ad-accounts/selected", { adAccountId });
      return res.json();
    },
    onMutate: async (adAccountId: string) => {
      setIsAdAccountSwitching(true);
      setHasManualPageOverride(false);
      lastAutoSelectedForAdAccount.current = null;

      await queryClient.cancelQueries({ queryKey: ["/api/sidebar-data"] });
      const previousData = queryClient.getQueryData(["/api/sidebar-data"]);

      // Optimistically update selectedAdAccountId and clear pages
      queryClient.setQueryData(["/api/sidebar-data"], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          selectedAdAccountId: adAccountId,
          pages: [],
          selectedPageId: null,
          instagramAccounts: [],
          autoSelected: false,
          filteredByAdAccount: false,
        };
      });

      // Also clear individual query caches
      queryClient.removeQueries({ queryKey: ["/api/meta/pages"] });
      queryClient.removeQueries({ queryKey: ["/api/meta/instagram-accounts"], exact: false });

      return { previousData };
    },
    onSuccess: async () => {
      try {
        // Keep this lightweight to avoid request bursts during account switch.
        await queryClient.invalidateQueries({ queryKey: ["/api/sidebar-data"] });
        queryClient.invalidateQueries({ queryKey: ["/api/meta/ad-accounts"] });
      } finally {
        setIsAdAccountSwitching(false);
      }
    },
    onError: (_err, _adAccountId, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(["/api/sidebar-data"], context.previousData);
      }
      setIsAdAccountSwitching(false);
    },
  });

  // Auto-select page by name match when ad account changes
  useEffect(() => {
    if (!selectedAdAccountId || metaPages.length === 0 || updatePageMutation.isPending) {
      return;
    }
    if (lastAutoSelectedForAdAccount.current === selectedAdAccountId) {
      return;
    }
    if (hasManualPageOverride) {
      return;
    }
    const selectedAdAccount = adAccounts.find(a => a.id === selectedAdAccountId);
    if (!selectedAdAccount) {
      return;
    }
    const matchingPage = findMatchingPage(selectedAdAccount.name);
    if (matchingPage && matchingPage.id !== selectedPageId) {
      lastAutoSelectedForAdAccount.current = selectedAdAccountId;
      updatePageMutation.mutate(matchingPage.id);
    } else {
      lastAutoSelectedForAdAccount.current = selectedAdAccountId;
    }
  }, [selectedAdAccountId, metaPages, adAccounts, selectedPageId, hasManualPageOverride]);

  const updateInstagramMutation = useMutation({
    mutationFn: async ({ instagramPageId, instagramPageName }: { instagramPageId: string; instagramPageName: string }) => {
      const res = await apiRequest("PATCH", "/api/settings", { instagramPageId, instagramPageName });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sidebar-data"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
    },
  });

  // Auto-select first Instagram when accounts change
  useEffect(() => {
    if (instagramAccounts.length === 0 || updateInstagramMutation.isPending) return;
    const savedMatchesCurrent = savedInstagramId && instagramAccounts.some(a => a.id === savedInstagramId);
    if (!savedMatchesCurrent && instagramAccounts.length > 0) {
      const first = instagramAccounts[0];
      updateInstagramMutation.mutate({
        instagramPageId: first.id,
        instagramPageName: first.username || first.name || "",
      });
    }
  }, [instagramAccounts, savedInstagramId, updateInstagramMutation.isPending]);

  const handleInstagramChange = (igId: string) => {
    const account = instagramAccounts.find(a => a.id === igId);
    if (account) {
      updateInstagramMutation.mutate({
        instagramPageId: account.id,
        instagramPageName: account.username || account.name || "",
      });
    }
  };

  const handleManualPageChange = (pageId: string) => {
    setHasManualPageOverride(true);
    updatePageMutation.mutate(pageId);
  };

  const handleAdAccountChange = (adAccountId: string) => {
    updateAdAccountMutation.mutate(adAccountId);
  };

  const effectivePlanType = billingStatus?.planType || (settings?.planType || "free");
  const isProPlan = effectivePlanType === "pro";
  const uploadsRemaining = billingStatus?.uploadsRemaining ?? settings?.uploadsRemaining ?? 0;
  const maxUploads = billingStatus?.uploadsLimit ?? 3;
  const remainingForProgress = typeof uploadsRemaining === "number" ? Math.max(0, uploadsRemaining) : 0;
  const freeLimitForProgress = Math.max(1, maxUploads);
  const progressPercent = isProPlan ? 100 : Math.max(0, Math.min(100, (remainingForProgress / freeLimitForProgress) * 100));

  const selectedPage = metaPages.find(p => p.id === selectedPageId);
  const displayName = selectedPage?.name || "Select Page";

  const handleLogout = () => {
    window.location.href = "/auth/logout";
  };

  const isPagesLoading = !!selectedAdAccountId &&
    needsPagesFetch &&
    (!isFallbackPagesFetched || isFallbackPagesFetching);
  const showAccountScopedSkeleton = !!selectedAdAccountId &&
    (
      isAdAccountSwitching ||
      updateAdAccountMutation.isPending ||
      isPagesLoading
    );
  const areBothAccountsReady = !showAccountScopedSkeleton;
  const pageAccessIssue = fallbackPagesData?.accessIssue || null;
  const pagesMissingPermission = pageAccessIssue === "missing_ad_account_permission";
  const facebookPagesEmptyMessage = pagesMissingPermission
    ? "This ad account is missing Facebook Page permissions. Reconnect Meta and include this account."
    : "No pages found for this ad account";
  const instagramDependencyMessage = pagesMissingPermission
    ? "Missing Facebook Page permissions for this ad account"
    : "Select a Facebook Page first";

  return (
    <Sidebar className="sidebar-pane border-r-0">
      <div className="px-4 pt-4 pb-1 mb-1">
        <Link href="/dashboard" className="flex items-center space-x-2.5 cursor-pointer" data-testid="link-header-logo">
          <img
            src="/favicon.png"
            alt="Auto-ads favicon"
            className="w-8 h-8 object-contain"
          />
          <span className="text-base font-bold tracking-tight text-foreground">Auto-ads</span>
        </Link>
      </div>

      <SidebarContent className="px-3">
        <nav className="space-y-0.5">
          {navigationItems.map((item) => {
            const isActive = location === item.url ||
              (item.url !== "/dashboard" && item.url !== "#" && location.startsWith(item.url));

            if ((item as any).comingSoon) {
              return (
                <div
                  key={item.title}
                  className="glass-nav-item flex items-center justify-between px-3 py-2 text-xs rounded-lg text-muted-foreground cursor-default"
                  data-testid={`link-nav-${item.title.toLowerCase()}`}
                >
                  <div className="flex items-center">
                    <span className="material-symbols-outlined mr-3 text-lg opacity-70">{item.icon}</span>
                    {item.title}
                  </div>
                  <span className="text-[9px] px-1.5 py-0.5 bg-muted rounded-full font-bold uppercase tracking-wider text-muted-foreground">Soon</span>
                </div>
              );
            }

            return (
              <Link
                key={item.title}
                href={item.url}
                className={`glass-nav-item flex items-center px-3 py-2 text-xs rounded-lg ${
                  isActive
                    ? "active text-foreground shadow-sm border border-white/40 dark:border-white/10"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                data-testid={`link-nav-${item.title.toLowerCase()}`}
              >
                <span className={`material-symbols-outlined mr-3 text-lg ${isActive ? "filled" : "opacity-70"}`}>{item.icon}</span>
                {item.title}
              </Link>
            );
          })}

          <div className="pt-5 pb-2 px-3">
            <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-[0.2em]">Management</span>
          </div>

          {managementItems.map((item) => {
            const isActive = location === item.url;
            return (
              <Link
                key={item.title}
                href={item.url}
                className={`glass-nav-item flex items-center px-3 py-2 text-xs rounded-lg ${
                  isActive
                    ? "active text-foreground shadow-sm border border-white/40 dark:border-white/10"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                data-testid={`link-nav-${item.title.toLowerCase()}`}
              >
                <span className={`material-symbols-outlined mr-3 text-lg ${isActive ? "filled" : "opacity-70"}`}>{item.icon}</span>
                {item.title}
              </Link>
            );
          })}

          <button
            onClick={handleLogout}
            className="glass-nav-item flex items-center px-3 py-2 text-xs rounded-lg text-muted-foreground hover:text-foreground w-full text-left"
            data-testid="button-logout"
          >
            <span className="material-symbols-outlined mr-3 text-lg opacity-70">logout</span>
            Log out
          </button>
        </nav>
      </SidebarContent>

      <SidebarFooter className="p-3">
        <div className="glass-card p-3 rounded-xl border-none space-y-2">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold uppercase">
                Ad Account
                {hasActiveJob && <Lock className="h-3 w-3 text-slate-400 inline ml-1" />}
              </span>
              {adAccounts.find(a => a.id === selectedAdAccountId)?.hasSettings && (
                <span className="text-[10px] font-bold text-emerald-500 bg-emerald-100/50 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full uppercase" data-testid="badge-ad-account-configured">
                  Configured
                </span>
              )}
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <Select
                    value={selectedAdAccountId}
                    onValueChange={handleAdAccountChange}
                    disabled={hasActiveJob}
                  >
                    <SelectTrigger className="w-full h-auto text-xs font-medium bg-white/40 dark:bg-white/5 p-1.5 rounded-md hover:bg-white/60 dark:hover:bg-white/10 border-none" data-testid="select-ad-account">
                      <SelectValue placeholder="Select ad account">
                        <span className="truncate text-foreground">
                          {adAccounts.find(a => a.id === selectedAdAccountId)?.name || "Select account"}
                        </span>
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {adAccounts.map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          <div className="flex items-center gap-2 w-full">
                            <span>{account.name}</span>
                            {account.hasSettings && (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 text-green-600">
                                Configured
                              </Badge>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </TooltipTrigger>
              {hasActiveJob && (
                <TooltipContent>
                  <p>Cannot change during active upload</p>
                </TooltipContent>
              )}
            </Tooltip>
          </div>

          {areBothAccountsReady ? (
            <div className="space-y-2">
              <div>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold uppercase mb-1">Facebook Page</p>
                {!selectedAdAccountId ? (
                  <span className="text-[10px] text-muted-foreground">Select ad account first</span>
                ) : metaPages.length === 0 ? (
                  <span className="text-[10px] text-muted-foreground">{facebookPagesEmptyMessage}</span>
                ) : isPageAutoSelected ? (
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-[#1877F2] flex items-center justify-center text-white shrink-0">
                      <SiFacebook className="w-3 h-3" />
                    </div>
                    <span className="text-xs font-medium text-foreground truncate" data-testid="text-facebook-page">
                      {displayName}
                    </span>
                  </div>
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div>
                        <Select
                          value={selectedPageId}
                          onValueChange={handleManualPageChange}
                          disabled={hasActiveJob}
                        >
                          <SelectTrigger className="w-full h-8 text-xs carved-input" data-testid="select-facebook-page">
                            <div className="flex items-center gap-2">
                              <div className="w-5 h-5 rounded-full bg-[#1877F2] flex items-center justify-center text-white shrink-0">
                                <SiFacebook className="w-3 h-3" />
                              </div>
                              <SelectValue placeholder="Select page">
                                <span className="truncate">{displayName}</span>
                              </SelectValue>
                            </div>
                          </SelectTrigger>
                          <SelectContent>
                            {metaPages.map((page) => (
                              <SelectItem key={page.id} value={page.id}>
                                <div className="flex items-center gap-2">
                                  <div className="w-5 h-5 rounded-full bg-[#1877F2] flex items-center justify-center text-white shrink-0">
                                    <SiFacebook className="w-3 h-3" />
                                  </div>
                                  <span>{page.name}</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </TooltipTrigger>
                    {hasActiveJob && (
                      <TooltipContent>
                        <p>Cannot change during active upload</p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                )}
              </div>

              <div>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold uppercase mb-1">Instagram</p>
                {!selectedAdAccountId ? (
                  <span className="text-[10px] text-muted-foreground">Select ad account first</span>
                ) : metaPages.length === 0 ? (
                  <span className="text-[10px] text-muted-foreground">{instagramDependencyMessage}</span>
                ) : instagramAccounts.length > 1 ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div>
                        <Select
                          value={selectedInstagram?.id || ""}
                          onValueChange={handleInstagramChange}
                          disabled={hasActiveJob}
                        >
                          <SelectTrigger className="w-full h-8 text-xs carved-input" data-testid="select-instagram-account">
                            <div className="flex items-center gap-2">
                              <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-[#f09433] via-[#e6683c] to-[#bc1888] flex items-center justify-center text-white shrink-0">
                                <SiInstagram className="w-3 h-3" />
                              </div>
                              <SelectValue placeholder="Select account">
                                <span className="truncate">{selectedInstagram?.username ? `@${selectedInstagram.username}` : (selectedInstagram?.name || displayName || "Select")}</span>
                              </SelectValue>
                            </div>
                          </SelectTrigger>
                          <SelectContent>
                            {instagramAccounts.map((account) => (
                              <SelectItem key={account.id} value={account.id}>
                                <div className="flex items-center gap-2">
                                  <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-[#f09433] via-[#e6683c] to-[#bc1888] flex items-center justify-center text-white shrink-0">
                                    <SiInstagram className="w-3 h-3" />
                                  </div>
                                  <span>@{account.username || account.name || account.id}</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </TooltipTrigger>
                    {hasActiveJob && (
                      <TooltipContent>
                        <p>Cannot change during active upload</p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                ) : (
                  <div className="flex items-center gap-2">
                    {selectedInstagram ? (
                      <>
                        <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-[#f09433] via-[#e6683c] to-[#bc1888] flex items-center justify-center text-white shrink-0">
                          <SiInstagram className="w-3 h-3" />
                        </div>
                        <span className="text-xs font-medium text-foreground truncate" data-testid="text-instagram-username">
                          {selectedInstagram.username ? `@${selectedInstagram.username}` : (selectedInstagram.name || displayName || "Page-backed")}
                        </span>
                      </>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">
                        No Instagram linked
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold uppercase mb-1">Facebook Page</p>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                  <span>Loading page...</span>
                </div>
              </div>
              <div>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold uppercase mb-1">Instagram</p>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                  <span>Loading Instagram...</span>
                </div>
              </div>
            </div>
          )}

          <div className="mt-3 pt-3 border-t border-slate-200/50 dark:border-white/10">
            <div
              className={isProPlan
                ? "rounded-xl px-2.5 py-2 border border-[#1877F2]/25 bg-gradient-to-br from-[#1877F2]/10 via-white/50 to-[#1877F2]/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.65),0_8px_18px_rgba(24,119,242,0.12)]"
                : ""
              }
            >
              <div className="flex justify-between items-center mb-1">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`text-xs ${
                      isProPlan
                        ? "font-semibold text-[#143d7a] tracking-[0.01em]"
                        : "font-medium text-slate-600 dark:text-slate-400"
                    }`}
                  >
                    {isProPlan ? "Pro Plan" : "Free Plan"}
                  </span>
                </div>
                <Link
                  href="/settings"
                  className={`text-xs font-bold ${
                    isProPlan
                      ? "text-[#1877F2] hover:text-[#0c5ed1] rounded-md px-1.5 py-0.5 bg-white/55 border border-[#1877F2]/20"
                      : "text-[#1877F2] hover:text-[#0c5ed1]"
                  }`}
                  data-testid="link-upgrade"
                >
                  {isProPlan ? "Manage" : "Upgrade"}
                </Link>
              </div>
              <div
                className={`w-full rounded-full overflow-hidden ${
                  isProPlan
                    ? "h-2 bg-[#1877F2]/18 border border-[#1877F2]/22 shadow-[inset_0_1px_2px_rgba(255,255,255,0.35)]"
                    : "h-1.5 bg-slate-200/50 dark:bg-slate-700/50"
                }`}
              >
                <div
                  className={`h-full rounded-full transition-all ${
                    isProPlan
                      ? "bg-gradient-to-r from-[#1877F2] via-[#6bb3ff] to-[#1877F2] shadow-[0_0_16px_rgba(24,119,242,0.68)]"
                      : "bg-[#1877F2] shadow-[0_0_10px_rgba(24,119,242,0.5)]"
                  }`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <p
                className={`text-[10px] mt-1.5 ${
                  isProPlan
                    ? "font-semibold text-[#4f6c93]"
                    : "text-slate-400 dark:text-slate-500"
                }`}
              >
                {isProPlan ? "Unlimited uploads" : `${uploadsRemaining ?? 0} free uploads remaining`}
              </p>
            </div>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
