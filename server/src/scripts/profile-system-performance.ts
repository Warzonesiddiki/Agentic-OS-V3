import { withTransaction } from '../db/client.js';
import { memories } from '../db/client.js';
import { executeSandboxed } from '../services/sandbox.js';
import { performance } from 'perf_hooks';

export interface PerformanceMetrics {
  dbTransactionLatencyMs: number;
  sandboxExecutionLatencyMs: number;
  timestamp: string;
}

export async function runBenchmarks(): Promise<PerformanceMetrics> {
  // 1. Measure DB Transaction performance under a write-read lock cycle
  const dbStart = performance.now();
  await withTransaction(async (tx) => {
    // Insert a transient test record and fetch it
    const testId = `perf_test_${Date.now()}`;
    await tx.insert(memories).values({
      id: testId,
      kind: 'benchmark',
      title: 'Perf Test',
      content: 'Benchmark content',
      tags: 'test',
      importance: 1,
    });
  });
  const dbEnd = performance.now();

  // 2. Measure sandbox compile and run latency under isolation constraints
  const sandboxStart = performance.now();
  await executeSandboxed({
    code: 'return input.val * 2;',
    language: 'javascript',
    input: { val: 42 },
    timeoutMs: 5000,
  });
  const sandboxEnd = performance.now();

  return {
    dbTransactionLatencyMs: dbEnd - dbStart,
    sandboxExecutionLatencyMs: sandboxEnd - sandboxStart,
    timestamp: new Date().toISOString(),
  };
}

async function run() {
  try {
    const metrics = await runBenchmarks();
    console.log(JSON.stringify({ status: 'SUCCESS', metrics }, null, 2));
    process.exit(0);
  } catch (error) {
    console.error(
      JSON.stringify({
        status: 'ERROR',
        error: error instanceof Error ? error.message : String(error),
      })
    );
    process.exit(1);
  }
}

if (
  process.argv[1] &&
  (process.argv[1].endsWith('profile-system-performance.ts') ||
    process.argv[1].endsWith('profile-system-performance.js'))
) {
  run();
}
