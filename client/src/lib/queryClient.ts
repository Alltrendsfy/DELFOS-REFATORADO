import { QueryClient, QueryFunction } from "@tanstack/react-query";

// Global flag to prevent multiple simultaneous login redirects
let isRedirectingToLogin = false;

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    // Handle 401 Unauthorized - redirect to login (once)
    if (res.status === 401) {
      if (!isRedirectingToLogin) {
        isRedirectingToLogin = true;
        console.log('[AUTH] Unauthorized - redirecting to login');
        window.location.href = '/api/login';
      }
      throw new Error('Unauthorized - redirecting to login');
    }
    
    const contentType = res.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      try {
        const json = await res.json();
        throw new Error(json.message || res.statusText);
      } catch (e: any) {
        // If JSON parsing fails, fall back to text
        if (e.message && !e.message.includes("JSON")) {
          throw e;
        }
      }
    }
    const text = (await res.text()) || res.statusText;
    throw new Error(text);
  }
}

export async function apiRequest<T = void>(
  url: string,
  method: string,
  data?: unknown | undefined,
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);

  // Handle 204 No Content responses
  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return undefined as T;
  }

  // Parse JSON response
  return await res.json() as T;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    // Build URL from queryKey, supporting query parameters as objects
    let url = '';
    const lastItem = queryKey[queryKey.length - 1];
    
    // Check if last item is an object (query params)
    if (
      typeof lastItem === 'object' && 
      lastItem !== null && 
      !Array.isArray(lastItem) &&
      !(lastItem instanceof Date)
    ) {
      // Path segments (all except last)
      const pathSegments = queryKey.slice(0, -1) as string[];
      url = pathSegments.join('/');
      
      // Add query parameters
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(lastItem)) {
        if (value !== undefined && value !== null) {
          params.append(key, String(value));
        }
      }
      const queryString = params.toString();
      if (queryString) {
        url += '?' + queryString;
      }
    } else {
      // Original behavior: join all segments
      url = queryKey.join('/') as string;
    }

    const res = await fetch(url, {
      credentials: "include",
    });

    // Always throw on errors (including 401) for consistent handling
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
