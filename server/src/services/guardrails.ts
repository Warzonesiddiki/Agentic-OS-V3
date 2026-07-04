/**
 * guardrails.ts — Input, output tool guardrails with content filtering.
 *
 * Provides:
 *   - Input guardrails  (block bad input before agent processing)
 *   - Output guardrails (validate/sanitize agent output before returning)
 *   - Tool guardrails   (validate before/after tool calls)
 *   - Content filtering via pattern matching, PII detection, toxicity checks
 *   - Allow/block list management
 *   - Violation logging and reporting
 *
 * Usage:
 *   import { applyInputGuardrails, applyOutputGuardrails } from "./services/guardrails.js";
 *
 *   const result = await applyInputGuardrails({ text: userInput, sessionId });
 *   if (result.action === "block") return reject(result);
 */
// import { randomUUID } from "node:crypto"; // removed unused
import { log } from '../lib/logging.js';
import { appendAudit } from '../lib/audit.js';

/* ─── Types ───────────────────────────────────────────────────────────────── */

export type GuardrailType = 'input' | 'output' | 'tool';
export type ViolationAction = 'block' | 'warn' | 'modify' | 'log';
export type GuardrailStage = 'pre_tool' | 'post_tool';

export interface ViolationResult {
  passed: boolean;
  score: number;
  details: string[];
  action: ViolationAction;
  modifiedText?: string;
}

export interface GuardrailDefinition {
  name: string;
  type: GuardrailType;
  enabled: boolean;
  action: ViolationAction;
  validate: (input: GuardrailInput) => ViolationResult | Promise<ViolationResult>;
  onViolation?: (result: ViolationResult, input: GuardrailInput) => void | Promise<void>;
}

export interface GuardrailInput {
  text: string;
  type?: GuardrailType;
  sessionId: string;
  agentId?: string;
  actor?: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolOutput?: unknown;
}

export interface GuardrailConfig {
  allowList: string[];
  blockList: string[];
  piiRedaction: boolean;
  maxInputLength: number;
  maxOutputLength: number;
  toxicityThreshold: number;
  logViolations: boolean;
}

export interface ContentFilterResult {
  matched: boolean;
  pattern: string;
  matches: string[];
  redacted: string;
}

export interface PIIResult {
  hasPII: boolean;
  entities: Array<{ type: string; value: string; start: number; end: number }>;
  redacted: string;
}

export interface GuardrailReport {
  totalChecks: number;
  violations: number;
  blocked: number;
  warned: number;
  modified: number;
  loggedOnly: number;
  byGuardrail: Record<string, { checked: number; violations: number }>;
}

/* ─── Default config ──────────────────────────────────────────────────────── */

const DEFAULT_CONFIG: GuardrailConfig = {
  allowList: [],
  blockList: [],
  piiRedaction: true,
  maxInputLength: 100_000,
  maxOutputLength: 500_000,
  toxicityThreshold: 0.8,
  logViolations: true,
};

let _config: GuardrailConfig = { ...DEFAULT_CONFIG };

/**
 * Update the global guardrail configuration with partial overrides.
 */
export function configureGuardrails(cfg: Partial<GuardrailConfig>): void {
  _config = { ..._config, ...cfg };
}

export function getGuardrailConfig(): GuardrailConfig {
  return { ..._config };
}

/* ─── Registry ────────────────────────────────────────────────────────────── */

const registry = new Map<string, GuardrailDefinition>();

/**
 * Register a guardrail definition in the global registry.
 * Guardrails are evaluated in registration order during input/output/tool checks.
 */
export function registerGuardrail(def: GuardrailDefinition): void {
  registry.set(def.name, def);
  log.info('guardrail.registered', { name: def.name, type: def.type });
}

export function unregisterGuardrail(name: string): boolean {
  return registry.delete(name);
}

export function getGuardrail(name: string): GuardrailDefinition | undefined {
  return registry.get(name);
}

export function listGuardrails(type?: GuardrailType): GuardrailDefinition[] {
  const all = [...registry.values()];
  return type ? all.filter((g) => g.type === type) : all;
}

/* ─── Pattern matching ──────────────────────────────────────────────────── */

export interface PatternRule {
  name: string;
  pattern: RegExp;
  severity: number;
  action: ViolationAction;
}

