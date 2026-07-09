import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import './index.css';
import { router } from './router';
import { queryClient } from './lib/query-client';
import { startRemoteSync } from './store';
import { ErrorBoundary } from './components/ErrorBoundary';

// PHASE 5/17 wiring: activate the real React Router + TanStack Query.
// startRemoteSync() opens the SSE subscription and hydrates the in-memory
// cache from the Hono backend — NO localStorage persistence of business data.
startRemoteSync();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>
);
