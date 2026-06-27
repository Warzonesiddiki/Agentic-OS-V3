import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Shell, type PageId } from "./components/Shell";
import { ToastHost } from "./components/ToastHost";
import { FluidBackground } from "./components/FluidBackground";
import { startRemoteSync } from "./store";
import { startOSRemoteSync } from "./lib/os/store";
import Dashboard from "./pages/Dashboard";
import Memories from "./pages/Memories";
import Recall from "./pages/Recall";
import Skills from "./pages/Skills";
import Sessions from "./pages/Sessions";
import Projects from "./pages/Projects";
import Vault from "./pages/Vault";
import Audit from "./pages/Audit";
import Safety from "./pages/Safety";
import Kernel from "./pages/os/Kernel";
import Graph from "./pages/os/Graph";
import Cli from "./pages/os/Cli";
import Dream from "./pages/os/Dream";
import Evals from "./pages/os/Evals";
import LiveAgents from "./pages/os/LiveAgents";
import Analytics from "./pages/os/Analytics";
import Approvals from "./pages/os/Approvals";
import Docs from "./pages/Docs";
import Settings from "./pages/Settings";

const PAGE_COMPONENTS: Record<PageId, React.FC<{ setPage?: (p: PageId) => void }>> = {
  dashboard: Dashboard as React.FC<{ setPage?: (p: PageId) => void }>,
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
  analytics: Analytics,
  approvals: Approvals,
  docs: Docs,
  settings: Settings,
};

export default function App() {
  const [page, setPage] = useState<PageId>("dashboard");
  useEffect(() => {
    startRemoteSync().catch(() => {});
    startOSRemoteSync();
  }, []);

  const PageComponent = PAGE_COMPONENTS[page];

  return (
    <>
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
          <PageComponent setPage={setPage} />
        </motion.div>
      </AnimatePresence>
    </Shell>
    </>
  );
}
