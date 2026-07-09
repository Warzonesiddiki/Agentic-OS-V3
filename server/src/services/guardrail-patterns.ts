import {
  type ViolationAction,
  type PatternRule,
  type ContentFilterResult,
  type PIIResult,
} from './guardrail-types.js';

export const builtinPatterns: PatternRule[] = [
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

const PII_PATTERNS: Array<{ type: string; pattern: RegExp }> = [
  { type: 'email', pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
  { type: 'phone', pattern: /(?:\+\d{1,3}\s)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/g },
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
