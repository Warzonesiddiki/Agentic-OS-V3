import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '..');
const defaultLedgerPath = 'docs/bmad/releases/evidence/2026-07-24-release-evidence-ledger.json';
const defaultTriagePath = 'docs/bmad/releases/evidence/2026-07-24-full-suite-triage.json';

const relativeEvidencePathSchema = z
  .string()
  .min(1)
  .refine(
    (value) =>
      value.startsWith('docs/bmad/releases/evidence/') &&
      !value.includes('..') &&
      !value.startsWith('/'),
    'must be a repository-relative path under docs/bmad/releases/evidence/'
  );

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u, 'must be a lowercase SHA-256 digest');
const evidenceStatusSchema = z.enum(['pass', 'blocked', 'failed', 'not_run']);

const artifactSchema = z.object({
  path: relativeEvidencePathSchema,
  sha256: sha256Schema.optional(),
  role: z.enum(['raw-command-output', 'triage', 'summary', 'report']),
});

const commandSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/u),
    evidenceClass: z.enum([
      'full-release',
      'targeted',
      'compile',
      'lint',
      'integration',
      'security',
    ]),
    command: z.string().min(1),
    workingDirectory: z.string().min(1),
    expected: z.object({
      exitCode: z.number().int().min(0),
      description: z.string().min(1),
    }),
    actual: z.object({
      exitCode: z.number().int().min(0),
      summary: z.string().min(1),
      observedAt: z.string().datetime({ offset: true }),
    }),
    status: evidenceStatusSchema,
    blockingReason: z.string().min(1).nullable(),
    artifacts: z.array(artifactSchema).min(1),
    reviewer: z.object({
      role: z.string().min(1),
      status: z.enum(['unassigned', 'reviewed', 'not_required']),
    }),
    rerun: z.object({
      status: z.enum(['not_run', 'passed', 'failed']),
      command: z.string().min(1),
      evidencePath: relativeEvidencePathSchema.nullable(),
    }),
  })
  .superRefine((record, context) => {
    if (record.status === 'pass' && record.actual.exitCode !== 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'a pass record must have actual.exitCode = 0',
        path: ['status'],
      });
    }
    if (record.status === 'pass' && record.blockingReason !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'a pass record cannot have a blockingReason',
        path: ['blockingReason'],
      });
    }
    if (record.status !== 'pass' && record.blockingReason === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'a non-pass record must state its blockingReason',
        path: ['blockingReason'],
      });
    }
    if (record.rerun.status === 'passed' && record.rerun.evidencePath === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'a passed rerun requires an evidencePath',
        path: ['rerun', 'evidencePath'],
      });
    }
  });

const ledgerSchema = z
  .object({
    schemaVersion: z.literal('nexus.r1.release-evidence-ledger.v2'),
    generatedAt: z.string().datetime({ offset: true }),
    evidenceSource: z.object({
      repositoryCommit: z.string().regex(/^[a-f0-9]{40}$/u),
      branch: z.string().min(1),
      note: z.string().min(1),
    }),
    environment: z.object({
      node: z.string().min(1),
      pnpm: z.string().min(1),
      platform: z.string().min(1),
      installMode: z.string().min(1),
      databaseMode: z.string().min(1),
    }),
    commands: z.array(commandSchema).min(1),
    releaseDecision: z.enum(['blocked', 'approved']),
    decisionDerivation: z.object({
      blockingCommandIds: z.array(z.string()).min(1),
      statement: z.string().min(1),
    }),
    reviewer: z.object({
      role: z.string().min(1),
      status: z.enum(['unassigned', 'reviewed']),
    }),
  })
  .superRefine((ledger, context) => {
    const ids = ledger.commands.map((command) => command.id);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'command IDs must be unique',
        path: ['commands'],
      });
    }

    const derivedBlockingIds = ledger.commands
      .filter((command) => command.status !== 'pass')
      .map((command) => command.id)
      .sort();
    const declaredBlockingIds = [...ledger.decisionDerivation.blockingCommandIds].sort();
    if (JSON.stringify(derivedBlockingIds) !== JSON.stringify(declaredBlockingIds)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'blockingCommandIds must exactly match every non-pass command',
        path: ['decisionDerivation', 'blockingCommandIds'],
      });
    }

    const derivedDecision = derivedBlockingIds.length === 0 ? 'approved' : 'blocked';
    if (ledger.releaseDecision !== derivedDecision) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `releaseDecision must be derived as ${derivedDecision}`,
        path: ['releaseDecision'],
      });
    }

    const fullSuite = ledger.commands.find((command) => command.id === 'full-suite');
    if (fullSuite === undefined || fullSuite.evidenceClass !== 'full-release') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'ledger must contain a full-suite full-release record',
        path: ['commands'],
      });
    }
  });

const triageClassificationSchema = z.enum([
  'actual_product_defect',
  'environment_native_dependency_failure',
  'stale_or_broken_test',
]);

