import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";

interface User {
  id: string;
  name: string;
  email: string;
  picture?: string;
}

interface AuthState {
  authenticated: boolean;
  user?: User;
}

export function useAuth() {
  const [isVerifyingToken, setIsVerifyingToken] = useState(false);
  
  const { data, isLoading, error, refetch } = useQuery<AuthState>({
    queryKey: ["/auth/me"],
    staleTime: 5 * 60 * 1000, // Cache auth for 5 minutes
    gcTime: 10 * 60 * 1000, // Keep in memory for 10 minutes
    retry: false,
    enabled: !isVerifyingToken, // Don't fetch while verifying token
  });

  // Handle login token from OAuth callback (for dev environment)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const loginToken = urlParams.get('login_token');
    const authSuccess = urlParams.get('auth');
    
    if (loginToken) {
      setIsVerifyingToken(true);
      // Clear the param from URL immediately
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);
      
      // Verify the token and establish session
      apiRequest('POST', '/auth/verify-login-token', { token: loginToken })
        .then(() => {
          console.log('Login token verified successfully');
          // Invalidate and refetch auth
          queryClient.invalidateQueries({ queryKey: ["/auth/me"] });
          setIsVerifyingToken(false);
        })
        .catch((err) => {
          console.error('Login token verification failed:', err);
          setIsVerifyingToken(false);
        });
    } else if (authSuccess === 'success') {
      // Legacy: Clear the param from URL
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);
      // Invalidate and refetch auth
      queryClient.invalidateQueries({ queryKey: ["/auth/me"] });
    }
  }, []);

  return {
    user: data?.user,
    isAuthenticated: data?.authenticated ?? false,
    isLoading: isLoading || isVerifyingToken,
    error,
    refetch,
  };
}
