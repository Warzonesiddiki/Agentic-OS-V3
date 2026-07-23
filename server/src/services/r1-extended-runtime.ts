/**
 * Extended R1 runtime including all new E2-E5 services
 * Composes SDK services with SQL implementations where available
 */
import {
  createSqlR1Repositories,
  R1Service,
  ProjectTransferService,
  SqlCapabilityGovernanceStore,
  InMemoryCapabilityGovernanceStore,
  R1RecallService,
  RecallFeedbackService,
  TaskWorker,
  TaskEventStreamService,
  DurableApprovalService,
  BoundedToolGateway,
  KillSwitchService,
  TelemetryService,
  EvidenceTimelineService,
  SerenaCodeIntelligence,
  SqlCheckpoints,
  SqlLeases,
  SqlCompensations,
  SqlFeedback,
  SqlContradiction,
  SqlKillSwitch,
  SqlDurableApprovals,
  SqlTelemetry,
  type SqlExecutor,
  type R1Repositories,
} from '@agentic-os/sdk';
import { CapabilityGovernanceService } from './capability-governance.js';

export interface ExtendedR1Runtime {
  readonly repositories: R1Repositories;
  readonly service: R1Service;
  readonly governance: CapabilityGovernanceService;
  readonly transfer: ProjectTransferService;
  readonly recall: R1RecallService;
  readonly feedback: RecallFeedbackService;
  readonly worker: TaskWorker;
  readonly eventStream: TaskEventStreamService;
  readonly approvals: DurableApprovalService;
  readonly toolGateway: BoundedToolGateway;
  readonly killSwitch: KillSwitchService;
  readonly telemetry: TelemetryService;
  readonly evidenceTimeline: EvidenceTimelineService;
  readonly serena: SerenaCodeIntelligence;
  readonly applyProjectImport: (candidate: unknown) => Promise<any>;
}

export function createExtendedSqlR1Runtime(
  executor: SqlExecutor,
  options: { now?: () => string; projectRoots?: Map<string, string> } = {},
  runInTransaction?: <T>(fn: () => Promise<T>) => Promise<T>,
): ExtendedR1Runtime {
  const repos = createSqlR1Repositories(executor);
  const governanceStore = new SqlCapabilityGovernanceStore(executor);
  const governance = new CapabilityGovernanceService(governanceStore);
  const transfer = new ProjectTransferService(repos);

  // extended SQL repos
  const checkpoints = new SqlCheckpoints(executor);
  const leases = new SqlLeases(executor);
  const compensations = new SqlCompensations(executor);
  const feedbackRepo = new SqlFeedback(executor);
  const contradictionRepo = new SqlContradiction(executor);
  const killSwitchStore = new SqlKillSwitch(executor);
  const durableApprovalsRepo = new SqlDurableApprovals(executor);
  const telemetrySql = new SqlTelemetry(executor);

  const recall = new R1RecallService(repos, { embeddingAvailable: false });
  const feedback = new RecallFeedbackService(repos, feedbackRepo, contradictionRepo, { now: options.now });
  const worker = new TaskWorker(repos, checkpoints, leases, compensations, { now: options.now });
  const eventStream = new TaskEventStreamService(repos);
  const approvals = new DurableApprovalService(repos, durableApprovalsRepo, { now: options.now, killSwitchEnabled: async () => (await killSwitchStore.get())?.enabled ?? false });
  const toolGateway = new BoundedToolGateway(repos, {
    now: options.now,
    projectRoots: options.projectRoots,
    isApprovalApproved: async (id: string) => {
      const appr = await durableApprovalsRepo.get('', id);
      return appr?.state === 'approved';
    },
    sandboxExecutor: async (command, args, timeoutMs) => {
      // Bounded sandbox: only allow ls, cat, echo, npm, pnpm, node, git for R1 demo
      const allowed = ['ls', 'cat', 'echo', 'npm', 'pnpm', 'node', 'git', 'pwd'];
      if (!allowed.includes(command)) throw new Error(`Command not allowed in sandbox: ${command}`);
      // Simulate execution - in real would use child_process with timeout
      return { stdout: `mock exec: ${command} ${args.join(' ')}`, stderr: '', exitCode: 0 };
    },
    fileReader: async (fullPath: string) => {
      // Enforce project root already done in gateway; here we simulate read
      const { readFile } = await import('node:fs/promises');
      return readFile(fullPath, 'utf8');
    },
    fileWriter: async (fullPath: string, content: string) => {
      const { writeFile, mkdir } = await import('node:fs/promises');
      const { dirname } = await import('node:path');
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, content, 'utf8');
    },
  });
  const killSwitch = new KillSwitchService(repos, killSwitchStore, { now: options.now });
  const telemetry = new TelemetryService({ now: options.now, spanExporter: { export: async (spans) => { for (const s of spans) await telemetrySql.saveSpan(s); } } });
  const evidenceTimeline = new EvidenceTimelineService(repos, { now: options.now });
  const serena = new SerenaCodeIntelligence({ now: options.now });

  const applyProjectImport = async (candidate: unknown) => {
    const svc = new ProjectTransferService(repos);
    if (runInTransaction) return svc.applyImport(candidate, runInTransaction);
    return svc.applyImport(candidate);
  };

  return {
    repositories: repos,
    service: new R1Service(repos, { now: options.now }),
    governance,
    transfer,
    recall,
    feedback,
    worker,
    eventStream,
    approvals,
    toolGateway,
    killSwitch,
    telemetry,
    evidenceTimeline,
    serena,
    applyProjectImport,
  };
}

// In-memory runtime for tests/offline
export function createInMemoryExtendedRuntime(repos: R1Repositories, options: { now?: () => string; projectRoots?: Map<string, string> } = {}): ExtendedR1Runtime {
  const governanceStore = new InMemoryCapabilityGovernanceStore();
  const governance = new CapabilityGovernanceService(governanceStore);
  const transfer = new ProjectTransferService(repos);
  const recall = new R1RecallService(repos);
  const feedback = new RecallFeedbackService(repos);
  const worker = new TaskWorker(repos);
  const eventStream = new TaskEventStreamService(repos);
  const approvals = new DurableApprovalService(repos);
  const toolGateway = new BoundedToolGateway(repos, { now: options.now, projectRoots: options.projectRoots });
  const killSwitch = new KillSwitchService(repos);
  const telemetry = new TelemetryService({ now: options.now });
  const evidenceTimeline = new EvidenceTimelineService(repos);
  const serena = new SerenaCodeIntelligence({ now: options.now });

  return {
    repositories: repos,
    service: new R1Service(repos, { now: options.now }),
    governance,
    transfer,
    recall,
    feedback,
    worker,
    eventStream,
    approvals,
    toolGateway,
    killSwitch,
    telemetry,
    evidenceTimeline,
    serena,
    applyProjectImport: (c) => transfer.applyImport(c),
  };
}