const builtinPatterns: PatternRule[] = [
  {
    name: 'sql_injection',
    pattern: /\b(?:DROP|DELETE|TRUNCATE|EXEC)\s+(?:TABLE|DATABASE|PROCEDURE)\b/i,
    severity: 1.0,
    action: 'block',
  },
  { name: 'path_traversal', pattern: /\.\.(?:\\|\/)[\w\-.]/i, severity: 1.0, action: 'block' },
  {
    name: 'command_injection',
    pattern: /[;&|]\s*(?:rm|del|shutdown|format|mkfs|dd)\s/i,
    severity: 1.0,
    action: 'block',
  },
  {
    name: 'jailbreak_attempt',
    pattern:
      /\b(?:ignore|disregard)\s+(?:previous|above|all)\s+(?:instructions|prompts|directions)\b/i,
    severity: 0.9,
    action: 'block',
  },
  {
    name: 'doh_instruction',
    pattern: /\b(?:DAN|STAN|DUDE|prompt\s*injection)\b/i,
    severity: 0.9,
    action: 'block',
  },
  {
    name: 'system_override',
    pattern:
      /\b(?:you\s+are\s+(?:now|free)|new\s+(?:role|persona)|override\s+(?:mode|protocol))\b/i,
    severity: 0.8,
    action: 'warn',
  },
  { name: 'hate_speech', pattern: /\b(?:nazi|white\s+supremac)/i, severity: 1.0, action: 'block' },
  {
    name: 'self_harm',
    pattern: /\b(?:suicide|kill\s+myself|self[- ]?harm|end\s+my\s+life)\b/i,
    severity: 1.0,
    action: 'block',
  },
  { name: 'harassment', pattern: /\b(?:rape|molest|pedophile)\b/i, severity: 1.0, action: 'block' },
  {
    name: 'personal_data_request',
    pattern:
      /\b(?:ssn|social\s+security|credit\s+card\s+number|passport\s+number|driver'?s?\s+license)\s*(?:number|#|id)?\s*(?::|is)\b/i,
    severity: 0.9,
    action: 'warn',
  },
];

let customPatterns: PatternRule[] = [];

export function addPattern(rule: PatternRule): void {
  customPatterns.push(rule);
}

export function removePattern(name: string): void {
  customPatterns = customPatterns.filter((p) => p.name !== name);
}

export function getPatterns(): PatternRule[] {
  return [...builtinPatterns, ...customPatterns];
}

export function matchPatterns(text: string): ContentFilterResult {
  const allMatches: string[] = [];
  let matchedName = '';
  let redacted = text;

  for (const rule of getPatterns()) {
    rule.pattern.lastIndex = 0;
    const found = text.match(rule.pattern);
    if (found) {
      allMatches.push(...found);
      matchedName = rule.name;
      redacted = redacted.replace(rule.pattern, (m) => '*'.repeat(m.length));
    }
  }

  return {
    matched: allMatches.length > 0,
    pattern: matchedName,
    matches: [...new Set(allMatches)],
    redacted,
  };
}

/* ─── PII detection ───────────────────────────────────────────────────────── */

const PII_PATTERNS: Array<{ type: string; pattern: RegExp }> = [
  { type: 'email', pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
  { type: 'phone', pattern: /(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/g },
  { type: 'ssn', pattern: /\b\d{3}[-]\d{2}[-]\d{4}\b/g },
  { type: 'credit_card', pattern: /\b(?:\d{4}[-.\s]?){3}\d{4}\b/g },
  { type: 'ip_address', pattern: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g },
  { type: 'crypto_wallet', pattern: /\b(?:0x[a-fA-F0-9]{40}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})\b/g },
  {
    type: 'api_key',
    pattern: /\b(?:sk-[A-Za-z0-9]{20,}|nx_live_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16})\b/g,
  },
];

export function detectPII(text: string): PIIResult {
  const entities: PIIResult['entities'] = [];

  for (const { type, pattern } of PII_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      entities.push({
        type,
        value: match[0],
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  }

  entities.sort((a, b) => a.start - b.start);
  let redacted = text;
  for (const entity of entities) {
    const placeholder = `<REDACTED_${entity.type.toUpperCase()}>`;
    redacted = redacted.slice(0, entity.start) + placeholder + redacted.slice(entity.end);
    const shift = placeholder.length - (entity.end - entity.start);
    for (const later of entities) {
      if (later.start > entity.start) {
        later.start += shift;
        later.end += shift;
      }
    }
  }

  return { hasPII: entities.length > 0, entities, redacted };
}

/* ─── Toxicity scoring ────────────────────────────────────────────────────── */

const TOXIC_PATTERNS: Array<{ pattern: RegExp; weight: number }> = [
  { pattern: /\b(?:fuck|shit|asshole|bastard|bitch|cunt|dick)\b/i, weight: 0.6 },
  { pattern: /\b(?:nigger|faggot|kike|spic|chink|raghead)\b/i, weight: 1.0 },
  { pattern: /\b(?:kill\s+(?:you|yourself|everyone|them)|murder|massacre)\b/i, weight: 0.9 },
  { pattern: /\b(?:terrorist|bomb\s+(?:you|them|place|building))\b/i, weight: 0.9 },
  { pattern: /\b(?:retard|mongoloid|spastic)\b/i, weight: 0.5 },
  { pattern: /\b(?:whore|slut|prostitute)\s+(?:you|her)\b/i, weight: 0.5 },
  { pattern: /\b(?:die|burn|rot)\s+(?:in|you)\b/i, weight: 0.4 },
];

export function scoreToxicity(text: string): { score: number; matches: string[] } {
  let score = 0;
  const matches: string[] = [];

  for (const { pattern, weight } of TOXIC_PATTERNS) {
    pattern.lastIndex = 0;
    const found = text.match(pattern);
    if (found) {
      score += weight * found.length;
      matches.push(...found);
    }
  }

  return { score: Math.min(score, 1.0), matches: [...new Set(matches)] };
}

/* ─── Allow / block list ──────────────────────────────────────────────────── */

export function checkAllowList(text: string): boolean {
  if (_config.allowList.length === 0) return true;
  return _config.allowList.some((entry) => text.toLowerCase().includes(entry.toLowerCase()));
}

export function checkBlockList(text: string): { blocked: boolean; matched: string | null } {
  for (const entry of _config.blockList) {
    if (text.toLowerCase().includes(entry.toLowerCase())) {
      return { blocked: true, matched: entry };
    }
  }
  return { blocked: false, matched: null };
}

export function addToAllowList(entry: string): void {
  if (!_config.allowList.includes(entry)) {
    _config.allowList.push(entry);
  }
}

export function removeFromAllowList(entry: string): void {
  _config.allowList = _config.allowList.filter((e) => e !== entry);
}

export function addToBlockList(entry: string): void {
  if (!_config.blockList.includes(entry)) {
    _config.blockList.push(entry);
  }
}

export function removeFromBlockList(entry: string): void {
  _config.blockList = _config.blockList.filter((e) => e !== entry);
}

/* ─── Guardrail validators (built-in) ─────────────────────────────────────── */

function patternGuardrail(input: GuardrailInput): ViolationResult {
  const result = matchPatterns(input.text);
  if (!result.matched) {
    return { passed: true, score: 0, details: [], action: 'log' };
  }
  const rule = getPatterns().find((p) => p.name === result.pattern);
  return {
    passed: false,
    score: rule?.severity ?? 0.8,
    details: [`Pattern '${result.pattern}' matched: ${result.matches.join(', ')}`],
    action: rule?.action ?? 'block',
    modifiedText: _config.piiRedaction ? result.redacted : undefined,
  };
}

function piiGuardrail(input: GuardrailInput): ViolationResult {
  const result = detectPII(input.text);
  if (!result.hasPII) {
    return { passed: true, score: 0, details: [], action: 'log' };
  }
  const types = [...new Set(result.entities.map((e) => e.type))];
  return {
    passed: false,
    score: result.entities.length > 3 ? 0.9 : 0.5,
    details: [`PII detected: ${types.join(', ')} (${result.entities.length} entities)`],
    action: _config.piiRedaction ? 'modify' : 'warn',
    modifiedText: _config.piiRedaction ? result.redacted : undefined,
  };
}

function toxicityGuardrail(input: GuardrailInput): ViolationResult {
  const { score, matches } = scoreToxicity(input.text);
  if (score < _config.toxicityThreshold) {
    return { passed: true, score, details: [], action: 'log' };
  }
  return {
    passed: false,
    score,
    details: [
      `Toxicity score ${score.toFixed(2)} exceeds threshold ${_config.toxicityThreshold}. Matches: ${matches.join(', ')}`,
    ],
    action: score >= 0.9 ? 'block' : 'warn',
  };
}

function lengthGuardrail(input: GuardrailInput): ViolationResult {
  const len = input.text.length;
  const max = input.type === 'input' ? _config.maxInputLength : _config.maxOutputLength;
  if (len <= max) {
    return { passed: true, score: 0, details: [], action: 'log' };
  }
  return {
    passed: false,
    score: Math.min(len / max, 1.0),
    details: [`Length ${len} exceeds maximum ${max}`],
    action: 'block',
    modifiedText: len > max ? input.text.slice(0, max) : undefined,
  };
}

function blockListGuardrail(input: GuardrailInput): ViolationResult {
  const { blocked, matched } = checkBlockList(input.text);
  if (!blocked) {
    return { passed: true, score: 0, details: [], action: 'log' };
  }
  return {
    passed: false,
    score: 1.0,
    details: [`Blocked term matched: "${matched}"`],
    action: 'block',
  };
}

/* ─── Register built-in guardrails ────────────────────────────────────────── */

registerGuardrail({
  name: 'pattern_check',
  type: 'input',
  enabled: true,
  action: 'block',
  validate: patternGuardrail,
});

registerGuardrail({
  name: 'pii_detection',
  type: 'input',
  enabled: true,
  action: 'modify',
  validate: piiGuardrail,
});

registerGuardrail({
  name: 'toxicity_check',
  type: 'output',
  enabled: true,
  action: 'warn',
  validate: toxicityGuardrail,
});

registerGuardrail({
  name: 'length_check',
  type: 'input',
  enabled: true,
  action: 'block',
  validate: lengthGuardrail,
});

registerGuardrail({
  name: 'block_list',
  type: 'input',
  enabled: true,
  action: 'block',
  validate: blockListGuardrail,
});

/* ─── PII on output (output guardrail) ─────────────────────────────────────── */

registerGuardrail({
  name: 'pii_redaction_output',
  type: 'output',
  enabled: true,
  action: 'modify',
  validate(input: GuardrailInput): ViolationResult {
    const result = detectPII(input.text);
    if (!result.hasPII) {
      return { passed: true, score: 0, details: [], action: 'log' };
    }
    return {
      passed: false,
      score: 0.6,
      details: [`Output PII redacted: ${result.entities.length} entities`],
      action: 'modify',
      modifiedText: result.redacted,
    };
  },
});

registerGuardrail({
  name: 'output_length_check',
  type: 'output',
  enabled: true,
  action: 'modify',
  validate(input: GuardrailInput): ViolationResult {
    const len = input.text.length;
    if (len <= _config.maxOutputLength) {
      return { passed: true, score: 0, details: [], action: 'log' };
    }
    return {
      passed: false,
      score: Math.min(len / _config.maxOutputLength, 1.0),
      details: [`Output length ${len} exceeds max ${_config.maxOutputLength}, truncating`],
      action: 'modify',
      modifiedText: input.text.slice(0, _config.maxOutputLength),
    };
  },
});

/* ─── Core dispatch ───────────────────────────────────────────────────────── */

export interface GuardrailContext {
  sessionId: string;
  agentId?: string;
  actor?: string;
}

async function runGuardrails(
  type: GuardrailType,
  text: string,
  ctx: GuardrailContext,
  extra?: Partial<GuardrailInput>
): Promise<ViolationResult> {
  const guardrails = listGuardrails(type).filter((g) => g.enabled);
  if (guardrails.length === 0) {
    return { passed: true, score: 0, details: [], action: 'log' };
  }

  let currentText = text;
  let combinedAction: ViolationAction = 'log';
  let combinedScore = 0;
  const combinedDetails: string[] = [];
  let wasBlocked = false;

  for (const g of guardrails) {
    const input: GuardrailInput = {
      text: currentText,
      type,
      sessionId: ctx.sessionId,
      agentId: ctx.agentId,
      actor: ctx.actor,
      ...extra,
    };

    const result = await Promise.resolve(g.validate(input));

    if (result.action !== 'log' || !result.passed) {
      combinedDetails.push(...result.details);

      if (result.score > combinedScore) {
        combinedScore = result.score;
      }

      if (_config.logViolations) {
        log.warn('guardrail.violation', {
          guardrail: g.name,
          type,
          action: result.action,
          score: result.score,
          details: result.details,
          sessionId: ctx.sessionId,
          agentId: ctx.agentId,
        });

        await appendAudit(
          'guardrail.violation',
          {
            guardrail: g.name,
            type,
            action: result.action,
            score: result.score,
            details: result.details,
            sessionId: ctx.sessionId,
            agentId: ctx.agentId,
          },
          'guardrails'
        );
      }

      if (g.onViolation) {
        await Promise.resolve(g.onViolation(result, input));
      }
    }

    if (result.action === 'block') {
      wasBlocked = true;
      combinedAction = 'block';
      break;
    }

    if (result.action === 'modify' && result.modifiedText != null) {
      currentText = result.modifiedText;
      if (combinedAction === 'log' || combinedAction === 'warn') {
        combinedAction = 'modify';
      }
    }

    if (result.action === 'warn' && combinedAction === 'log') {
      combinedAction = 'warn';
    }
  }

  return {
    passed: !wasBlocked,
    score: combinedScore,
    details: combinedDetails,
    action: combinedAction,
    modifiedText: wasBlocked ? undefined : currentText,
  };
}

/* ─── Public API ──────────────────────────────────────────────────────────── */

/**
 * Run all enabled input guardrails against the given text.
 * Returns a ViolationResult indicating whether the input passed or was blocked/modified.
 */
export async function applyInputGuardrails(
  text: string,
  ctx: GuardrailContext
): Promise<ViolationResult> {
  return runGuardrails('input', text, ctx);
}

/**
 * Run all enabled output guardrails against generated text.
 * Returns a ViolationResult indicating whether the output passed or needs modification/blocking.
 */
export async function applyOutputGuardrails(
  text: string,
  ctx: GuardrailContext
): Promise<ViolationResult> {
  return runGuardrails('output', text, ctx);
}

export async function applyToolGuardrails(
  stage: GuardrailStage,
  toolName: string,
  toolArgs: Record<string, unknown>,
  toolOutput: unknown,
  ctx: GuardrailContext
): Promise<ViolationResult> {
  const text = stage === 'pre_tool' ? JSON.stringify(toolArgs) : JSON.stringify(toolOutput);
  const extra: Partial<GuardrailInput> = { toolName, toolArgs, toolOutput };
  return runGuardrails('tool', text, ctx, extra);
}

/* ─── Custom guardrail factory ─────────────────────────────────────────────── */

export function createCustomGuardrail(
  name: string,
  type: GuardrailType,
  action: ViolationAction,
  validator: (input: GuardrailInput) => ViolationResult | Promise<ViolationResult>,
  opts?: { onViolation?: GuardrailDefinition['onViolation']; enabled?: boolean }
): GuardrailDefinition {
  const def: GuardrailDefinition = {
    name,
    type,
    enabled: opts?.enabled ?? true,
    action,
    validate: validator,
    onViolation: opts?.onViolation,
  };
  registerGuardrail(def);
  return def;
}

/* ─── Reporting ───────────────────────────────────────────────────────────── */

const reportStats = new Map<string, { checked: number; violations: number }>();

function _trackResult(guardrailName: string, passed: boolean): void {
  const cur = reportStats.get(guardrailName) ?? { checked: 0, violations: 0 };
  cur.checked++;
  if (!passed) cur.violations++;
  reportStats.set(guardrailName, cur);
}

export function getGuardrailReport(): GuardrailReport {
  let totalChecks = 0;
  let totalViolations = 0;
  const blocked = 0;
  const warned = 0;
  const modified = 0;
  const loggedOnly = 0;
  const byGuardrail: Record<string, { checked: number; violations: number }> = {};

  for (const [name, stats] of reportStats) {
    totalChecks += stats.checked;
    totalViolations += stats.violations;
    byGuardrail[name] = { ...stats };
  }

  return {
    totalChecks,
    violations: totalViolations,
    blocked,
    warned,
    modified,
    loggedOnly,
    byGuardrail,
  };
}

export function resetGuardrailReport(): void {
  reportStats.clear();
}

/* ─── Utility — sanitize text through all applicable guardrails ────────────── */

export async function sanitizeText(
  text: string,
  ctx: GuardrailContext
): Promise<{ safe: boolean; text: string; violations: string[] }> {
  const inputResult = await applyInputGuardrails(text, ctx);

  if (inputResult.action === 'block') {
    return {
      safe: false,
      text: '',
      violations: inputResult.details,
    };
  }

  const safeText = inputResult.modifiedText ?? text;
  const outputResult = await applyOutputGuardrails(safeText, ctx);

  const finalText = outputResult.modifiedText ?? safeText;
  const violations = [...inputResult.details, ...outputResult.details];

  return {
    safe: outputResult.action !== 'block',
    text: finalText,
    violations,
  };
}
