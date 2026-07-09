import { log } from '../lib/logging.js';
import { appendAudit } from '../lib/audit.js';
import {
  type GuardrailType,
  type ViolationAction,
  type GuardrailStage,
  type ViolationResult,
  type GuardrailDefinition,
  type GuardrailInput,
  type GuardrailConfig,
  type GuardrailReport,
  type GuardrailContext,
} from './guardrail-types.js';
import { getPatterns, matchPatterns, detectPII, scoreToxicity } from './guardrail-patterns.js';

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

export function configureGuardrails(cfg: Partial<GuardrailConfig>): void {
  _config = { ..._config, ...cfg };
}

export function getGuardrailConfig(): GuardrailConfig {
  return { ..._config };
}

const registry = new Map<string, GuardrailDefinition>();

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
    _trackResult(g.name, result.passed, result.action);

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

export async function applyInputGuardrails(
  text: string,
  ctx: GuardrailContext
): Promise<ViolationResult> {
  return runGuardrails('input', text, ctx);
}

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

const reportStats = new Map<string, { checked: number; violations: number }>();
let globalBlocked = 0;
let globalWarned = 0;
let globalModified = 0;
let globalLoggedOnly = 0;

function _trackResult(guardrailName: string, passed: boolean, action: ViolationAction): void {
  const cur = reportStats.get(guardrailName) ?? { checked: 0, violations: 0 };
  cur.checked++;
  if (!passed) {
    cur.violations++;
    if (action === 'block') globalBlocked++;
    else if (action === 'warn') globalWarned++;
    else if (action === 'modify') globalModified++;
    else if (action === 'log') globalLoggedOnly++;
  }
  reportStats.set(guardrailName, cur);
}

export function getGuardrailReport(): GuardrailReport {
  let totalChecks = 0;
  let totalViolations = 0;
  const byGuardrail: Record<string, { checked: number; violations: number }> = {};

  for (const [name, stats] of reportStats) {
    totalChecks += stats.checked;
    totalViolations += stats.violations;
    byGuardrail[name] = { ...stats };
  }

  return {
    totalChecks,
    violations: totalViolations,
    blocked: globalBlocked,
    warned: globalWarned,
    modified: globalModified,
    loggedOnly: globalLoggedOnly,
    byGuardrail,
  };
}

export function resetGuardrailReport(): void {
  reportStats.clear();
  globalBlocked = 0;
  globalWarned = 0;
  globalModified = 0;
  globalLoggedOnly = 0;
}

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
