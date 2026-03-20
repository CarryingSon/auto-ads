import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    let message = text;
    try {
      const json = JSON.parse(text);
      if (json.error) {
        message = json.error;
        if (json.details && Array.isArray(json.details) && json.details.length > 0) {
          message += "\n\n" + json.details.map((d: string, i: number) => `${i + 1}. ${d}`).join("\n");
        }
      }
    } catch {}
    throw new Error(message);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
  options?: {
    timeoutMs?: number;
    signal?: AbortSignal;
  },
): Promise<Response> {
  const normalizedMethod = method.toUpperCase();
  const isMutating = normalizedMethod !== "GET" && normalizedMethod !== "HEAD" && normalizedMethod !== "OPTIONS";
  const csrfToken = getCsrfToken();
  const headers: Record<string, string> = {};
  if (data) {
    headers["Content-Type"] = "application/json";
  }
  if (isMutating && csrfToken) {
    headers["x-csrf-token"] = csrfToken;
  }

  const timeoutMs = options?.timeoutMs;
  const timeoutController = timeoutMs ? new AbortController() : null;
  const signal = options?.signal ?? timeoutController?.signal;
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  if (timeoutController && timeoutMs && timeoutMs > 0) {
    timeoutHandle = setTimeout(() => timeoutController.abort(), timeoutMs);
  }

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: data ? JSON.stringify(data) : undefined,
      credentials: "include",
      signal,
    });

    await throwIfResNotOk(res);
    return res;
  } catch (error: any) {
    if (error?.name === "AbortError" && timeoutMs) {
      throw new Error(`Request timed out after ${Math.ceil(timeoutMs / 1000)}s`);
    }
    throw error;
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

export function getCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const cookieKey = "csrf-token=";
  for (const part of document.cookie.split(";")) {
    const trimmed = part.trim();
    if (!trimmed.startsWith(cookieKey)) continue;
    return decodeURIComponent(trimmed.slice(cookieKey.length));
  }
  return "";
}

export function getCsrfHeaders(): Record<string, string> {
  const token = getCsrfToken();
  return token ? { "x-csrf-token": token } : {};
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
