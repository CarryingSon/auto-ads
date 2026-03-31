import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Building2, Loader2, ShieldCheck } from "lucide-react";
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
    return { label: "ACTIVE", className: "border-emerald-200 bg-emerald-100 text-emerald-700" };
  }
  if (accountStatus === 3) {
    return { label: "UNSETTLED", className: "border-orange-200 bg-orange-100 text-orange-700" };
  }
  return { label: "INACTIVE", className: "border-slate-200 bg-slate-100 text-slate-600" };
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

  const pendingAdAccounts = pendingAdAccountsData?.accounts || [];
  const selectablePendingAdAccounts = pendingAdAccounts.filter((acc) => acc?.access_verified !== false);
  const blockedPendingAdAccounts = pendingAdAccounts.filter((acc) => acc?.access_verified === false);
  const selectableIds = useMemo(
    () => selectablePendingAdAccounts.map((acc) => acc.id),
    [selectablePendingAdAccounts],
  );
  const allSelected =
    selectableIds.length > 0 &&
    selectableIds.every((id) => selectedPendingAdAccountIds.includes(id));

  useEffect(() => {
    if (!isSidebarDataLoading && !hasPendingAccounts && !isSidebarDataError) {
      setLocation("/dashboard", { replace: true });
    }
  }, [hasPendingAccounts, isSidebarDataLoading, isSidebarDataError, setLocation]);

  useEffect(() => {
    setSelectedPendingAdAccountIds((prev) =>
      prev.filter((id) => selectablePendingAdAccounts.some((acc) => acc.id === id)),
    );
  }, [selectablePendingAdAccounts]);

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

      <div className="relative z-10 flex min-h-screen items-center justify-center p-4" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", letterSpacing: "0.01em" }}>
        <div className="w-full max-w-[560px] rounded-[28px] border border-white/65 bg-white/55 p-6 shadow-[0_28px_90px_rgba(60,78,108,0.18)] backdrop-blur-2xl sm:p-8 dark:border-white/20 dark:bg-white/10">
          <h1 className="text-3xl font-bold tracking-tight text-[#151f3b] sm:text-4xl">Select Ad Accounts</h1>
          <p className="mt-3 text-base leading-snug text-[#5f6f8f] sm:text-lg">
            Select which ad accounts you want to manage with Auto-ads. You can select multiple accounts for bulk launching.
          </p>

          <div className="mt-5 rounded-2xl border border-emerald-200/80 bg-emerald-50/55 px-4 py-3 backdrop-blur-sm">
            <div className="flex items-start gap-3 text-emerald-800">
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
              <Button variant="secondary" onClick={() => setLocation("/connections")}>
                Open Connections
              </Button>
            </div>
          ) : (
            <div className="mt-6 space-y-1.5">
              <button
                type="button"
                onClick={toggleSelectAll}
                className="flex w-full items-center gap-4 rounded-xl border border-white/55 bg-white/35 px-2 py-2 text-left backdrop-blur-sm transition hover:bg-white/50 dark:border-white/15 dark:bg-white/5 dark:hover:bg-white/10"
              >
                <span className={`flex h-7 w-7 items-center justify-center rounded-full border ${allSelected ? "border-[#6d84c9] bg-[#dfe8ff]" : "border-slate-300 bg-white"}`}>
                  {allSelected ? <span className="material-symbols-outlined text-[16px] text-[#4864b2]">check</span> : null}
                </span>
                <span className="text-[22px] leading-none font-medium text-[#31405e]">Select all accounts</span>
              </button>

              <div className="max-h-[420px] space-y-1 overflow-y-auto pr-1">
                {selectablePendingAdAccounts.map((acc) => {
                  const checked = selectedPendingAdAccountIds.includes(acc.id);
                  const status = getAccountStatusBadge(Number(acc.account_status));
                  return (
                    <button
                      key={acc.id}
                      type="button"
                      onClick={() => toggleAccount(acc.id)}
                      className="flex w-full items-center gap-3 rounded-xl border border-white/55 bg-white/35 px-2 py-2.5 text-left backdrop-blur-sm transition hover:bg-white/50 dark:border-white/15 dark:bg-white/5 dark:hover:bg-white/10"
                    >
                      <span className={`flex h-7 w-7 items-center justify-center rounded-full border ${checked ? "border-[#6d84c9] bg-[#dfe8ff]" : "border-slate-300 bg-white"}`}>
                        {checked ? <span className="material-symbols-outlined text-[16px] text-[#4864b2]">check</span> : null}
                      </span>

                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/70 text-[#6b7b99] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                        <Building2 className="h-5 w-5" />
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[22px] leading-none font-semibold text-[#1d2845]">
                          {acc.name || acc.id}
                        </span>
                        <span className="mt-1 block truncate text-sm leading-none text-[#8a98b5] sm:text-base">
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
                <div className="pt-2 text-xs text-amber-900/85">
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
                className="mt-4 h-14 w-full rounded-2xl border border-[#9cb3df] bg-[#c4d1eb]/95 text-2xl font-semibold text-white shadow-[0_10px_24px_rgba(84,112,166,0.22)] backdrop-blur-sm hover:bg-[#b8c7e6] disabled:opacity-100"
                data-testid="button-confirm-select-ad-account"
              >
                {confirmPendingAccountsMutation.isPending ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : null}
                Confirm selection ({selectedPendingAdAccountIds.length})
                <span className="material-symbols-outlined ml-1 text-xl">chevron_right</span>
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
