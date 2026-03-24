import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

interface AdAccount {
  id: string;
  name: string;
  account_status: number;
  access_verified?: boolean;
  access_issue?: "missing_ad_account_permission" | "meta_auth_error" | "meta_fetch_error" | "no_promotable_pages" | null;
  promotable_pages_count?: number;
}

export default function SelectAdAccount() {
  const [, setLocation] = useLocation();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data: pendingAccounts, isLoading, isError } = useQuery<{
    accounts: AdAccount[];
  }>({
    queryKey: ["/api/meta/pending-ad-accounts"],
  });

  const confirmMutation = useMutation({
    mutationFn: async (adAccountIds: string[]) => {
      const res = await apiRequest("POST", "/api/meta/confirm-ad-account", { adAccountIds });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.setQueryData(["/api/meta/ad-accounts"], {
        data: data.adAccounts || [],
        selectedAdAccountId: data.selectedAdAccountId || null,
        hasPendingAccounts: false,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/meta/ad-accounts"] });
      setLocation("/dashboard");
    },
  });

  const accounts = pendingAccounts?.accounts || [];
  const selectableAccounts = accounts.filter((account) => account.access_verified !== false);
  const excludedAccounts = accounts.filter((account) => account.access_verified === false);
  const selectableAccountIds = new Set(selectableAccounts.map((account) => account.id));

  useEffect(() => {
    setSelectedIds((prev) => {
      const next = new Set(Array.from(prev).filter((id) => selectableAccountIds.has(id)));
      if (next.size === prev.size) return prev;
      return next;
    });
  }, [accounts]);

  const toggleSelect = (accountId: string, canSelect: boolean) => {
    if (!canSelect) return;
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(accountId)) {
        newSet.delete(accountId);
      } else {
        newSet.add(accountId);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectableAccounts.length === 0) return;
    if (selectedIds.size === selectableAccounts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableAccounts.map(a => a.id)));
    }
  };

  const handleConfirm = () => {
    if (selectedIds.size > 0) {
      confirmMutation.mutate(Array.from(selectedIds));
    }
  };

  const getStatusBadge = (status: number) => {
    if (status === 1) return { text: "ACTIVE", classes: "bg-emerald-50 text-emerald-600 border border-emerald-200/60" };
    if (status === 3) return { text: "UNSETTLED", classes: "bg-orange-50 text-orange-600 border border-orange-200/60" };
    if (status === 2) return { text: "DISABLED", classes: "bg-red-50 text-red-600 border border-red-200/60" };
    return { text: "UNKNOWN", classes: "bg-slate-100 text-slate-500 border border-slate-200/60" };
  };

  const getAccessIssueBadge = (issue: AdAccount["access_issue"]) => {
    if (issue === "missing_ad_account_permission") return { text: "MISSING PERMISSION", classes: "bg-red-50 text-red-600 border border-red-200/60" };
    if (issue === "no_promotable_pages") return { text: "NO PROMOTABLE PAGES", classes: "bg-amber-50 text-amber-700 border border-amber-200/70" };
    if (issue === "meta_auth_error") return { text: "AUTH ISSUE", classes: "bg-orange-50 text-orange-700 border border-orange-200/70" };
    if (issue === "meta_fetch_error") return { text: "CHECK FAILED", classes: "bg-slate-100 text-slate-600 border border-slate-200/70" };
    return null;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center relative overflow-hidden" style={{ background: "linear-gradient(160deg, #e8f0fe 0%, #f5f8ff 25%, #ffffff 60%, #ffffff 100%)" }}>
        <div className="absolute top-[-15%] left-[-10%] w-[50vw] h-[50vw] rounded-full" style={{ background: "radial-gradient(circle, rgba(24,119,242,0.08) 0%, transparent 70%)", filter: "blur(80px)" }} />
        <div className="absolute bottom-[-20%] right-[-10%] w-[40vw] h-[40vw] rounded-full" style={{ background: "radial-gradient(circle, rgba(147,197,253,0.1) 0%, transparent 70%)", filter: "blur(80px)" }} />
        <div className="text-center space-y-4 relative z-10">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-[#1877F2]" />
          <p className="text-slate-500 font-medium">Loading ad accounts...</p>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden" style={{ background: "linear-gradient(160deg, #e8f0fe 0%, #f5f8ff 25%, #ffffff 60%, #ffffff 100%)" }}>
        <main className="w-full max-w-lg relative z-10">
          <div className="rounded-3xl p-8 flex flex-col gap-4 text-center" style={{ background: "rgba(255,255,255,0.65)", backdropFilter: "blur(24px) saturate(180%)", WebkitBackdropFilter: "blur(24px) saturate(180%)", border: "1px solid rgba(255,255,255,0.8)", boxShadow: "0 8px 32px rgba(24,119,242,0.06)" }}>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Meta reconnect failed</h1>
            <p className="text-slate-500 text-sm leading-relaxed">
              Authentication finished, but we could not load your pending ad accounts. This is usually a session/redirect mismatch.
            </p>
            <button
              onClick={() => { window.location.href = "/auth/meta/start"; }}
              className="w-full py-3 rounded-2xl text-white font-bold"
              style={{ background: "#1877F2", boxShadow: "0 4px 20px rgba(24,119,242,0.35)" }}
              data-testid="button-reconnect-meta-from-select"
            >
              Reconnect Meta
            </button>
            <button
              onClick={() => setLocation("/connections")}
              className="w-full py-3 rounded-2xl font-semibold border border-slate-200 text-slate-700 bg-white/80"
              data-testid="button-back-connections-from-select"
            >
              Back to Connections
            </button>
          </div>
        </main>
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden" style={{ background: "linear-gradient(160deg, #e8f0fe 0%, #f5f8ff 25%, #ffffff 60%, #ffffff 100%)" }}>
        <main className="w-full max-w-lg relative z-10">
          <div className="rounded-3xl p-8 flex flex-col gap-4 text-center" style={{ background: "rgba(255,255,255,0.65)", backdropFilter: "blur(24px) saturate(180%)", WebkitBackdropFilter: "blur(24px) saturate(180%)", border: "1px solid rgba(255,255,255,0.8)", boxShadow: "0 8px 32px rgba(24,119,242,0.06)" }}>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">No ad accounts found</h1>
            <p className="text-slate-500 text-sm leading-relaxed">
              Meta did not return any usable ad accounts for this reconnect. This usually means missing permissions for ad account pages. You can reconnect and re-approve permissions, or go back to Connections.
            </p>
            <button
              onClick={() => { window.location.href = "/auth/meta/start"; }}
              className="w-full py-3 rounded-2xl text-white font-bold"
              style={{ background: "#1877F2", boxShadow: "0 4px 20px rgba(24,119,242,0.35)" }}
              data-testid="button-reconnect-meta-empty-select"
            >
              Reconnect Meta
            </button>
            <button
              onClick={() => setLocation("/connections")}
              className="w-full py-3 rounded-2xl font-semibold border border-slate-200 text-slate-700 bg-white/80"
              data-testid="button-back-connections-empty-select"
            >
              Back to Connections
            </button>
          </div>
        </main>
      </div>
    );
  }

  const allSelected = selectedIds.size === selectableAccounts.length && selectableAccounts.length > 0;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden" style={{ background: "linear-gradient(160deg, #e8f0fe 0%, #f5f8ff 25%, #ffffff 60%, #ffffff 100%)" }}>
      <div className="absolute top-[-15%] left-[-10%] w-[50vw] h-[50vw] rounded-full" style={{ background: "radial-gradient(circle, rgba(24,119,242,0.08) 0%, transparent 70%)", filter: "blur(80px)" }} />
      <div className="absolute bottom-[-20%] right-[-10%] w-[40vw] h-[40vw] rounded-full" style={{ background: "radial-gradient(circle, rgba(147,197,253,0.1) 0%, transparent 70%)", filter: "blur(80px)" }} />

      <main className="w-full max-w-lg relative z-10">
        <div className="rounded-3xl p-8 flex flex-col gap-6" style={{ background: "rgba(255,255,255,0.65)", backdropFilter: "blur(24px) saturate(180%)", WebkitBackdropFilter: "blur(24px) saturate(180%)", border: "1px solid rgba(255,255,255,0.8)", boxShadow: "0 8px 32px rgba(24,119,242,0.06)" }}>
          <header>
            <h1 className="text-3xl font-bold text-slate-900 mb-2 tracking-tight">Select Ad Accounts</h1>
            <p className="text-slate-500 text-sm leading-relaxed">
              Select which ad accounts you want to manage with Auto-ads. You can select multiple accounts for bulk launching.
            </p>
          </header>

          <div className="rounded-2xl p-4 flex gap-3 items-start bg-emerald-50/60 border border-emerald-200/50">
            <span className="material-symbols-outlined text-emerald-600 text-xl">verified_user</span>
            <p className="text-xs leading-normal text-emerald-800">
              <span className="font-semibold text-emerald-700">Your data is safe.</span> We only use features for adding ads and reading data for campaign optimization.
            </p>
          </div>

          {excludedAccounts.length > 0 && (
            <div className="rounded-2xl p-4 flex gap-3 items-start bg-amber-50/65 border border-amber-200/70">
              <span className="material-symbols-outlined text-amber-700 text-xl">info</span>
              <p className="text-xs leading-normal text-amber-900">
                <span className="font-semibold text-amber-800">{excludedAccounts.length} account(s)</span> are excluded because required permissions or promotable pages are missing.
              </p>
            </div>
          )}

          <div className="flex flex-col gap-3 max-h-[400px] overflow-y-auto pr-1" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(0,0,0,0.08) transparent" }}>
            <label
              className="rounded-2xl p-4 flex items-center gap-4 cursor-pointer transition-all"
              onClick={toggleSelectAll}
              style={{
                background: selectableAccounts.length > 0 ? "rgba(255,255,255,0.7)" : "rgba(248,250,252,0.75)",
                border: "1px solid rgba(255,255,255,0.5)",
                opacity: selectableAccounts.length > 0 ? 1 : 0.75,
                cursor: selectableAccounts.length > 0 ? "pointer" : "not-allowed",
              }}
              onMouseEnter={(e) => {
                if (selectableAccounts.length === 0) return;
                e.currentTarget.style.background = "rgba(255,255,255,0.9)";
                e.currentTarget.style.transform = "translateY(-1px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = selectableAccounts.length > 0 ? "rgba(255,255,255,0.7)" : "rgba(248,250,252,0.75)";
                e.currentTarget.style.transform = "translateY(0)";
              }}
              data-testid="checkbox-select-all"
            >
              <div
                className="flex items-center justify-center shrink-0 transition-all"
                style={{
                  width: 24, height: 24, borderRadius: "50%",
                  border: allSelected ? "2px solid #1877F2" : "2px solid rgba(148,163,184,0.4)",
                  background: allSelected ? "#1877F2" : "rgba(255,255,255,0.8)",
                }}
              >
                {allSelected && <span className="material-symbols-outlined" style={{ fontSize: 16, color: "#fff" }}>check</span>}
              </div>
              <span className="text-slate-700 font-medium">
                {selectableAccounts.length === 0
                  ? "No selectable accounts"
                  : allSelected
                    ? "Deselect all"
                    : `Select all (${selectableAccounts.length})`}
              </span>
            </label>

            {accounts.map((account) => {
              const isSelectable = account.access_verified !== false;
              const isSelected = isSelectable && selectedIds.has(account.id);
              const badge = getStatusBadge(account.account_status);
              const issueBadge = getAccessIssueBadge(account.access_issue);

              return (
                <div
                  key={account.id}
                  className="rounded-2xl p-4 flex items-center justify-between gap-3 transition-all group"
                  style={{
                    background: !isSelectable
                      ? "rgba(248,113,113,0.06)"
                      : isSelected
                        ? "rgba(24,119,242,0.06)"
                        : "rgba(255,255,255,0.7)",
                    border: !isSelectable
                      ? "1px solid rgba(248,113,113,0.25)"
                      : isSelected
                        ? "1px solid rgba(24,119,242,0.3)"
                        : "1px solid rgba(255,255,255,0.5)",
                    opacity: isSelectable ? 1 : 0.85,
                    cursor: isSelectable ? "pointer" : "not-allowed",
                  }}
                  onClick={() => toggleSelect(account.id, isSelectable)}
                  onMouseEnter={(e) => {
                    if (!isSelectable || isSelected) return;
                    e.currentTarget.style.background = "rgba(255,255,255,0.9)";
                    e.currentTarget.style.transform = "translateY(-1px)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelectable || isSelected) return;
                    e.currentTarget.style.background = "rgba(255,255,255,0.7)";
                    e.currentTarget.style.transform = "translateY(0)";
                  }}
                  data-testid={`card-account-${account.id}`}
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div
                      className="flex items-center justify-center shrink-0 transition-all"
                      style={{
                        width: 24, height: 24, borderRadius: "50%",
                        border: isSelectable
                          ? (isSelected ? "2px solid #1877F2" : "2px solid rgba(148,163,184,0.4)")
                          : "2px solid rgba(248,113,113,0.4)",
                        background: isSelectable
                          ? (isSelected ? "#1877F2" : "rgba(255,255,255,0.8)")
                          : "rgba(255,255,255,0.8)",
                      }}
                    >
                      {isSelected && <span className="material-symbols-outlined" style={{ fontSize: 16, color: "#fff" }}>check</span>}
                      {!isSelectable && <span className="material-symbols-outlined" style={{ fontSize: 14, color: "#dc2626" }}>block</span>}
                    </div>
                    <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-slate-100 border border-slate-200/60">
                      <span className="material-symbols-outlined text-slate-500">business</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-slate-800 font-semibold text-sm truncate">{account.name}</p>
                      <p className="text-slate-400 text-[11px] font-mono truncate">{account.id}</p>
                      {isSelectable && Number.isFinite(Number(account.promotable_pages_count)) && (
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Promotable pages: {Number(account.promotable_pages_count)}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider ${badge.classes}`}>
                      {badge.text}
                    </span>
                    {issueBadge && (
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider ${issueBadge.classes}`}>
                        {issueBadge.text}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <button
            onClick={handleConfirm}
            disabled={selectedIds.size === 0 || confirmMutation.isPending}
            className="w-full py-4 rounded-2xl flex items-center justify-center gap-2 text-white font-bold text-lg active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: selectedIds.size > 0 ? "#1877F2" : "rgba(24,119,242,0.4)",
              boxShadow: selectedIds.size > 0 ? "0 4px 20px rgba(24,119,242,0.35)" : "none",
            }}
            onMouseEnter={(e) => { if (selectedIds.size > 0) { e.currentTarget.style.background = "#1565d8"; e.currentTarget.style.boxShadow = "0 6px 28px rgba(24,119,242,0.45)"; } }}
            onMouseLeave={(e) => { if (selectedIds.size > 0) { e.currentTarget.style.background = "#1877F2"; e.currentTarget.style.boxShadow = "0 4px 20px rgba(24,119,242,0.35)"; } }}
            data-testid="button-confirm-selection"
          >
            {confirmMutation.isPending ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                Confirm selection ({selectedIds.size})
                <span className="material-symbols-outlined text-xl">chevron_right</span>
              </>
            )}
          </button>
        </div>
      </main>
    </div>
  );
}
