import { createBrowserRouter, Navigate, Outlet, useLocation } from 'react-router-dom';
import { lazy, Suspense, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shell } from './components/Shell';
import { ToastHost } from './components/ToastHost';
import { FluidBackground } from './components/FluidBackground';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PageErrorBoundary } from './components/PageErrorBoundary';
import { startRemoteSync } from './store';
import { startOSRemoteSync } from './lib/os/store';

// Lazy-load page components for code splitting — each page is a separate chunk.
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Memories = lazy(() => import('./pages/Memories'));
const Recall = lazy(() => import('./pages/Recall'));
const Skills = lazy(() => import('./pages/Skills'));
const Sessions = lazy(() => import('./pages/Sessions'));
const Projects = lazy(() => import('./pages/Projects'));
const Vault = lazy(() => import('./pages/Vault'));
const Audit = lazy(() => import('./pages/Audit'));
const Safety = lazy(() => import('./pages/Safety'));
const Marketplace = lazy(() => import('./pages/Marketplace'));
const Kernel = lazy(() => import('./pages/os/Kernel'));
const Graph = lazy(() => import('./pages/os/Graph'));
const Cli = lazy(() => import('./pages/os/Cli'));
const Dream = lazy(() => import('./pages/os/Dream'));
const Evals = lazy(() => import('./pages/os/Evals'));
const LiveAgents = lazy(() => import('./pages/os/LiveAgents'));
const Analytics = lazy(() => import('./pages/os/Analytics'));
const Approvals = lazy(() => import('./pages/os/Approvals'));
const SelfOpt = lazy(() => import('./pages/os/SelfOpt'));
const Reliability = lazy(() => import('./pages/os/Reliability'));
const ProcessExplorer = lazy(() => import('./pages/ProcessExplorer'));
const Docs = lazy(() => import('./pages/Docs'));
const Settings = lazy(() => import('./pages/Settings'));
const PipelineBuilder = lazy(() => import('./pages/PipelineBuilder'));
const MemoryGraph = lazy(() => import('./pages/MemoryGraph'));
const MemoryHealth = lazy(() => import('./pages/MemoryHealth'));

// PHASE 17 — Enterprise admin console (real backend, no localStorage demos)
const AdminUsers = lazy(() => import('./pages/admin/Users'));
const AdminKeys = lazy(() => import('./pages/admin/Keys'));
const AdminUsage = lazy(() => import('./pages/admin/Usage'));
const AdminAudit = lazy(() => import('./pages/admin/Audit'));
const AdminBilling = lazy(() => import('./pages/admin/Billing'));
const AdminSso = lazy(() => import('./pages/admin/Sso'));
const AdminRoles = lazy(() => import('./pages/admin/Roles'));
const AdminSiem = lazy(() => import('./pages/admin/Siem'));
const AdminTenant = lazy(() => import('./pages/admin/Tenant'));
const AdminCompliance = lazy(() => import('./pages/admin/Compliance'));
const AdminOnboarding = lazy(() => import('./pages/admin/Onboarding'));
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'));

