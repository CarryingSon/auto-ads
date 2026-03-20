import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { queryClient } from "@/lib/queryClient";

interface LoginGateProps {
  children: React.ReactNode;
}

export function LoginGate({ children }: LoginGateProps) {
  const [location, setLocation] = useLocation();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && !isAuthenticated && location !== "/login") {
      setLocation("/login");
    }
  }, [authLoading, isAuthenticated, location, setLocation]);

  useEffect(() => {
    if (authLoading || !isAuthenticated) return;
    void queryClient.prefetchQuery({
      queryKey: ["/api/sidebar-data"],
      staleTime: 30_000,
    });
  }, [authLoading, isAuthenticated]);

  if (authLoading) {
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

  return <>{children}</>;
}
