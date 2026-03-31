import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { queryClient } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";

interface LoginGateProps {
  children: React.ReactNode;
}

interface SidebarGateData {
  hasPendingAccounts?: boolean;
}

export function LoginGate({ children }: LoginGateProps) {
  const [location, setLocation] = useLocation();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const isSelectAdAccountRoute = location === "/select-ad-account";

  const { data: sidebarGateData, isLoading: sidebarGateLoading } = useQuery<SidebarGateData>({
    queryKey: ["/api/sidebar-data"],
    enabled: !authLoading && isAuthenticated,
    staleTime: 30_000,
    refetchOnMount: "always",
  });

  const mustSelectAdAccounts = sidebarGateData?.hasPendingAccounts === true;

  useEffect(() => {
    if (!authLoading && !isAuthenticated && location !== "/login") {
      setLocation("/login");
    }
  }, [authLoading, isAuthenticated, location, setLocation]);

  useEffect(() => {
    if (authLoading || !isAuthenticated) return;
    if (!mustSelectAdAccounts) return;
    if (isSelectAdAccountRoute) return;
    setLocation("/select-ad-account", { replace: true });
  }, [authLoading, isAuthenticated, mustSelectAdAccounts, isSelectAdAccountRoute, setLocation]);

  useEffect(() => {
    if (authLoading || !isAuthenticated) return;
    if (mustSelectAdAccounts) return;
    void queryClient.prefetchQuery({
      queryKey: ["/api/sidebar-data"],
      staleTime: 30_000,
    });
  }, [authLoading, isAuthenticated, mustSelectAdAccounts]);

  const shouldHoldForGate =
    !authLoading &&
    isAuthenticated &&
    !isSelectAdAccountRoute &&
    sidebarGateLoading;

  if (authLoading || shouldHoldForGate) {
    return (
      <div className="relative h-screen overflow-hidden bg-background">
        <div className="liquid-bg">
          <div className="blob blob-1" />
          <div className="blob blob-2" />
          <div className="blob blob-3" />
        </div>
        <div className="absolute inset-0 backdrop-blur-sm" />
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-primary/20">
          <div className="h-full bg-primary animate-loading-bar" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  if (mustSelectAdAccounts && !isSelectAdAccountRoute) {
    return (
      <div className="relative h-screen overflow-hidden bg-background">
        <div className="liquid-bg">
          <div className="blob blob-1" />
          <div className="blob blob-2" />
          <div className="blob blob-3" />
        </div>
        <div className="absolute inset-0 backdrop-blur-sm" />
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-primary/20">
          <div className="h-full bg-primary animate-loading-bar" />
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
