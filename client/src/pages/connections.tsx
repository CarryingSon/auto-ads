import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Building2, Check, CheckCircle2, ChevronRight, XCircle, RefreshCw, Unplug, Plug, Info, AlertTriangle, ShieldCheck } from "lucide-react";
import { SiFacebook } from "react-icons/si";

interface AuthStatus {
  meta: {
    status: string;
    accountName?: string;
    accountEmail?: string;
    connectedAt?: string;
    lastTestedAt?: string;
    scopes?: string[];
    missingScopes?: string[];
    adAccounts?: Array<{ id: string; name: string; account_status: number }>;
    pages?: Array<{ id: string; name: string }>;
    selectedAdAccountId?: string;
    selectedPageId?: string;
  };
}

interface MetaPagesResponse {
  data: Array<{ id: string; name: string }>;
  selectedPageId?: string | null;
  accessIssue?:
    | "missing_ad_account_permission"
    | "no_promotable_pages"
    | "meta_auth_error"
    | "meta_not_connected"
    | "meta_fetch_error"
    | null;
}

interface PendingAdAccount {
  id: string;
  name: string;
  account_status: number;
  access_verified?: boolean;
  access_issue?: string | null;
  promotable_pages_count?: number;
}

interface PendingAdAccountsResponse {
  accounts: PendingAdAccount[];
}

function getPendingAccountStatusBadge(accountStatus: number) {
  if (accountStatus === 1) {
    return { label: "ACTIVE", className: "border-emerald-200 bg-emerald-100 text-emerald-700" };
  }
  if (accountStatus === 3) {
    return { label: "UNSETTLED", className: "border-orange-200 bg-orange-100 text-orange-700" };
  }
  return { label: "UNKNOWN", className: "border-slate-200 bg-slate-100 text-slate-600" };
}

