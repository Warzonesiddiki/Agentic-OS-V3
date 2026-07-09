import { QueryClient } from '@tanstack/react-query';

/**
 * Global TanStack Query client for the control plane.
 * Every read/write in the app MUST go through this layer -> api-client -> Hono backend.
 * No localStorage caching of business data is allowed; the cache is an in-memory
 * mirror of authoritative backend state, invalidated by SSE events.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});
