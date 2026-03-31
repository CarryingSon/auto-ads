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
        <div className="w-full max-w-[560px] rounded-[28px] border border-white/70 bg-background/95 p-6 shadow-[0_24px_90px_rgba(39,66,116,0.22)] sm:p-7">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">Select Ad Accounts</h1>
          <p className="mt-4 text-lg leading-snug text-slate-500 sm:text-[25px]">
            Select which ad accounts you want to manage with Auto-ads. You can select multiple accounts for bulk launching.
          </p>

          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50/60 px-4 py-3">
            <div className="flex items-start gap-3 text-emerald-800">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
              <p className="text-sm sm:text-base">
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
            <div className="mt-7 space-y-2">
              <button
                type="button"
                onClick={toggleSelectAll}
                className="flex w-full items-center gap-4 rounded-xl px-2 py-2 text-left transition hover:bg-white/70"
              >
                <span className={`flex h-7 w-7 items-center justify-center rounded-full border ${allSelected ? "border-[#6d84c9] bg-[#dfe8ff]" : "border-slate-300 bg-white"}`}>
                  {allSelected ? <span className="material-symbols-outlined text-[16px] text-[#4864b2]">check</span> : null}
                </span>
                <span className="text-xl leading-none font-medium text-slate-700 sm:text-[34px]">Select all accounts</span>
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
                      className="flex w-full items-center gap-3 rounded-xl px-2 py-3 text-left transition hover:bg-white/70"
                    >
                      <span className={`flex h-7 w-7 items-center justify-center rounded-full border ${checked ? "border-[#6d84c9] bg-[#dfe8ff]" : "border-slate-300 bg-white"}`}>
                        {checked ? <span className="material-symbols-outlined text-[16px] text-[#4864b2]">check</span> : null}
                      </span>

                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 text-slate-500">
                        <Building2 className="h-5 w-5" />
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-lg leading-none font-semibold text-slate-800 sm:text-[29px]">
                          {acc.name || acc.id}
                        </span>
                        <span className="mt-1 block truncate text-sm leading-none text-slate-400 sm:text-[20px]">
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
                className="mt-4 h-14 w-full rounded-2xl bg-[#aebee0] text-lg font-semibold text-white hover:bg-[#9fb2db]"
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