const triageEntrySchema = z.object({
  id: z.string().regex(/^E10-S5-\d{3}$/u),
  test_file: z.string().regex(/^tests\/.+\.test\.ts$/u),
  source_test_file: z.string().min(1),
  case_coverage: z.object({
    scope: z.literal('all_failed_cases_in_file'),
    source: relativeEvidencePathSchema,
  }),
  classification: triageClassificationSchema,
  primary_signature: z.string().min(1),
  next_action: z.string().min(1),
  owner: z.object({
    accountable: z
      .string()
      .regex(/^@[A-Za-z0-9-]+(?: \([^)]+\))?$/u, 'must name one accountable CODEOWNER-style owner'),
    workstream: z.literal('E10-S22'),
    reviewer: z.literal('@quill'),
  }),
  remediation: z.object({
    action: z.string().min(1),
    required_coverage: z.string().min(1),
    closure_criteria: z.string().min(1),
  }),
  rerun: z.object({
    latest: z.object({
      command: z.string().min(1),
      status: z.enum(['passed', 'failed']),
      observedAt: z.string().datetime({ offset: true }),
      evidencePath: relativeEvidencePathSchema,
      scope: z.enum(['full-suite', 'exact-file']),
    }),
    required: z.object({
      command: z.string().min(1),
      expected_result: z.string().min(1),
      required_artifact: relativeEvidencePathSchema,
    }),
  }),
  replacement_coverage: z
    .object({
      removal_allowed: z.boolean(),
      approved: z.boolean(),
      replacement_test: z.string().min(1).nullable(),
      approval_evidence: relativeEvidencePathSchema.nullable(),
    })
    .superRefine((replacement, context) => {
      if (
        replacement.approved &&
        (replacement.replacement_test === null || replacement.approval_evidence === null)
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'approved replacement coverage requires test and approval evidence',
        });
      }
    }),
  disposition: z.enum(['open_release_blocker', 'verified_fixed', 'approved_replacement']),
});

const triageSchema = z
  .object({
    schemaVersion: z.literal('nexus.r1.full-suite-triage.v2'),
    runLog: relativeEvidencePathSchema,
    scope: z.string().min(1),
    summary: z.object({
      actual_product_defect: z.literal(51),
      environment_native_dependency_failure: z.literal(26),
      stale_or_broken_test: z.literal(21),
      failed_test_files: z.literal(98),
      failed_tests: z.literal(159),
    }),
    remediationPolicy: z.object({
      closure: z.string().min(1),
      nativeBinding: z.string().min(1),
      replacement: z.string().min(1),
    }),
    latestFullSuiteRerun: z.object({
      runLog: relativeEvidencePathSchema,
      observedAt: z.string().datetime({ offset: true }),
      failed_test_files: z.number().int().nonnegative(),
      failed_tests: z.number().int().nonnegative(),
      passed_test_files: z.number().int().nonnegative(),
      passed_tests: z.number().int().nonnegative(),
      skipped_tests: z.number().int().nonnegative(),
      classifications: z.object({
        actual_product_defect: z.number().int().nonnegative(),
        environment_native_dependency_failure: z.number().int().nonnegative(),
        stale_or_broken_test: z.number().int().nonnegative(),
      }),
    }),
    failures: z.array(triageEntrySchema).length(98),
  })
  .superRefine((triage, context) => {
    const ids = triage.failures.map((failure) => failure.id);
    const files = triage.failures.map((failure) => failure.test_file);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'triage IDs must be unique',
        path: ['failures'],
      });
    }
    if (new Set(files).size !== files.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'test_file entries must be unique',
        path: ['failures'],
      });
    }

    const observed = {
      actual_product_defect: 0,
      environment_native_dependency_failure: 0,
      stale_or_broken_test: 0,
    };
    for (const failure of triage.failures) {
      observed[failure.classification] += 1;
      if (
        failure.disposition === 'verified_fixed' &&
        (failure.rerun.latest.status !== 'passed' || failure.rerun.latest.scope !== 'exact-file')
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'verified_fixed requires a passed exact-file rerun',
          path: ['failures', failure.id],
        });
      }
      if (
        failure.disposition === 'approved_replacement' &&
        !failure.replacement_coverage.approved
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'approved_replacement requires approved replacement coverage',
          path: ['failures', failure.id],
        });
      }
    }

    for (const classification of triageClassificationSchema.options) {
      if (observed[classification] !== triage.summary[classification]) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${classification} baseline summary does not match entries`,
          path: ['summary', classification],
        });
      }
    }

    const unresolved = {
      actual_product_defect: 0,
      environment_native_dependency_failure: 0,
      stale_or_broken_test: 0,
    };
    for (const failure of triage.failures) {
      if (failure.disposition === 'open_release_blocker') {
        unresolved[failure.classification] += 1;
      }
    }
    for (const classification of triageClassificationSchema.options) {
      if (
        unresolved[classification] !== triage.latestFullSuiteRerun.classifications[classification]
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${classification} latest full-suite summary does not match open records`,
          path: ['latestFullSuiteRerun', 'classifications', classification],
        });
      }
    }
    const unresolvedFileCount = Object.values(unresolved).reduce((sum, count) => sum + count, 0);
    if (unresolvedFileCount !== triage.latestFullSuiteRerun.failed_test_files) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'latest failed_test_files does not match open remediation records',
        path: ['latestFullSuiteRerun', 'failed_test_files'],
      });
    }
  });

