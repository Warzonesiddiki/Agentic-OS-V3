import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '..');
const outputPath = 'docs/bmad/releases/evidence/2026-07-24-authoritative-claim-scan.json';

const documentExtensions = new Set(['.md', '.yaml', '.yml']);
const excludedPathFragments = ['/docs/omniroute/', '/node_modules/', '/dist/', '/coverage/'];
const claimPatterns = [
  { id: 'release-ready', expression: /\brelease[- ]ready\b/giu },
  { id: 'release-candidate', expression: /\brelease candidate\b/giu },
  { id: 'production-ready', expression: /\bproduction[- ]ready\b/giu },
  { id: 'perfection-score', expression: /\b(?:94|98|100)\/100\b/giu },
  { id: 'legacy-test-count', expression: /\b(?:91\/91|249\/249|255\/255)\b/giu },
  { id: 'legacy-migration-range', expression: /\b0049(?:–|-|\.{2})005[0-3]\b/giu },
  { id: 'zero-compromise', expression: /\bzero compromises?\b/giu },
  {
    id: 'all-feature-claims',
    expression: /\ball feature claims match(?: validated behavior)?\b/giu,
  },
];

const findingSchema = z.object({
  path: z.string().min(1),
  line: z.number().int().positive(),
  pattern: z.string().min(1),
  excerpt: z.string().min(1),
  classification: z.enum([
    'current-blocked-governance',
    'historical-snapshot',
    'historical-campaign-record',
    'historical-review-record',
    'planning-target',
    'requires-remediation',
  ]),
  disposition: z.string().min(1),
});

type Finding = z.infer<typeof findingSchema>;

function isDocument(path: string): boolean {
  const extension = path.slice(path.lastIndexOf('.'));
  return documentExtensions.has(extension);
}

function walk(path: string): string[] {
  const entries: string[] = [];
  for (const entry of readdirSync(path)) {
    const fullPath = join(path, entry);
    const normalizedPath = fullPath.replaceAll('\\', '/');
    if (excludedPathFragments.some((fragment) => normalizedPath.includes(fragment))) {
      continue;
    }
    if (statSync(fullPath).isDirectory()) {
      entries.push(...walk(fullPath));
    } else if (isDocument(fullPath)) {
      entries.push(fullPath);
    }
  }
  return entries;
}

function isCurrentAuthority(path: string): boolean {
  return [
    'docs/bmad/README.md',
    'docs/bmad/baseline-2026-07-24-gate0.md',
    'docs/bmad/sprint-status.yaml',
    'docs/bmad/releases/R1-release-gate.md',
  ].includes(path);
}

function documentHasBlockedPreamble(content: string): boolean {
  return (
    /release blocked/iu.test(content.slice(0, 3000)) &&
    /historical|non-authoritative|not current/iu.test(content.slice(0, 3000))
  );
}

function classify(path: string, content: string): Finding['classification'] {
  if (path.startsWith('docs/bmad/baseline-') && !path.endsWith('baseline-2026-07-24-gate0.md')) {
    return 'historical-snapshot';
  }
  if (path.startsWith('docs/bmad/stories/E') && !path.startsWith('docs/bmad/stories/E10-')) {
    return 'historical-snapshot';
  }
  if (
    path.startsWith('docs/bmad/stories/E10-') &&
    /R1 remains blocked|release blocked/iu.test(content.slice(0, 1600))
  ) {
    return 'current-blocked-governance';
  }
  if (path.endsWith('01-brainstorming.md')) {
    return 'planning-target';
  }
  if (path.startsWith('docs/bmad/subagents/') || path.endsWith('BMAD-METHOD-RESEARCH.md')) {
    return 'historical-campaign-record';
  }
  if (path.startsWith('docs/bmad/reviews/') || path.endsWith('retrospective-final.md')) {
    return 'historical-review-record';
  }
  if (path.includes('_bmad-output/') || path.endsWith('REDEMPTION_PLAN.md')) {
    return 'planning-target';
  }
  if (isCurrentAuthority(path) && documentHasBlockedPreamble(content)) {
    return 'current-blocked-governance';
  }
  if (
    path.endsWith('docs/PRODUCTION_CHECKLIST.md') ||
    path.endsWith('docs/PLAN_TRACKER.md') ||
    path.endsWith('docs/PERFECTION_METRICS.md')
  ) {
    return documentHasBlockedPreamble(content) ? 'historical-snapshot' : 'requires-remediation';
  }
  return 'requires-remediation';
}

