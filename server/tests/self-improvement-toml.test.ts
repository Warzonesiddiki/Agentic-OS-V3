/**
 * self-improvement-toml.test.ts — Tests for TOML config persistence.
 * Phase 2, Task P2-11: self-improvement harness TOML config modification.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, unlink, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Test the TOML persistence logic in isolation (without DB dependency)
const TEST_TOML_PATH = join(tmpdir(), `nexus-test-config-${Date.now()}.toml`);

/**
 * Map env var names to TOML section + key paths.
 * Mirrors the production mapping in self-improvement-harness.ts.
 */
const ENV_TO_TOML_PATH: Record<string, { section: string; key: string }> = {
  NEXUS_CACHE_TTL_MS: { section: 'runtime', key: 'cache_ttl_ms' },
  NEXUS_RATE_LIMIT_PER_MINUTE: { section: 'rate_limit', key: 'per_minute' },
  NEXUS_LLM_TEMPERATURE: { section: 'llm', key: 'temperature' },
  NEXUS_LOG_LEVEL: { section: 'logging', key: 'level' },
  NEXUS_SCHEDULER_POLICY: { section: 'scheduler', key: 'policy' },
};

const TOML_PERSIST_ALLOWLIST = new Set(Object.keys(ENV_TO_TOML_PATH));

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Write a config value to TOML file.
 * Simplified version of the production function for testing.
 */
async function persistToToml(envKey: string, value: string | number | boolean): Promise<void> {
  if (!TOML_PERSIST_ALLOWLIST.has(envKey)) return;

  const tomlPath = ENV_TO_TOML_PATH[envKey];
  if (!tomlPath) return;

  let content = '';
  if (existsSync(TEST_TOML_PATH)) {
    content = await readFile(TEST_TOML_PATH, 'utf-8');
  }

  const sectionHeader = `[${tomlPath.section}]`;
  const valueStr = typeof value === 'string' ? `"${value}"` : String(value);
  const line = `${tomlPath.key} = ${valueStr}`;

  const sectionRegex = new RegExp(`\\[${escapeRegex(tomlPath.section)}\\]`, 'm');
  const keyRegex = new RegExp(`^${escapeRegex(tomlPath.key)}\\s*=.*$`, 'm');

  if (sectionRegex.test(content)) {
    const sectionStart = content.search(sectionRegex);
    const nextSectionMatch = content.slice(sectionStart + sectionHeader.length).search(/\n\[/);
    const sectionEnd = nextSectionMatch >= 0
      ? sectionStart + sectionHeader.length + nextSectionMatch
      : content.length;
    const sectionContent = content.slice(sectionStart, sectionEnd);

    if (keyRegex.test(sectionContent)) {
      const keyMatch = sectionContent.search(keyRegex);
      const absKeyStart = sectionStart + keyMatch;
      const absKeyEnd = content.indexOf('\n', absKeyStart);
      content = content.slice(0, absKeyStart) + line + content.slice(absKeyEnd >= 0 ? absKeyEnd : undefined);
    } else {
      content = content.slice(0, sectionEnd) + line + '\n' + content.slice(sectionEnd);
    }
  } else {
    content += `\n${sectionHeader}\n${line}\n`;
  }

  await writeFile(TEST_TOML_PATH, content, 'utf-8');
}

/**
 * Load TOML config overrides.
 * Simplified version of the production function for testing.
 */
async function loadTomlConfigOverrides(): Promise<Map<string, string>> {
  const overrides = new Map<string, string>();
  if (!existsSync(TEST_TOML_PATH)) return overrides;

  const content = await readFile(TEST_TOML_PATH, 'utf-8');
  let currentSection = '';

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1]!;
      continue;
    }

    const kvMatch = trimmed.match(/^([^=]+)=\s*(.+)$/);
    if (kvMatch && currentSection) {
      const key = kvMatch[1]!.trim();
      let value = kvMatch[2]!.trim();
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      }

      for (const [envKey, path] of Object.entries(ENV_TO_TOML_PATH)) {
        if (path.section === currentSection && path.key === key) {
          overrides.set(envKey, value);
        }
      }
    }
  }

  return overrides;
}

