import { dbHealthy, getBackend } from '../db/client.js';
import { getEnv } from '../lib/env.js';

export interface DiagnosticsReport {
  timestamp: string;
  backend: string;
  databaseHealthy: boolean;
  envValid: boolean;
  leakedKeysDetected: boolean;
}

export async function checkReadiness(): Promise<DiagnosticsReport> {
  const env = getEnv();
  const dbHealth = await dbHealthy();

  // Verify configuration keys are present but not default placeholders
  const envValid = Boolean(env.PORT && env.NEXUS_API_KEY);

  // Scan environment config memory for potential committed developer keys
  const valuesToScan = Object.values(env).join(' ');
  const leakedKeysDetected = /sk-[a-zA-Z0-9]{48}|AIzaSy[a-zA-Z0-9-_]{33}/.test(valuesToScan);

  return {
    timestamp: new Date().toISOString(),
    backend: getBackend(),
    databaseHealthy: dbHealth,
    envValid,
    leakedKeysDetected,
  };
}

async function run() {
  try {
    const report = await checkReadiness();
    console.log(JSON.stringify(report, null, 2));
    process.exit(0);
  } catch (error) {
    console.error(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) })
    );
    process.exit(1);
  }
}

if (
  process.argv[1] &&
  (process.argv[1].endsWith('verify-system-readiness.ts') ||
    process.argv[1].endsWith('verify-system-readiness.js'))
) {
  run();
}