function dispositionFor(classification: Finding['classification']): string {
  const dispositions: Record<Finding['classification'], string> = {
    'current-blocked-governance':
      'Retained only in a document whose preamble says the R1 decision is blocked and whose legacy sections are historical.',
    'historical-snapshot':
      'Retained as dated historical evidence; it cannot be used as current R1 proof.',
    'historical-campaign-record':
      'Retained as campaign history; its score/completion language is not a release decision.',
    'historical-review-record':
      'Retained as a dated prior review; E10-S30 must issue any fresh decision.',
    'planning-target': 'A target or correction-plan statement, not a current validation claim.',
    'requires-remediation':
      'Current/unclassified claim requires a documentation correction before Gate 0 can close.',
  };
  return dispositions[classification];
}

function collectFindings(): Finding[] {
  const scopes = [
    resolve(repositoryRoot, 'README.md'),
    resolve(repositoryRoot, 'docs/bmad'),
    resolve(repositoryRoot, 'docs/PRODUCTION_CHECKLIST.md'),
    resolve(repositoryRoot, 'docs/PLAN_TRACKER.md'),
    resolve(repositoryRoot, 'docs/PERFECTION_METRICS.md'),
    resolve(repositoryRoot, 'docs/REDEMPTION_PLAN.md'),
    resolve(repositoryRoot, '_bmad-output'),
  ];
  const files = scopes.flatMap((scope) => (statSync(scope).isDirectory() ? walk(scope) : [scope]));
  const findings: Finding[] = [];

  for (const file of files) {
    const path = relative(repositoryRoot, file).replaceAll('\\', '/');
    const content = readFileSync(file, 'utf8');
    const classification = classify(path, content);
    const lines = content.split('\n');
    for (const [lineIndex, line] of lines.entries()) {
      for (const pattern of claimPatterns) {
        pattern.expression.lastIndex = 0;
        if (pattern.expression.test(line)) {
          findings.push({
            path,
            line: lineIndex + 1,
            pattern: pattern.id,
            excerpt: line.trim().slice(0, 500),
            classification,
            disposition: dispositionFor(classification),
          });
        }
      }
    }
  }

  return findings.sort(
    (left, right) =>
      left.path.localeCompare(right.path) ||
      left.line - right.line ||
      left.pattern.localeCompare(right.pattern)
  );
}

function main(): void {
  const write = process.argv.slice(2).includes('--write');
  const unknownOptions = process.argv
    .slice(2)
    .filter((argument) => argument !== '--write' && argument !== '--check');
  if (unknownOptions.length > 0) {
    throw new Error(
      'Usage: pnpm exec tsx scripts/scan-r1-documentation-claims.ts [--write|--check]'
    );
  }

  const findings = collectFindings();
  const validatedFindings = z.array(findingSchema).parse(findings);
  const unresolved = validatedFindings.filter(
    (finding) => finding.classification === 'requires-remediation'
  );
  const report = {
    schemaVersion: 'nexus.r1.documentation-claim-scan.v1',
    generatedAt: '2026-07-24T00:00:00.000Z',
    scope: {
      included: [
        'README.md',
        'docs/bmad/**',
        'docs/PRODUCTION_CHECKLIST.md',
        'docs/PLAN_TRACKER.md',
        'docs/PERFECTION_METRICS.md',
        'docs/REDEMPTION_PLAN.md',
        '_bmad-output/**',
      ],
      excluded: [
        'docs/omniroute/** (vendored/external reference material)',
        'raw test logs',
        'node_modules',
        'build output',
      ],
    },
    patterns: claimPatterns.map((pattern) => pattern.id),
    summary: {
      findings: validatedFindings.length,
      unresolvedCurrentClaims: unresolved.length,
      classifications: Object.fromEntries(
        [...new Set(validatedFindings.map((finding) => finding.classification))]
          .sort()
          .map((classification) => [
            classification,
            validatedFindings.filter((finding) => finding.classification === classification).length,
          ])
      ),
    },
    findings: validatedFindings,
  };

  if (write) {
    writeFileSync(
      resolve(repositoryRoot, outputPath),
      `${JSON.stringify(report, null, 2)}\n`,
      'utf8'
    );
  }

  console.log(
    `R1 documentation claim scan: findings=${validatedFindings.length}; unresolvedCurrentClaims=${unresolved.length}.`
  );
  if (unresolved.length > 0) {
    for (const finding of unresolved) {
      console.error(`- ${finding.path}:${finding.line} (${finding.pattern}): ${finding.excerpt}`);
    }
    process.exitCode = 1;
  }
}

try {
  main();
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown claim scan error';
  console.error(`R1 documentation claim scan failed: ${message}`);
  process.exitCode = 1;
}
