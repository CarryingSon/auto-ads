import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect } from "react";
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
    | "meta_auth_error"
    | "meta_not_connected"
    | "meta_fetch_error"
    | null;
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
  const metaNeedsAdAccount = metaConnected && usableMetaAdAccounts.length === 0;

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

  const pageOptions = pagesData?.data || [];
  const selectedPageValue = pagesData?.selectedPageId || authStatus?.meta?.selectedPageId || "";

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
                variant={metaNeedsAdAccount ? "destructive" : metaConnected ? "default" : metaExpired ? "destructive" : "secondary"}
                className={metaNeedsAdAccount ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" : metaConnected ? "bg-green-500/10 text-green-600 dark:text-green-400" : ""}
                data-testid="badge-meta-status"
              >
                {metaNeedsAdAccount ? (
                  <>
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    Action required
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