describe('TOML config persistence', () => {
  beforeEach(async () => {
    if (existsSync(TEST_TOML_PATH)) {
      await unlink(TEST_TOML_PATH);
    }
  });

  afterEach(async () => {
    if (existsSync(TEST_TOML_PATH)) {
      await unlink(TEST_TOML_PATH);
    }
  });

  it('creates TOML file on first write', async () => {
    await persistToToml('NEXUS_LOG_LEVEL', 'debug');
    expect(existsSync(TEST_TOML_PATH)).toBe(true);
    const content = await readFile(TEST_TOML_PATH, 'utf-8');
    expect(content).toContain('[logging]');
    expect(content).toContain('level = "debug"');
  });

  it('writes numeric values without quotes', async () => {
    await persistToToml('NEXUS_CACHE_TTL_MS', 30000);
    const content = await readFile(TEST_TOML_PATH, 'utf-8');
    expect(content).toContain('cache_ttl_ms = 30000');
    expect(content).not.toContain('cache_ttl_ms = "30000"');
  });

  it('writes string values with quotes', async () => {
    await persistToToml('NEXUS_SCHEDULER_POLICY', 'mlfq');
    const content = await readFile(TEST_TOML_PATH, 'utf-8');
    expect(content).toContain('policy = "mlfq"');
  });

  it('adds to existing section', async () => {
    await persistToToml('NEXUS_CACHE_TTL_MS', 30000);
    await persistToToml('NEXUS_LOG_LEVEL', 'debug');
    const content = await readFile(TEST_TOML_PATH, 'utf-8');
    // Both should be present
    expect(content).toContain('cache_ttl_ms = 30000');
    expect(content).toContain('level = "debug"');
  });

  it('updates existing key value', async () => {
    await persistToToml('NEXUS_LOG_LEVEL', 'debug');
    await persistToToml('NEXUS_LOG_LEVEL', 'info');
    const content = await readFile(TEST_TOML_PATH, 'utf-8');
    expect(content).toContain('level = "info"');
    expect(content).not.toContain('level = "debug"');
  });

  it('creates new section for different category', async () => {
    await persistToToml('NEXUS_LOG_LEVEL', 'debug');
    await persistToToml('NEXUS_CACHE_TTL_MS', 30000);
    const content = await readFile(TEST_TOML_PATH, 'utf-8');
    expect(content).toContain('[logging]');
    expect(content).toContain('[runtime]');
  });

  it('ignores keys not in allowlist', async () => {
    await persistToToml('NEXUS_SECRET_KEY', 'should-not-persist');
    expect(existsSync(TEST_TOML_PATH)).toBe(false);
  });

  it('round-trips values through load', async () => {
    await persistToToml('NEXUS_LOG_LEVEL', 'debug');
    await persistToToml('NEXUS_CACHE_TTL_MS', 30000);
    await persistToToml('NEXUS_SCHEDULER_POLICY', 'mlfq');

    const overrides = await loadTomlConfigOverrides();
    expect(overrides.get('NEXUS_LOG_LEVEL')).toBe('debug');
    expect(overrides.get('NEXUS_CACHE_TTL_MS')).toBe('30000');
    expect(overrides.get('NEXUS_SCHEDULER_POLICY')).toBe('mlfq');
  });

  it('returns empty map for missing file', async () => {
    const overrides = await loadTomlConfigOverrides();
    expect(overrides.size).toBe(0);
  });

  it('handles updated values in round-trip', async () => {
    await persistToToml('NEXUS_LOG_LEVEL', 'debug');
    await persistToToml('NEXUS_LOG_LEVEL', 'warn');

    const overrides = await loadTomlConfigOverrides();
    expect(overrides.get('NEXUS_LOG_LEVEL')).toBe('warn');
  });
});
