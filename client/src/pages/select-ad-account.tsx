import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Building2, Check, ChevronRight, Loader2, Plug, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface SidebarGateData {
  hasPendingAccounts: boolean;
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

function getAccountStatusBadge(accountStatus: number) {
  if (accountStatus === 1) {
    return { label: "ACTIVE", className: "border-success/25 bg-success/10 text-success" };
  }
  if (accountStatus === 3) {
    return { label: "UNSETTLED", className: "border-warning/30 bg-warning/10 text-warning" };
  }
  return { label: "INACTIVE", className: "border-border bg-muted text-muted-foreground" };
}

function describePendingAccessIssue(issue?: string | null) {
  if (issue === "missing_ad_account_permission") return "Missing ad-account permission";
  if (issue === "meta_auth_error") return "Meta auth/token issue";
  if (issue === "meta_fetch_error") return "Meta fetch issue";
  if (issue === "no_promotable_pages") return "No promotable Pages";
  return "Unavailable";
}

export default function SelectAdAccountPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [selectedPendingAdAccountIds, setSelectedPendingAdAccountIds] = useState<string[]>([]);

  const {
    data: sidebarData,
    isLoading: isSidebarDataLoading,
    isError: isSidebarDataError,
  } = useQuery<SidebarGateData>({
    queryKey: ["/api/sidebar-data"],
    staleTime: 0,
    refetchOnMount: "always",
  });

  const hasPendingAccounts = sidebarData?.hasPendingAccounts === true;

  const {
    data: pendingAdAccountsData,
    isLoading: isPendingAdAccountsLoading,
    isError: isPendingAdAccountsError,
    refetch: refetchPendingAdAccounts,
  } = useQuery<PendingAdAccountsResponse>({
    queryKey: ["/api/meta/pending-ad-accounts"],
    enabled: hasPendingAccounts,
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
  const selectableIds = useMemo(
    () => selectablePendingAdAccounts.map((acc) => acc.id),
    [selectablePendingAdAccounts],
  );
  const selectableIdSet = useMemo(() => new Set(selectableIds), [selectableIds]);
  const selectedPendingAdAccountIdSet = useMemo(
    () => new Set(selectedPendingAdAccountIds),
    [selectedPendingAdAccountIds],
  );
  const allSelected =
    selectableIds.length > 0 &&
    selectableIds.every((id) => selectedPendingAdAccountIdSet.has(id));

  useEffect(() => {
    if (!isSidebarDataLoading && !hasPendingAccounts && !isSidebarDataError) {
      setLocation("/dashboard", { replace: true });
    }
  }, [hasPendingAccounts, isSidebarDataLoading, isSidebarDataError, setLocation]);

  useEffect(() => {
    setSelectedPendingAdAccountIds((prev) => {
      const next = prev.filter((id) => selectableIdSet.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [selectableIdSet]);

  const confirmPendingAccountsMutation = useMutation({
    mutationFn: async (adAccountIds: string[]) => {
      const res = await apiRequest("POST", "/api/meta/confirm-ad-account", { adAccountIds });
      return res.json();
    },
    onSuccess: (data: any) => {
      const savedCount = Number(data?.savedCount || selectedPendingAdAccountIds.length || 0);
      toast({
        title: "Ad accounts selected",
        description:
          savedCount > 0
            ? `${savedCount} ad account${savedCount === 1 ? "" : "s"} saved.`
            : "Selection saved.",
      });

      queryClient.setQueryData(["/api/sidebar-data"], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          hasPendingAccounts: false,
          adAccounts: Array.isArray(data?.adAccounts) ? data.adAccounts : old.adAccounts,
          selectedAdAccountId: data?.selectedAdAccountId || old.selectedAdAccountId || null,
        };
      });

      queryClient.invalidateQueries({ queryKey: ["/api/sidebar-data"] });
      queryClient.invalidateQueries({ queryKey: ["/api/meta/ad-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/meta/pending-ad-accounts"] });
      queryClient.removeQueries({ queryKey: ["/api/meta/pages"] });
      queryClient.removeQueries({ queryKey: ["/api/meta/instagram-accounts"], exact: false });
      queryClient.removeQueries({ queryKey: ["sidebar-meta-pages"] });
      setLocation("/dashboard", { replace: true });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to save ad accounts",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const toggleAccount = (id: string) => {
    setSelectedPendingAdAccountIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const toggleSelectAll = () => {
    setSelectedPendingAdAccountIds(allSelected ? [] : selectableIds);
  };

  if (isSidebarDataLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="liquid-bg">
        <div className="blob blob-1" />
        <div className="blob blob-2" />
        <div className="blob blob-3" />
      </div>

      {/* Plus Jakarta Sans was named here but never loaded, so this silently
          fell back to the generic sans. The app's font stack is on :root. */}
      <div className="relative z-10 flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-[560px] rounded-[28px] border border-card-border bg-card/70 p-6 shadow-lg backdrop-blur-2xl sm:p-8">
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Select Ad Accounts</h1>
          <p className="mt-3 text-base leading-snug text-muted-foreground sm:text-lg">
            Select which ad accounts you want to manage with Auto-ads. You can select multiple accounts for bulk launching.
          </p>

          <div className="mt-5 rounded-2xl border border-success/25 bg-success/10 px-4 py-3 backdrop-blur-sm">
            <div className="flex items-start gap-3 text-success">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
              <p className="text-sm sm:text-[15px]">
                <span className="font-semibold">Your data is safe.</span> We only use features for adding ads and reading data for campaign optimization.
              </p>
            </div>
          </div>

          {isPendingAdAccountsLoading ? (
            <div className="py-8 text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading ad accounts...
            </div>
          ) : isPendingAdAccountsError ? (
            <div className="mt-6 space-y-3">
              <p className="text-sm text-muted-foreground">We could not load pending ad accounts. Please try again.</p>
              <Button variant="outline" onClick={() => refetchPendingAdAccounts()}>
                Retry
              </Button>
            </div>
          ) : selectablePendingAdAccounts.length === 0 ? (
            <div className="mt-6 space-y-3">
              <p className="text-sm text-muted-foreground">
                No selectable ad accounts are available right now. Reconnect Meta and include ad accounts with promotable Facebook Pages.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => { window.location.href = "/auth/meta/start"; }} data-testid="button-reconnect-meta-from-select">
                  <Plug className="mr-2 h-4 w-4" />
                  Reconnect Meta
                </Button>
                <Button variant="secondary" onClick={() => setLocation("/connections")} data-testid="button-open-connections-from-select">
                  Open Connections
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-6 space-y-1.5">
              <button
                type="button"
                onClick={toggleSelectAll}
                aria-pressed={allSelected}
                className={`flex w-full items-center gap-4 rounded-xl border px-3 py-2.5 text-left backdrop-blur-sm transition duration-150 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card ${
                  allSelected
                    ? "border-primary/45 bg-primary/10"
                    : "border-border bg-background/50 hover:bg-muted"
                }`}
              >
                <span className={`flex h-8 w-8 items-center justify-center rounded-full border transition duration-150 ${
                  allSelected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-background text-transparent"
                }`}>
                  <Check className={`h-4 w-4 transition duration-150 ${allSelected ? "scale-100 opacity-100" : "scale-75 opacity-0"}`} />
                </span>
                <span className="text-base font-semibold leading-none text-foreground">Select all accounts</span>
              </button>

              <div className="max-h-[420px] space-y-1 overflow-y-auto pr-1">
                {selectablePendingAdAccounts.map((acc) => {
                  const checked = selectedPendingAdAccountIdSet.has(acc.id);
                  const status = getAccountStatusBadge(Number(acc.account_status));
                  return (
                    <button
                      key={acc.id}
                      type="button"
                      onClick={() => toggleAccount(acc.id)}
                      aria-pressed={checked}
                      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left backdrop-blur-sm transition duration-150 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card ${
                        checked
                          ? "border-primary/45 bg-primary/10"
                          : "border-border bg-background/50 hover:bg-muted"
                      }`}
                    >
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition duration-150 ${
                        checked
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input bg-background text-transparent"
                      }`}>
                        <Check className={`h-4 w-4 transition duration-150 ${checked ? "scale-100 opacity-100" : "scale-75 opacity-0"}`} />
                      </span>

                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition duration-150 ${
                        checked
                          ? "border-primary/25 bg-primary/10 text-primary"
                          : "border-border bg-background text-muted-foreground"
                      }`}>
                        <Building2 className="h-5 w-5" />
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-base font-semibold leading-tight text-foreground">
                          {acc.name || acc.id}
                        </span>
                        <span className="mt-0.5 block truncate font-mono text-xs leading-none text-muted-foreground">
                          {acc.id}
                        </span>
                      </span>

                      <span className={`rounded-full border px-3 py-1 text-xs font-semibold tracking-wide sm:text-sm ${status.className}`}>
                        {status.label}
                      </span>
                    </button>
                  );
                })}
              </div>

              {blockedPendingAdAccounts.length > 0 && (
                <div className="pt-2 text-xs text-warning">
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
                className="mt-4 h-14 w-full rounded-2xl text-base font-semibold shadow-lg shadow-primary/20 transition duration-150 active:scale-[0.99] disabled:cursor-not-allowed disabled:shadow-none"
                data-testid="button-confirm-select-ad-account"
              >
                {confirmPendingAccountsMutation.isPending ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : null}
                Confirm selection ({selectedPendingAdAccountIds.length})
                <ChevronRight className="ml-1 h-5 w-5" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
