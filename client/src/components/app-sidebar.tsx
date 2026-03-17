import { useState, useEffect, useRef } from "react";
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
import { Lock } from "lucide-react";
import { SiFacebook, SiInstagram } from "react-icons/si";
import { useAuth } from "@/hooks/use-auth";

interface MetaPage {
  id: string;
  name: string;
  source: string;
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

  const [isAdAccountSwitching, setIsAdAccountSwitching] = useState(false);

  // Single combined query — all sidebar data from DB cache, no Meta API calls
  const { data: sidebarData, isFetching: isSidebarFetching } = useQuery<SidebarData>({
    queryKey: ["/api/sidebar-data"],
  });

  // Fallback: if pages are empty (no DB cache yet), trigger /api/meta/pages to populate cache
  const needsPagesFetch = !isSidebarFetching &&
    !!sidebarData?.selectedAdAccountId &&
    (sidebarData?.pages?.length ?? 0) === 0;

  const { data: fallbackPagesData } = useQuery<{ data: MetaPage[]; selectedPageId: string | null }>({
    queryKey: ["/api/meta/pages"],
    enabled: needsPagesFetch,
  });

  // When /api/meta/pages finishes fetching, refresh sidebar-data to pick up newly cached pages
  useEffect(() => {
    if (fallbackPagesData?.data && fallbackPagesData.data.length > 0) {
      queryClient.invalidateQueries({ queryKey: ["/api/sidebar-data"] });
    }
  }, [fallbackPagesData]);

  const adAccounts = sidebarData?.adAccounts || [];
  const selectedAdAccountId = sidebarData?.selectedAdAccountId || "";
  const hasPendingAccounts = sidebarData?.hasPendingAccounts || false;
  const metaPages = sidebarData?.pages || [];
  const selectedPageId = sidebarData?.selectedPageId || "";
  const isPageAutoSelected = sidebarData?.autoSelected || metaPages.length === 1;
  const instagramAccounts = sidebarData?.instagramAccounts || [];
  const settings = sidebarData?.settings;
  const savedInstagramId = settings?.instagramPageId || "";
  const selectedInstagram = instagramAccounts.find(a => a.id === savedInstagramId) ||
    (instagramAccounts.length > 0 ? instagramAccounts[0] : null);

  const isPagesLoading = needsPagesFetch;
  const isInstagramLoading = false;
  const hasPageData = metaPages.length > 0 && selectedPageId;
  const areBothAccountsReady = !isAdAccountSwitching &&
    (hasPageData || (!isPagesLoading && selectedPageId)) &&
    !isInstagramLoading;

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
      queryClient.invalidateQueries({ queryKey: ["/api/meta/pages"] });
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
      setIsAdAccountSwitching(false);
      // Invalidate everything — sidebar-data will re-read from DB cache
      await queryClient.invalidateQueries({ queryKey: ["/api/sidebar-data"] });
      queryClient.invalidateQueries({ queryKey: ["/api/meta/ad-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/meta/campaigns"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["/api/meta/insights"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["/api/meta/ad-statistics"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["/api/ad-account-settings"], exact: false });
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

  const uploadsRemaining = settings?.uploadsRemaining ?? 15;
  const maxUploads = 15;
  const progressPercent = (uploadsRemaining / maxUploads) * 100;

  const selectedPage = metaPages.find(p => p.id === selectedPageId);
  const displayName = selectedPage?.name || "Select Page";

  const handleLogout = () => {
    window.location.href = "/auth/logout";
  };

  return (
    <Sidebar className="sidebar-pane border-r-0">
      <div className="px-4 pt-4 pb-1 mb-1">
        <Link href="/dashboard" className="flex items-center space-x-2.5 cursor-pointer" data-testid="link-header-logo">
          <div className="w-8 h-8 rounded-lg bg-white/80 dark:bg-white/10 flex items-center justify-center shadow-sm border border-white/50 dark:border-white/10">
            <span className="material-symbols-outlined text-[#1877F2] text-lg font-bold">bubble_chart</span>
          </div>
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
                {isPageAutoSelected ? (
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
                {instagramAccounts.length > 1 ? (
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
                <div className="flex items-center gap-2">
                  <div className="h-5 w-5 rounded-full bg-muted animate-pulse shrink-0" />
                  <div className="h-3 w-20 bg-muted animate-pulse rounded" />
                </div>
              </div>
              <div>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold uppercase mb-1">Instagram</p>
                <div className="flex items-center gap-2">
                  <div className="h-5 w-5 rounded-full bg-muted animate-pulse shrink-0" />
                  <div className="h-3 w-16 bg-muted animate-pulse rounded" />
                </div>
              </div>
            </div>
          )}

          <div className="mt-3 pt-3 border-t border-slate-200/50 dark:border-white/10">
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Free Plan</span>
              <Link href="/settings" className="text-xs font-bold text-[#1877F2] hover:text-[#0c5ed1]" data-testid="link-upgrade">
                Upgrade
              </Link>
            </div>
            <div className="w-full h-1.5 bg-slate-200/50 dark:bg-slate-700/50 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#1877F2] rounded-full shadow-[0_0_10px_rgba(24,119,242,0.5)] transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1.5">{uploadsRemaining} free uploads remaining</p>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
