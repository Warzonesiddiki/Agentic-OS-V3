import { lazy, Suspense, type ReactElement } from 'react';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { Loading } from './Loading';

/**
 * Code-split route views. `React.lazy` keeps each view in its own chunk so the
 * initial bundle stays small; the Tauri shell boots fast and views load on
 * demand. Add new views here as the desktop app grows.
 */
export const routes = {
  '/': lazy(() => import('../views/HomeView')),
  '/agents': lazy(() => import('../views/AgentsView')),
  '/memory': lazy(() => import('../views/MemoryView')),
  '/settings': lazy(() => import('../views/SettingsView')),
} as const;

export type RoutePath = keyof typeof routes;

/**
 * Minimal hash-based router (no external dependency). Reads `location.hash`,
 * resolves it to a known route, and renders the matching lazy view inside an
 * ErrorBoundary + Suspense (loading fallback).
 */
export function Router(): ReactElement {
  const path = (location.hash.replace(/^#/, '') || '/') as RoutePath;
  const View = routes[path] ?? routes['/'];

  return (
    <ErrorBoundary>
      <Suspense fallback={<Loading label="Loading view…" />}>
        <View />
      </Suspense>
    </ErrorBoundary>
  );
}
