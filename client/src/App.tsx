import { Switch, Route, useLocation } from "wouter";
import { queryClient, apiRequest } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme";
import { ThemeToggle } from "@/components/theme-toggle";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { AppSidebar } from "@/components/app-sidebar";
import { LoginGate } from "@/components/login-gate";
import Dashboard from "@/pages/dashboard";
import Connections from "@/pages/connections";
import BulkAds from "@/pages/bulk-ads";
import Statistics from "@/pages/statistics";
import History from "@/pages/history";
import Settings from "@/pages/settings";
import Landing from "@/pages/landing";
import Login from "@/pages/login";
import Privacy from "@/pages/privacy";
import Terms from "@/pages/terms";
import DataDeletion from "@/pages/data-deletion";
import SelectAdAccount from "@/pages/select-ad-account";
import NotFound from "@/pages/not-found";
import { usePrefetchMetaData } from "@/hooks/use-prefetch-meta";
import { useEffect, useState } from "react";


function DashboardRouter() {
  return (
    <Switch>
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/connections" component={Connections} />
      <Route path="/bulk-ads" component={BulkAds} />
      <Route path="/statistics" component={Statistics} />
      <Route path="/history" component={History} />
      <Route path="/settings" component={Settings} />
      <Route component={NotFound} />
    </Switch>
  );
}

function PrefetchProvider({ children }: { children: React.ReactNode }) {
  usePrefetchMetaData();
  return <>{children}</>;
}

function DashboardLayout() {
  const style = {
    "--sidebar-width": "15rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <LoginGate>
      <PrefetchProvider>
        <div className="liquid-bg">
          <div className="blob blob-1" />
          <div className="blob blob-2" />
          <div className="blob blob-3" />
        </div>
        <SidebarProvider style={style as React.CSSProperties}>
          <div className="flex h-screen w-full relative" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", letterSpacing: "0.01em" }}>
            <AppSidebar />
            <main className="flex-1 overflow-y-auto px-4 py-1.5 scroll-smooth">
              <header className="flex items-center justify-between gap-4 mb-1.5">
                <SidebarTrigger data-testid="button-sidebar-toggle" className="text-muted-foreground hover:text-foreground" />
                <ThemeToggle />
              </header>
              <DashboardRouter />
            </main>
          </div>
        </SidebarProvider>
      </PrefetchProvider>
    </LoginGate>
  );
}

function AppContent() {
  const [location, setLocation] = useLocation();
  const [isVerifyingToken, setIsVerifyingToken] = useState(false);
  
  // Handle login token from OAuth callback (for dev environment) - at App level
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const loginToken = urlParams.get('login_token');
    
    if (loginToken) {
      console.log('Found login_token, verifying...');
      setIsVerifyingToken(true);
      // Clear the param from URL immediately
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);
      
      // Verify the token and establish session
      apiRequest('POST', '/auth/verify-login-token', { token: loginToken })
        .then(() => {
          console.log('Login token verified successfully, redirecting to upload...');
          queryClient.invalidateQueries({ queryKey: ["/auth/me"] });
          setIsVerifyingToken(false);
          setLocation('/bulk-ads');
        })
        .catch((err) => {
          console.error('Login token verification failed:', err);
          setIsVerifyingToken(false);
        });
    }
  }, [setLocation]);
  
  // Show loading while verifying token
  if (isVerifyingToken) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Signing in...</p>
        </div>
      </div>
    );
  }
  
  const isLandingRoute = location === "/" || location === "/landing";
  const isLoginRoute = location === "/login";
  const isPrivacyRoute = location === "/privacy-policy";
  const isTermsRoute = location === "/terms";
  const isDataDeletionRoute = location === "/data-deletion";
  const isSelectAdAccountRoute = location === "/select-ad-account";
  const isDashboard = !isLandingRoute && !isLoginRoute && !isPrivacyRoute && !isTermsRoute && !isDataDeletionRoute && !isSelectAdAccountRoute;

  useEffect(() => {
    if (!isDashboard) {
      document.documentElement.classList.remove("dark");
    } else {
      const stored = localStorage.getItem("theme");
      if (stored === "dark") {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    }
  }, [isDashboard]);

  return isLandingRoute ? <Landing /> : isLoginRoute ? <Login /> : isPrivacyRoute ? <Privacy /> : isTermsRoute ? <Terms /> : isDataDeletionRoute ? <DataDeletion /> : isSelectAdAccountRoute ? <SelectAdAccount /> : <DashboardLayout />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <AppContent />
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
