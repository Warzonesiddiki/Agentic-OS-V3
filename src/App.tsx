import { useState, useEffect, lazy, Suspense } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Shell, type PageId } from "./components/Shell";
import { ToastHost } from "./components/ToastHost";
import { FluidBackground } from "./components/FluidBackground";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { startRemoteSync } from "./store";
import { startOSRemoteSync } from "./lib/os/store";

// Lazy-load page components for code splitting — each page is a separate chunk.
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Memories = lazy(() => import("./pages/Memories"));
const Recall = lazy(() => import("./pages/Recall"));
const Skills = lazy(() => import("./pages/Skills"));
const Sessions = lazy(() => import("./pages/Sessions"));
const Projects = lazy(() => import("./pages/Projects"));
const Vault = lazy(() => import("./pages/Vault"));
const Audit = lazy(() => import("./pages/Audit"));
const Safety = lazy(() => import("./pages/Safety"));
const Kernel = lazy(() => import("./pages/os/Kernel"));
const Graph = lazy(() => import("./pages/os/Graph"));
const Cli = lazy(() => import("./pages/os/Cli"));
const Dream = lazy(() => import("./pages/os/Dream"));
const Evals = lazy(() => import("./pages/os/Evals"));
const LiveAgents = lazy(() => import("./pages/os/LiveAgents"));
const Analytics = lazy(() => import("./pages/os/Analytics"));
const Approvals = lazy(() => import("./pages/os/Approvals"));
const ProcessExplorer = lazy(() => import("./pages/ProcessExplorer"));
const Docs = lazy(() => import("./pages/Docs"));
const Settings = lazy(() => import("./pages/Settings"));
const PipelineBuilder = lazy(() => import("./pages/PipelineBuilder"));

const PAGE_COMPONENTS = {
  dashboard: Dashboard,
  memories: Memories,
  recall: Recall,
  skills: Skills,
  sessions: Sessions,
  projects: Projects,
  vault: Vault,
  audit: Audit,
  safety: Safety,
  kernel: Kernel,
  graph: Graph,
  cli: Cli,
  dream: Dream,
  evals: Evals,
  liveagents: LiveAgents,
  processexplorer: ProcessExplorer,
  analytics: Analytics,
  approvals: Approvals,
  pipelines: PipelineBuilder,
  docs: Docs,
  settings: Settings,
} as Record<PageId, React.ComponentType<{ setPage?: (p: PageId) => void }>>;

export default function App() {
  const [page, setPage] = useState<PageId>("dashboard");
  useEffect(() => {
    startRemoteSync().catch(() => {});
    startOSRemoteSync();
  }, []);

  const PageComponent = PAGE_COMPONENTS[page];

  return (
    <>
    <ErrorBoundary>
    <ToastHost />
    <FluidBackground />
    <Shell page={page} setPage={setPage}>
      <AnimatePresence mode="wait">
        <motion.div
          key={page}
          initial={{ opacity: 0, y: 12, filter: "blur(4px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -12, filter: "blur(4px)" }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        >
          <Suspense fallback={<div role="status" aria-label="Loading page" className="flex items-center justify-center h-64 text-zinc-500">Loading…</div>}>
            <PageComponent setPage={setPage} />
          </Suspense>
        </motion.div>
      </AnimatePresence>
    </Shell>
    </ErrorBoundary>
    </>
  );
}