type Artifact = z.infer<typeof artifactSchema>;
type Ledger = z.infer<typeof ledgerSchema>;
type Triage = z.infer<typeof triageSchema>;

function parseJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as unknown;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'unknown JSON parsing error';
    throw new Error(`Could not parse ${relative(repositoryRoot, path)}: ${message}`);
  }
}

function absoluteRepositoryPath(path: string): string {
  const resolvedPath = resolve(repositoryRoot, path);
  const pathFromRoot = relative(repositoryRoot, resolvedPath);
  if (pathFromRoot.startsWith('..') || pathFromRoot === '') {
    throw new Error(`Evidence path escapes repository root: ${path}`);
  }
  return resolvedPath;
}

function verifyArtifact(artifact: Artifact): void {
  const artifactPath = absoluteRepositoryPath(artifact.path);
  if (!existsSync(artifactPath) || !statSync(artifactPath).isFile()) {
    throw new Error(`Evidence artifact is missing: ${artifact.path}`);
  }
  if (artifact.sha256 !== undefined) {
    const digest = createHash('sha256').update(readFileSync(artifactPath)).digest('hex');
    if (digest !== artifact.sha256) {
      throw new Error(`Evidence artifact checksum mismatch: ${artifact.path}`);
    }
  }
}

function verifyLedgerArtifacts(ledger: Ledger): void {
  for (const command of ledger.commands) {
    for (const artifact of command.artifacts) {
      verifyArtifact(artifact);
    }
    if (command.rerun.evidencePath !== null) {
      const rerunPath = absoluteRepositoryPath(command.rerun.evidencePath);
      if (!existsSync(rerunPath)) {
        throw new Error(`Rerun evidence is missing: ${command.rerun.evidencePath}`);
      }
    }
  }
}

function verifyTriageArtifacts(triage: Triage): void {
  const runLogPath = absoluteRepositoryPath(triage.runLog);
  if (!existsSync(runLogPath)) {
    throw new Error(`Triage baseline raw log is missing: ${triage.runLog}`);
  }
  const latestFullSuitePath = absoluteRepositoryPath(triage.latestFullSuiteRerun.runLog);
  if (!existsSync(latestFullSuitePath)) {
    throw new Error(
      `Triage latest full-suite rerun is missing: ${triage.latestFullSuiteRerun.runLog}`
    );
  }
  for (const failure of triage.failures) {
    const latestRerunPath = absoluteRepositoryPath(failure.rerun.latest.evidencePath);
    if (!existsSync(latestRerunPath)) {
      throw new Error(`Triage rerun evidence is missing: ${failure.rerun.latest.evidencePath}`);
    }
    if (failure.disposition === 'verified_fixed') {
      const rerunArtifactPath = absoluteRepositoryPath(failure.rerun.required.required_artifact);
      if (!existsSync(rerunArtifactPath)) {
        throw new Error(
          `Verified triage rerun is missing its artifact: ${failure.rerun.required.required_artifact}`
        );
      }
    }
  }
}

function parseArguments(): { ledgerPath: string; triagePath: string } {
  const values = process.argv.slice(2);
  let ledgerPath = defaultLedgerPath;
  let triagePath = defaultTriagePath;

  for (let index = 0; index < values.length; index += 1) {
    const option = values[index];
    const value = values[index + 1];
    if (option === '--ledger' && value !== undefined) {
      ledgerPath = value;
      index += 1;
    } else if (option === '--triage' && value !== undefined) {
      triagePath = value;
      index += 1;
    } else {
      throw new Error(
        'Usage: pnpm exec tsx scripts/validate-r1-release-evidence.ts [--ledger <path>] [--triage <path>]'
      );
    }
  }

  return { ledgerPath, triagePath };
}

function main(): void {
  const { ledgerPath, triagePath } = parseArguments();
  const ledger = ledgerSchema.parse(parseJson(absoluteRepositoryPath(ledgerPath)));
  const triage = triageSchema.parse(parseJson(absoluteRepositoryPath(triagePath)));
  verifyLedgerArtifacts(ledger);
  verifyTriageArtifacts(triage);

  const openFailures = triage.failures.filter(
    (failure) => failure.disposition === 'open_release_blocker'
  ).length;
  console.log(
    `R1 release evidence valid: decision=${ledger.releaseDecision}; blockingCommands=${ledger.decisionDerivation.blockingCommandIds.join(',')}; openTriageRecords=${openFailures}.`
  );
}

try {
  main();
} catch (error: unknown) {
  if (error instanceof z.ZodError) {
    console.error('R1 release evidence schema validation failed:');
    for (const issue of error.issues) {
      console.error(`- ${issue.path.join('.') || '<root>'}: ${issue.message}`);
    }
  } else {
    const message = error instanceof Error ? error.message : 'Unknown validation error';
    console.error(`R1 release evidence validation failed: ${message}`);
  }
  process.exitCode = 1;
}
