import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { CheckCircle2, XCircle, RefreshCw, Unplug, Plug, Info, AlertTriangle } from "lucide-react";
import { SiFacebook } from "react-icons/si";

interface AuthStatus {
  meta: {
    status: string;
    accountName?: string;
    accountEmail?: string;
    connectedAt?: string;
    lastTestedAt?: string;
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
      setLocation("/connections", { replace: true });
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
  const pendingAdAccounts = pendingAdAccountsData?.accounts || [];
  const selectablePendingAdAccounts = pendingAdAccounts.filter((acc) => acc?.access_verified !== false);
  const blockedPendingAdAccounts = pendingAdAccounts.filter((acc) => acc?.access_verified === false);
  const metaHasPendingSelection = metaConnected && usableMetaAdAccounts.length === 0 && selectablePendingAdAccounts.length > 0;
  const metaNeedsAdAccount = metaConnected && usableMetaAdAccounts.length === 0 && selectablePendingAdAccounts.length === 0;

  useEffect(() => {
    if (!metaHasPendingSelection) {
      setSelectedPendingAdAccountIds([]);
      return;
    }
    setSelectedPendingAdAccountIds((prev) =>
      prev.filter((id) => selectablePendingAdAccounts.some((acc) => acc.id === id)),
    );
  }, [metaHasPendingSelection, selectablePendingAdAccounts]);

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

  const pageOptions = pagesData?.data || [];
  const selectedPageValue = pagesData?.selectedPageId || authStatus?.meta?.selectedPageId || "";
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
    <div className="p-4 max-w-4xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-semibold" data-testid="text-page-title">Connections</h1>
        <p className="text-sm text-muted-foreground">
          Connect your Meta Ads account to enable bulk uploads
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card data-testid="card-connection-meta" className="shadow-sm">
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-md bg-[#1877F2]/10 dark:bg-[#1877F2]/20">
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
          <CardContent className="space-y-4">
            {metaConnected && authStatus?.meta?.accountName && (
              <div className="rounded-md bg-muted p-3">
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
              <div className="space-y-3 rounded-md border border-amber-300/60 bg-amber-50/80 p-3 dark:border-amber-500/50 dark:bg-amber-500/10">
                <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                  Choose which ad accounts should be visible in the app.
                </p>
                <div className="space-y-2">
                  {selectablePendingAdAccounts.map((acc) => {
                    const checked = selectedPendingAdAccountIds.includes(acc.id);
                    return (
                      <label
                        key={acc.id}
                        className="flex items-start gap-2 rounded-md border border-amber-200/70 bg-white/80 p-2 text-sm dark:border-amber-500/30 dark:bg-black/10"
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4"
                          checked={checked}
                          onChange={() => togglePendingAdAccountSelection(acc.id)}
                        />
                        <span className="flex-1">
                          <span className="block font-medium text-amber-900 dark:text-amber-100">{acc.name || acc.id}</span>
                          <span className="block text-xs text-amber-800/80 dark:text-amber-200/80">
                            {acc.id}
                            {typeof acc.promotable_pages_count === "number" ? ` · ${acc.promotable_pages_count} promotable page(s)` : ""}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                {blockedPendingAdAccounts.length > 0 && (
                  <div className="text-xs text-amber-900/80 dark:text-amber-200/80">
                    {blockedPendingAdAccounts.length} account(s) are unavailable and cannot be selected:
                    {blockedPendingAdAccounts.map((acc) => (
                      <div key={`blocked-${acc.id}`}>
                        {acc.name || acc.id} ({describePendingAccessIssue(acc.access_issue)})
                      </div>
                    ))}
                  </div>
                )}
                <Button
                  size="sm"
                  onClick={() => confirmPendingAccountsMutation.mutate(selectedPendingAdAccountIds)}
                  disabled={confirmPendingAccountsMutation.isPending || selectedPendingAdAccountIds.length === 0}
                  data-testid="button-confirm-pending-ad-accounts"
                >
                  {confirmPendingAccountsMutation.isPending ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : null}
                  Save selected ad accounts
                </Button>
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
                    <SelectTrigger data-testid="select-ad-account">
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
                      <SelectTrigger data-testid="select-page">
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

            <div>
              <div className="flex items-center gap-2 mb-2">
                <Info className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Permissions requested</span>
              </div>
              <ul className="text-sm text-muted-foreground space-y-1 ml-6">
                <li className="list-disc">Manage ad accounts and campaigns</li>
                <li className="list-disc">Access your Facebook Pages</li>
                <li className="list-disc">Upload video creatives</li>
              </ul>
            </div>

            <Separator />

            <div className="flex flex-wrap gap-2">
              {metaConnected || metaExpired ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => testMetaMutation.mutate()}
                    disabled={testMetaMutation.isPending}
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
                    className="text-destructive hover:text-destructive"
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

      <Card className="border-dashed bg-muted/30 shadow-sm">
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