export default function Connections() {
  const { toast } = useToast();
  const search = useSearch();
  const [, setLocation] = useLocation();

  const { data: authStatus, isLoading, refetch } = useQuery<AuthStatus>({
    queryKey: ["/auth/status"],
  });

  useEffect(() => {
    const params = new URLSearchParams(search);
    const metaResult = params.get("meta");
    const message = params.get("message");

    if (metaResult === "connected") {
      toast({ title: "Meta connected", description: "Your Facebook account has been connected successfully." });
      refetch();
      // Let LoginGate route pending-account users to /select-ad-account.
      setLocation("/dashboard", { replace: true });
    } else if (metaResult === "error") {
      toast({ title: "Meta connection failed", description: message || "Something went wrong.", variant: "destructive" });
      setLocation("/connections", { replace: true });
    }
  }, [search, toast, refetch, setLocation]);

  const testMetaMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/auth/meta/test");
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({ title: "Meta connection verified", description: "Connection is working correctly." });
      } else {
        toast({ title: "Meta connection issue", description: data.error, variant: "destructive" });
      }
      refetch();
    },
  });

  const disconnectMetaMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/auth/meta/disconnect");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Meta disconnected" });
      refetch();
    },
  });

  const selectedAdAccountId = authStatus?.meta?.selectedAdAccountId || "";
  const metaConnected = authStatus?.meta?.status === "connected";
  const metaExpired = authStatus?.meta?.status === "expired";
  const usableMetaAdAccounts = authStatus?.meta?.adAccounts || [];
  const missingMetaScopes = authStatus?.meta?.missingScopes || [];
  const missingPagePermissions = missingMetaScopes.some((scope) => scope.startsWith("pages_"));
  const [selectedPendingAdAccountIds, setSelectedPendingAdAccountIds] = useState<string[]>([]);

  const {
    data: pendingAdAccountsData,
    refetch: refetchPendingAdAccounts,
  } = useQuery<PendingAdAccountsResponse>({
    queryKey: ["/api/meta/pending-ad-accounts"],
    enabled: metaConnected,
    queryFn: async () => {
      const res = await fetch("/api/meta/pending-ad-accounts", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch pending ad accounts");
      return res.json();
    },
    staleTime: 0,
  });
  const pendingAdAccounts = useMemo(
    () => pendingAdAccountsData?.accounts || [],
    [pendingAdAccountsData?.accounts],
  );
  const selectablePendingAdAccounts = useMemo(
    () => pendingAdAccounts.filter((acc) => acc?.access_verified !== false),
    [pendingAdAccounts],
  );
  const blockedPendingAdAccounts = useMemo(
    () => pendingAdAccounts.filter((acc) => acc?.access_verified === false),
    [pendingAdAccounts],
  );
  const selectablePendingIds = useMemo(
    () => selectablePendingAdAccounts.map((acc) => acc.id),
    [selectablePendingAdAccounts],
  );
  const selectablePendingIdSet = useMemo(() => new Set(selectablePendingIds), [selectablePendingIds]);
  const selectedPendingAdAccountIdSet = useMemo(
    () => new Set(selectedPendingAdAccountIds),
    [selectedPendingAdAccountIds],
  );
  const allPendingSelected =
    selectablePendingIds.length > 0 &&
    selectablePendingIds.every((id) => selectedPendingAdAccountIdSet.has(id));
  const metaHasPendingSelection = metaConnected && usableMetaAdAccounts.length === 0 && selectablePendingAdAccounts.length > 0;
  const metaNeedsAdAccount = metaConnected && usableMetaAdAccounts.length === 0 && selectablePendingAdAccounts.length === 0;

  useEffect(() => {
    if (metaHasPendingSelection) {
      setLocation("/select-ad-account", { replace: true });
    }
  }, [metaHasPendingSelection, setLocation]);

  useEffect(() => {
    if (!metaHasPendingSelection) {
      setSelectedPendingAdAccountIds([]);
      return;
    }
    setSelectedPendingAdAccountIds((prev) => {
      const next = prev.filter((id) => selectablePendingIdSet.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [metaHasPendingSelection, selectablePendingIdSet]);

  const {
    data: pagesData,
    refetch: refetchPages,
  } = useQuery<MetaPagesResponse>({
    queryKey: ["connections-meta-pages", selectedAdAccountId || "none"],
    enabled: metaConnected && !!selectedAdAccountId,
    queryFn: async () => {
      const res = await fetch("/api/meta/pages?refresh=true", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch Meta pages");
      return res.json();
    },
    staleTime: 0,
  });

  const updateAssetsMutation = useMutation({
    mutationFn: async (data: { selectedAdAccountId?: string; selectedPageId?: string }) => {
      if (data.selectedAdAccountId) {
        const res = await apiRequest("PATCH", "/api/meta/ad-accounts/selected", {
          adAccountId: data.selectedAdAccountId,
        });
        return res.json();
      }
      if (data.selectedPageId) {
        const res = await apiRequest("PATCH", "/api/meta/pages/selected", {
          pageId: data.selectedPageId,
        });
        return res.json();
      }
      return { success: true };
    },
    onSuccess: () => {
      toast({ title: "Defaults updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/sidebar-data"] });
      queryClient.invalidateQueries({ queryKey: ["/api/meta/pages"] });
      refetch();
      refetchPages();
    },
  });

  const confirmPendingAccountsMutation = useMutation({
    mutationFn: async (adAccountIds: string[]) => {
      const res = await apiRequest("POST", "/api/meta/confirm-ad-account", { adAccountIds });
      return res.json();
    },
    onSuccess: (data: any) => {
      const savedCount = Number(data?.savedCount || selectedPendingAdAccountIds.length || 0);
      toast({
        title: "Ad accounts selected",
        description: savedCount > 0
          ? `${savedCount} ad account${savedCount === 1 ? "" : "s"} saved.`
          : "Selection saved.",
      });
      setSelectedPendingAdAccountIds([]);
      queryClient.invalidateQueries({ queryKey: ["/api/sidebar-data"] });
      queryClient.invalidateQueries({ queryKey: ["/api/meta/ad-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/meta/pending-ad-accounts"] });
      refetch();
      refetchPages();
      refetchPendingAdAccounts();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to save ad accounts",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const togglePendingAdAccountSelection = (adAccountId: string) => {
    setSelectedPendingAdAccountIds((prev) =>
      prev.includes(adAccountId)
        ? prev.filter((id) => id !== adAccountId)
        : [...prev, adAccountId],
    );
  };

  const toggleAllPendingAdAccounts = () => {
    setSelectedPendingAdAccountIds(allPendingSelected ? [] : selectablePendingIds);
  };

  const pageOptions = pagesData?.data || [];
  const selectedPageValue = pagesData?.selectedPageId ?? authStatus?.meta?.selectedPageId ?? "";
  const pagesAccessIssue = pagesData?.accessIssue || null;
  const pagesEmptyHint = pagesAccessIssue === "missing_ad_account_permission"
    ? "This ad account is missing Facebook Page permissions. Reconnect Meta and include this ad account."
    : pagesAccessIssue === "no_promotable_pages"
      ? "Page access was granted, but this ad account has no promotable Pages. Assign the Page to this ad account in Business Manager or choose another ad account."
      : "No Pages were found for this ad account.";
  const describePendingAccessIssue = (issue?: string | null) => {
    if (issue === "missing_ad_account_permission") return "Missing ad-account permission";
    if (issue === "meta_auth_error") return "Meta auth/token issue";
    if (issue === "meta_fetch_error") return "Meta fetch issue";
    if (issue === "no_promotable_pages") return "No promotable Pages";
    return "Unavailable";
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-2 pb-8 pt-2 md:px-4">
      <div className="rounded-2xl border border-white/60 bg-white/60 p-5 shadow-[0_8px_30px_-20px_rgba(15,23,42,0.5)] backdrop-blur-sm dark:border-white/10 dark:bg-slate-900/45">
        <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-page-title">Connections</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect your Meta Ads account to enable bulk uploads and keep launch defaults in sync.
        </p>
      </div>

      <div className="grid gap-4">
        <Card data-testid="card-connection-meta" className="overflow-hidden border border-white/70 bg-white/80 shadow-[0_16px_34px_-24px_rgba(15,23,42,0.65)] backdrop-blur-sm dark:border-white/10 dark:bg-slate-900/55">
          <div className="h-1 w-full bg-gradient-to-r from-[#1877F2] via-sky-400 to-emerald-400" />
          <CardHeader className="pb-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#1877F2]/10 ring-1 ring-[#1877F2]/15 dark:bg-[#1877F2]/20 dark:ring-[#1877F2]/30">
                  <SiFacebook className="h-6 w-6 text-[#1877F2]" />
                </div>
                <div>
                  <CardTitle className="text-lg">Meta Ads</CardTitle>
                  <CardDescription>Facebook & Instagram advertising</CardDescription>
                </div>
              </div>
              <Badge
                variant={metaNeedsAdAccount || metaHasPendingSelection ? "destructive" : metaConnected ? "default" : metaExpired ? "destructive" : "secondary"}
                className={metaNeedsAdAccount || metaHasPendingSelection ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" : metaConnected ? "bg-green-500/10 text-green-600 dark:text-green-400" : ""}
                data-testid="badge-meta-status"
              >
                {metaNeedsAdAccount || metaHasPendingSelection ? (
                  <>
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    {metaHasPendingSelection ? "Select ad accounts" : "Action required"}
                  </>
                ) : metaConnected ? (
                  <>
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Connected
                  </>
                ) : metaExpired ? (
                  <>
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    Expired
                  </>
                ) : (
                  <>
                    <XCircle className="h-3 w-3 mr-1" />
                    Disconnected
                  </>
                )}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {metaConnected && authStatus?.meta?.accountName && (
              <div className="rounded-xl border border-slate-200/70 bg-slate-50/75 p-3 dark:border-slate-700/60 dark:bg-slate-800/40">
                <p className="text-sm font-medium">{authStatus.meta.accountName}</p>
                {authStatus.meta.accountEmail && (
                  <p className="text-xs text-muted-foreground">{authStatus.meta.accountEmail}</p>
                )}
              </div>
            )}

            {metaNeedsAdAccount && (
              <div className="rounded-md border border-amber-300/60 bg-amber-50/80 p-3 text-sm text-amber-900 dark:border-amber-500/50 dark:bg-amber-500/10 dark:text-amber-200">
                Meta account is connected, but no usable ad accounts were found. Reconnect Meta and include an ad account that has promotable Facebook Pages.
              </div>
            )}

            {metaHasPendingSelection && (
              <div className="rounded-md border border-amber-300/60 bg-amber-50/80 p-3 text-sm text-amber-900 dark:border-amber-500/50 dark:bg-amber-500/10 dark:text-amber-200">
                New ad accounts require confirmation. Use the selection window to continue.
              </div>
            )}

            {metaConnected && missingPagePermissions && (
              <div className="rounded-md border border-amber-300/60 bg-amber-50/80 p-3 text-sm text-amber-900 dark:border-amber-500/50 dark:bg-amber-500/10 dark:text-amber-200">
                Meta is connected, but this token is missing Page permissions ({missingMetaScopes.join(", ")}). Reconnect Meta and approve all requested Pages.
              </div>
            )}

            {metaConnected && usableMetaAdAccounts.length > 0 && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Default Ad Account</label>
                  <Select
                    value={authStatus.meta.selectedAdAccountId || ""}
                    onValueChange={(val) => updateAssetsMutation.mutate({ selectedAdAccountId: val })}
                  >
                    <SelectTrigger data-testid="select-ad-account" className="bg-background/80">
                      <SelectValue placeholder="Select ad account" />
                    </SelectTrigger>
                    <SelectContent>
                      {usableMetaAdAccounts.map((acc) => (
                        <SelectItem key={acc.id} value={acc.id}>
                          {acc.name || acc.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {pageOptions.length > 0 && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Default Page</label>
                    <Select
                      value={selectedPageValue}
                      onValueChange={(val) => updateAssetsMutation.mutate({ selectedPageId: val })}
                    >
                      <SelectTrigger data-testid="select-page" className="bg-background/80">
                        <SelectValue placeholder="Select page" />
                      </SelectTrigger>
                      <SelectContent>
                        {pageOptions.map((page) => (
                          <SelectItem key={page.id} value={page.id}>
                            {page.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {selectedAdAccountId && pageOptions.length === 0 && (
                  <div className="rounded-md border border-amber-300/60 bg-amber-50/80 p-3 text-sm text-amber-900 dark:border-amber-500/50 dark:bg-amber-500/10 dark:text-amber-200">
                    {pagesEmptyHint}
                  </div>
                )}
              </div>
            )}

            <div className="rounded-xl border border-slate-200/70 bg-slate-50/70 p-4 dark:border-slate-700/60 dark:bg-slate-800/35">
              <div className="flex items-center gap-2 mb-2">
                <Info className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Permissions requested</span>
              </div>
              <ul className="ml-6 space-y-1 text-sm text-muted-foreground">
                <li className="list-disc">Manage ad accounts and campaigns</li>
                <li className="list-disc">Access your Facebook Pages</li>
                <li className="list-disc">Access linked Instagram account profile</li>
                <li className="list-disc">Upload video creatives</li>
              </ul>
            </div>

            <Separator />

            <div className="flex flex-wrap gap-2 sm:justify-end">
              {metaConnected || metaExpired ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => testMetaMutation.mutate()}
                    disabled={testMetaMutation.isPending}
                    className="bg-white/70 dark:bg-slate-900/40"
                    data-testid="button-test-meta"
                  >
                    {testMetaMutation.isPending ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    Test
                  </Button>
                  {metaExpired && (
                    <Button
                      size="sm"
                      onClick={() => window.location.href = "/auth/meta/start"}
                      data-testid="button-reconnect-meta"
                    >
                      <Plug className="h-4 w-4 mr-2" />
                      Reconnect
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => disconnectMetaMutation.mutate()}
                    className="bg-white/70 text-destructive hover:text-destructive dark:bg-slate-900/40"
                    disabled={disconnectMetaMutation.isPending}
                    data-testid="button-disconnect-meta"
                  >
                    <Unplug className="h-4 w-4 mr-2" />
                    Disconnect
                  </Button>
                </>
              ) : (
                <Button
                  onClick={() => window.location.href = "/auth/meta/start"}
                  data-testid="button-connect-meta"
                >
                  <Plug className="h-4 w-4 mr-2" />
                  Connect Meta
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

      </div>

      <Dialog open={metaHasPendingSelection}>
        <DialogContent className="sm:max-w-[840px] rounded-[28px] border border-white/70 bg-white/95 p-6 shadow-[0_28px_90px_rgba(60,78,108,0.22)] backdrop-blur-xl sm:p-8 [&>button]:hidden">
          <DialogHeader className="text-left">
            <DialogTitle className="text-3xl font-bold tracking-tight text-[#151f3b] sm:text-4xl">
              Select Ad Accounts
            </DialogTitle>
            <DialogDescription className="mt-2 text-base leading-snug text-[#5f6f8f] sm:text-lg">
              Select which ad accounts you want to manage with Auto-ads. You can select multiple accounts for bulk launching.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-2 rounded-2xl border border-emerald-200/80 bg-emerald-50/55 px-4 py-3">
            <div className="flex items-start gap-3 text-emerald-800">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
              <p className="text-sm sm:text-[15px]">
                <span className="font-semibold">Your data is safe.</span> We only use features for adding ads and reading data for campaign optimization.
              </p>
            </div>
          </div>

          <div className="mt-3 space-y-2">
            <button
              type="button"
              onClick={toggleAllPendingAdAccounts}
              aria-pressed={allPendingSelected}
              className={`flex w-full items-center gap-4 rounded-2xl border px-4 py-4 text-left transition duration-150 active:scale-[0.99] ${
                allPendingSelected
                  ? "border-[#1877F2]/45 bg-[#1877F2]/10 shadow-[0_8px_22px_rgba(24,119,242,0.12)]"
                  : "border-slate-200 bg-slate-50 hover:bg-slate-100"
              }`}
            >
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition duration-150 ${
                allPendingSelected
                  ? "border-[#1877F2] bg-[#1877F2] text-white shadow-[0_6px_14px_rgba(24,119,242,0.28)]"
                  : "border-slate-300 bg-white text-transparent"
              }`}>
                <Check className={`h-4 w-4 transition duration-150 ${allPendingSelected ? "scale-100 opacity-100" : "scale-75 opacity-0"}`} />
              </span>
              <span className="text-xl leading-none font-medium text-[#24304a] sm:text-2xl">Select all accounts</span>
            </button>

            <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
              {selectablePendingAdAccounts.map((acc) => {
                const checked = selectedPendingAdAccountIdSet.has(acc.id);
                const status = getPendingAccountStatusBadge(Number(acc.account_status));
                return (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => togglePendingAdAccountSelection(acc.id)}
                    aria-pressed={checked}
                    className={`flex w-full items-center gap-4 rounded-2xl border px-4 py-4 text-left transition duration-150 active:scale-[0.99] ${
                      checked
                        ? "border-[#1877F2]/45 bg-[#1877F2]/10 shadow-[0_8px_22px_rgba(24,119,242,0.12)]"
                        : "border-slate-200 bg-slate-50 hover:bg-slate-100"
                    }`}
                  >
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition duration-150 ${
                      checked
                        ? "border-[#1877F2] bg-[#1877F2] text-white shadow-[0_6px_14px_rgba(24,119,242,0.28)]"
                        : "border-slate-300 bg-white text-transparent"
                    }`}>
                      <Check className={`h-4 w-4 transition duration-150 ${checked ? "scale-100 opacity-100" : "scale-75 opacity-0"}`} />
                    </span>

                    <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border transition duration-150 ${
                      checked
                        ? "border-[#1877F2]/20 bg-[#1877F2]/10 text-[#1877F2]"
                        : "border-slate-200 bg-slate-100 text-[#7587a8]"
                    }`}>
                      <Building2 className="h-6 w-6" />
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[22px] leading-none font-semibold text-[#1d2845] sm:text-[26px]">
                        {acc.name || acc.id}
                      </span>
                      <span className="mt-2 block truncate text-sm leading-none text-[#8a98b5] sm:text-lg">
                        {acc.id}
                      </span>
                    </span>

                    <span className={`rounded-full border px-4 py-1.5 text-xs font-semibold tracking-wide sm:text-sm ${status.className}`}>
                      {status.label}
                    </span>
                  </button>
                );
              })}
            </div>

            {blockedPendingAdAccounts.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                {blockedPendingAdAccounts.length} account(s) are unavailable:
                {blockedPendingAdAccounts.map((acc) => (
                  <div key={`blocked-${acc.id}`}>
                    {acc.name || acc.id} ({describePendingAccessIssue(acc.access_issue)})
                  </div>
                ))}
              </div>
            )}

            <Button
              onClick={() => confirmPendingAccountsMutation.mutate(selectedPendingAdAccountIds)}
              disabled={confirmPendingAccountsMutation.isPending || selectedPendingAdAccountIds.length === 0}
              className="mt-4 h-14 w-full rounded-2xl border border-[#1877F2]/70 bg-[#1877F2] text-lg font-semibold text-white shadow-[0_12px_28px_rgba(24,119,242,0.26)] transition duration-150 hover:bg-[#166fe5] active:scale-[0.99] disabled:cursor-not-allowed disabled:border-[#1877F2]/15 disabled:bg-[#1877F2]/35 disabled:text-white/75 disabled:shadow-none disabled:opacity-100 sm:text-xl"
              data-testid="button-confirm-pending-ad-accounts"
            >
              {confirmPendingAccountsMutation.isPending ? (
                <RefreshCw className="mr-2 h-5 w-5 animate-spin" />
              ) : null}
              Confirm selection ({selectedPendingAdAccountIds.length})
              <ChevronRight className="ml-1 h-5 w-5" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Card className="border border-slate-200/70 bg-white/65 shadow-[0_12px_30px_-24px_rgba(15,23,42,0.6)] backdrop-blur-sm dark:border-slate-700/60 dark:bg-slate-900/40">
        <CardContent className="py-6">
          <div className="flex items-start gap-4">
            <Info className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium">Security Information</p>
              <p className="text-sm text-muted-foreground">
                Your connection tokens are securely encrypted and stored. We only request the minimum 
                permissions needed to upload videos and create ads. You can disconnect at any time 
                to revoke access.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