function Layout() {
  useEffect(() => {
    startRemoteSync().catch(() => {});
    startOSRemoteSync();
  }, []);

  const location = useLocation();
  const prefersReducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const motionProps = prefersReducedMotion
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: 0.1 },
      }
    : {
        initial: { opacity: 0, y: 12, filter: 'blur(4px)' },
        animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
        exit: { opacity: 0, y: -12, filter: 'blur(4px)' },
        transition: { duration: 0.25, ease: 'easeOut' as const },
      };

  return (
    <ErrorBoundary>
      <ToastHost />
      <FluidBackground />
      <Shell>
        <AnimatePresence mode="wait">
          <motion.div key={location.pathname} {...motionProps}>
            <Suspense
              fallback={
                <div
                  role="status"
                  aria-label="Loading page"
                  className="flex items-center justify-center h-64 text-zinc-500"
                >
                  Loading…
                </div>
              }
            >
              <Outlet />
            </Suspense>
          </motion.div>
        </AnimatePresence>
      </Shell>
    </ErrorBoundary>
  );
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { path: '', element: <Navigate to="/dashboard" replace /> },
      {
        path: 'dashboard',
        element: (
          <PageErrorBoundary>
            <Dashboard />
          </PageErrorBoundary>
        ),
      },
      {
        path: 'memories',
        element: (
          <PageErrorBoundary>
            <Memories />
          </PageErrorBoundary>
        ),
      },
      {
        path: 'memorygraph',
        element: (
          <PageErrorBoundary>
            <MemoryGraph />
          </PageErrorBoundary>
        ),
      },
      {
        path: 'memoryhealth',
        element: (
          <PageErrorBoundary>
            <MemoryHealth />
          </PageErrorBoundary>
        ),
      },
      {
        path: 'recall',
        element: (
          <PageErrorBoundary>
            <Recall />
          </PageErrorBoundary>
        ),
      },
      {
        path: 'skills',
        element: (
          <PageErrorBoundary>
            <Skills />
          </PageErrorBoundary>
        ),
      },
      {
        path: 'sessions',
        element: (
          <PageErrorBoundary>
            <Sessions />
          </PageErrorBoundary>
        ),
      },
      {
        path: 'projects',
        element: (
          <PageErrorBoundary>
            <Projects />
          </PageErrorBoundary>
        ),
      },
      {
        path: 'vault',
        element: (
          <PageErrorBoundary>
            <Vault />
          </PageErrorBoundary>
        ),
      },
      {
        path: 'audit',
        element: (
          <PageErrorBoundary>
            <Audit />
          </PageErrorBoundary>
        ),
      },
      {
        path: 'safety',
        element: (
          <PageErrorBoundary>
            <Safety />
          </PageErrorBoundary>
        ),
      },
      {
        path: 'marketplace',
        element: (
          <PageErrorBoundary>
            <Marketplace />
          </PageErrorBoundary>
        ),
      },
      {
        path: 'kernel',
        element: (
          <PageErrorBoundary>
            <Kernel />
          </PageErrorBoundary>
        ),
      },
      {
        path: 'graph',
        element: (
          <PageErrorBoundary>
            <Graph />
          </PageErrorBoundary>
        ),
      },
      {
        path: 'cli',
        element: (
          <PageErrorBoundary>
            <Cli />
          </PageErrorBoundary>
        ),
      },
      {
        path: 'dream',
        element: (
          <PageErrorBoundary>
            <Dream />
          </PageErrorBoundary>
        ),
      },
      {
        path: 'evals',
        element: (
          <PageErrorBoundary>
            <Evals />
          </PageErrorBoundary>
        ),
      },
      {
        path: 'liveagents',
        element: (
          <PageErrorBoundary>
            <LiveAgents />
          </PageErrorBoundary>
        ),
      },
      {
        path: 'processexplorer',
        element: (
          <PageErrorBoundary>
            <ProcessExplorer />
          </PageErrorBoundary>
        ),
      },
      {
        path: 'analytics',
        element: (
          <PageErrorBoundary>
            <Analytics />
          </PageErrorBoundary>
        ),
      },
      {
        path: 'approvals',
        element: (
          <PageErrorBoundary>
            <Approvals />
          </PageErrorBoundary>
        ),
      },
      {
        path: 'selfopt',
        element: (
          <PageErrorBoundary>
            <SelfOpt />
          </PageErrorBoundary>
        ),
      },
      {
        path: 'reliability',
        element: (
          <PageErrorBoundary>
            <Reliability />
          </PageErrorBoundary>
        ),
      },
      {
        path: 'pipelines',
        element: (
          <PageErrorBoundary>
            <PipelineBuilder />
          </PageErrorBoundary>
        ),
      },
      {
        path: 'docs',
        element: (
          <PageErrorBoundary>
            <Docs />
          </PageErrorBoundary>
        ),
      },
      {
        path: 'settings',
        element: (
          <PageErrorBoundary>
            <Settings />
          </PageErrorBoundary>
        ),
      },
      // ── PHASE 17 Enterprise Admin Console (all routes -> api-client -> Hono backend) ──
      {
        path: 'admin',
        element: (
          <PageErrorBoundary>
            <AdminLayout />
          </PageErrorBoundary>
        ),
        children: [
          { path: '', element: <Navigate to="/admin/users" replace /> },
          {
            path: 'users',
            element: (
              <PageErrorBoundary>
                <AdminUsers />
              </PageErrorBoundary>
            ),
          },
          {
            path: 'keys',
            element: (
              <PageErrorBoundary>
                <AdminKeys />
              </PageErrorBoundary>
            ),
          },
          {
            path: 'usage',
            element: (
              <PageErrorBoundary>
                <AdminUsage />
              </PageErrorBoundary>
            ),
          },
          {
            path: 'audit',
            element: (
              <PageErrorBoundary>
                <AdminAudit />
              </PageErrorBoundary>
            ),
          },
          {
            path: 'billing',
            element: (
              <PageErrorBoundary>
                <AdminBilling />
              </PageErrorBoundary>
            ),
          },
          {
            path: 'sso',
            element: (
              <PageErrorBoundary>
                <AdminSso />
              </PageErrorBoundary>
            ),
          },
          {
            path: 'roles',
            element: (
              <PageErrorBoundary>
                <AdminRoles />
              </PageErrorBoundary>
            ),
          },
          {
            path: 'siem',
            element: (
              <PageErrorBoundary>
                <AdminSiem />
              </PageErrorBoundary>
            ),
          },
          {
            path: 'tenant',
            element: (
              <PageErrorBoundary>
                <AdminTenant />
              </PageErrorBoundary>
            ),
          },
          {
            path: 'compliance',
            element: (
              <PageErrorBoundary>
                <AdminCompliance />
              </PageErrorBoundary>
            ),
          },
          {
            path: 'onboarding',
            element: (
              <PageErrorBoundary>
                <AdminOnboarding />
              </PageErrorBoundary>
            ),
          },
        ],
      },
      { path: '*', element: <Navigate to="/dashboard" replace /> },
    ],
  },
]);
