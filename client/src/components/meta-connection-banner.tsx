import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

// Meta user tokens last about 60 days and cannot be refreshed. Warn a week
// ahead, so the reconnect happens before a launch fails on it.
const WARN_DAYS_BEFORE_EXPIRY = 7;

interface MetaConnectionHealth {
  connected: boolean;
  tokenExpiresAt: string | null;
  daysLeft: number | null;
  expired: boolean;
}

export function MetaConnectionBanner() {
  const { data } = useQuery<MetaConnectionHealth>({
    queryKey: ["/api/meta/connection-health"],
    staleTime: 60 * 60 * 1000,
    retry: false,
  });

  if (!data?.connected || data.daysLeft === null) return null;
  if (!data.expired && data.daysLeft > WARN_DAYS_BEFORE_EXPIRY) return null;

  const message = data.expired
    ? "Your Meta connection has expired. Launches and campaign data will fail until you reconnect."
    : data.daysLeft === 0
      ? "Your Meta connection expires today. Reconnect now so launches keep working."
      : `Your Meta connection expires in ${data.daysLeft} day${data.daysLeft === 1 ? "" : "s"}. Reconnect so launches keep working.`;

  return (
    <div
      role="alert"
      className={`mb-2 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-2.5 text-sm ${
        data.expired
          ? "border-red-300/60 bg-red-50/80 text-red-900 dark:border-red-500/50 dark:bg-red-500/10 dark:text-red-200"
          : "border-amber-400/40 bg-amber-50/70 text-amber-900 dark:border-amber-500/50 dark:bg-amber-500/10 dark:text-amber-200"
      }`}
      data-testid="banner-meta-connection"
    >
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span className="flex-1 min-w-[200px]">{message}</span>
      <Button
        size="sm"
        variant="outline"
        className="h-8"
        onClick={() => {
          window.location.href = "/auth/meta/start";
        }}
        data-testid="button-meta-reconnect"
      >
        Reconnect Meta
      </Button>
    </div>
  );
}
