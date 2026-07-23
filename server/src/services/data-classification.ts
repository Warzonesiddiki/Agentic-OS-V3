/**
 * data-classification.ts — Automatic data classification for security & compliance.
 * Phase 14, Task 14.1: Data Classification.
 *
 * Classifies data flowing through the system into sensitivity levels:
 *   - PUBLIC: No restriction (documentation, public APIs)
 *   - INTERNAL: Low sensitivity (internal metrics, non-PII analytics)
 *   - CONFIDENTIAL: Medium sensitivity (user preferences, session data)
 *   - RESTRICTED: High sensitivity (PII, API keys, credentials, health data)
 *
 * Used by:
 *   - Memory system: auto-classify memories on creation
 *   - DLP scanner: verify outbound data doesn't leak RESTRICTED content
 *   - Audit log: tag entries with classification for compliance reporting
 *   - API responses: strip/mask RESTRICTED fields in lower-privilege contexts
 *
 * @module services/data-classification
 */

/* ─── Classification Levels ─────────────────────────────────────────────── */

export type ClassificationLevel = 'public' | 'internal' | 'confidential' | 'restricted';

export const CLASSIFICATION_ORDER: Record<ClassificationLevel, number> = {
  public: 0,
  internal: 1,
  confidential: 2,
  restricted: 3,
};

export interface ClassificationResult {
  level: ClassificationLevel;
  reasons: string[];
  confidence: number; // 0-1
  detectedPatterns: string[];
}

export interface ClassificationRule {
  name: string;
  level: ClassificationLevel;
  patterns: RegExp[];
  description: string;
}

/* ─── Built-in Classification Rules ─────────────────────────────────────── */

const DEFAULT_RULES: ClassificationRule[] = [
  {
    name: 'credit_card',
    level: 'restricted',
    patterns: [
      /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13})\b/,
    ],
    description: 'Credit card numbers (Visa, Mastercard, Amex)',
  },
  {
    name: 'ssn',
    level: 'restricted',
    patterns: [/\b\d{3}-\d{2}-\d{4}\b/],
    description: 'Social Security Numbers',
  },
  {
    name: 'api_key',
    level: 'restricted',
    patterns: [
      /\b(?:sk|pk|ak|rk)_[a-zA-Z0-9]{20,}\b/,
      /(?:api[_-]?key|secret[_-]?key|access[_-]?token)\s*[:=]\s*["']?[a-zA-Z0-9_\-]{16,}/i,
    ],
    description: 'API keys and secrets',
  },
  {
    name: 'private_key',
    level: 'restricted',
    patterns: [
      /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/,
    ],
    description: 'Private cryptographic keys',
  },
  {
    name: 'password',
    level: 'restricted',
    patterns: [
      /(?:password|passwd|pwd)\s*[:=]\s*["']?[^\s"']{8,}/i,
    ],
    description: 'Passwords in configuration or plaintext',
  },
  {
    name: 'email',
    level: 'confidential',
    patterns: [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/],
    description: 'Email addresses (PII)',
  },
  {
    name: 'phone',
    level: 'confidential',
    patterns: [/\b(?:\+?1[-.]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b/],
    description: 'Phone numbers',
  },
  {
    name: 'ip_address',
    level: 'internal',
    patterns: [/\b(?:\d{1,3}\.){3}\d{1,3}\b/],
    description: 'IP addresses',
  },
  {
    name: 'jwt',
    level: 'restricted',
    patterns: [/eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/],
    description: 'JSON Web Tokens',
  },
  {
    name: 'aws_key',
    level: 'restricted',
    patterns: [/AKIA[0-9A-Z]{16}/],
    description: 'AWS Access Key IDs',
  },
  {
    name: 'database_url',
    level: 'restricted',
    patterns: [/(?:postgres|mysql|mongodb):\/\/[^\s]+:[^\s]+@/i],
    description: 'Database connection strings with credentials',
  },
];

/* ─── Classification Engine ─────────────────────────────────────────────── */

/**
 * Classify a piece of text content by scanning for sensitive patterns.
 * Returns the highest classification level found, with all matching reasons.
 */
export function classifyContent(
  content: string,
  rules: ClassificationRule[] = DEFAULT_RULES
): ClassificationResult {
  if (!content || content.length === 0) {
    return { level: 'public', reasons: ['empty content'], confidence: 1, detectedPatterns: [] };
  }

  let highestLevel: ClassificationLevel = 'public';
  const reasons: string[] = [];
  const detectedPatterns: string[] = [];
  let totalMatches = 0;

  for (const rule of rules) {
    for (const pattern of rule.patterns) {
      const matches = content.match(new RegExp(pattern, 'g'));
      if (matches && matches.length > 0) {
        totalMatches += matches.length;
        detectedPatterns.push(rule.name);

        if (CLASSIFICATION_ORDER[rule.level] > CLASSIFICATION_ORDER[highestLevel]) {
          highestLevel = rule.level;
        }
        reasons.push(`${rule.name}: ${matches.length} match(es) — ${rule.description}`);
      }
    }
  }

  // Confidence is based on the number and severity of matches
  let confidence = 0;
  if (totalMatches === 0) {
    confidence = 0.95; // High confidence it's clean
    reasons.push('No sensitive patterns detected');
  } else if (highestLevel === 'restricted') {
    confidence = Math.min(0.99, 0.7 + totalMatches * 0.05);
  } else if (highestLevel === 'confidential') {
    confidence = Math.min(0.95, 0.6 + totalMatches * 0.05);
  } else {
    confidence = Math.min(0.9, 0.5 + totalMatches * 0.05);
  }

  return { level: highestLevel, reasons, confidence, detectedPatterns };
}

/**
 * Classify structured data (objects) by recursively scanning string values.
 */
export function classifyObject(
  data: unknown,
  rules: ClassificationRule[] = DEFAULT_RULES
): ClassificationResult {
  const allReasons: string[] = [];
  const allPatterns = new Set<string>();
  let highestLevel: ClassificationLevel = 'public';
  let totalChecks = 0;

  function walk(value: unknown, path: string): void {
    if (typeof value === 'string') {
      totalChecks++;
      const result = classifyContent(value, rules);
      if (CLASSIFICATION_ORDER[result.level] > CLASSIFICATION_ORDER[highestLevel]) {
        highestLevel = result.level;
      }
      for (const reason of result.reasons) {
        allReasons.push(`[${path}] ${reason}`);
      }
      for (const pattern of result.detectedPatterns) {
        allPatterns.add(pattern);
      }
    } else if (Array.isArray(value)) {
      value.forEach((item, i) => walk(item, `${path}[${i}]`));
    } else if (value && typeof value === 'object') {
      for (const [key, val] of Object.entries(value)) {
        walk(val, path ? `${path}.${key}` : key);
      }
    }
  }

  walk(data, '');

  const confidence = totalChecks === 0 ? 1 : Math.max(0.5, 1 - allReasons.length / (totalChecks * 2));

  return {
    level: highestLevel,
    reasons: allReasons.slice(0, 20), // Cap reasons to prevent huge outputs
    confidence,
    detectedPatterns: [...allPatterns],
  };
}

/**
 * Mask sensitive data in a string based on classification.
 * Replaces detected patterns with redacted placeholders.
 */
export function maskSensitiveData(
  content: string,
  level: ClassificationLevel = 'restricted'
): string {
  let masked = content;

  for (const rule of DEFAULT_RULES) {
    if (CLASSIFICATION_ORDER[rule.level] >= CLASSIFICATION_ORDER[level]) {
      for (const pattern of rule.patterns) {
        masked = masked.replace(new RegExp(pattern, 'g'), `[REDACTED:${rule.name}]`);
      }
    }
  }

  return masked;
}

/**
 * Check if data at a given classification level can be shared with a target level.
 * Data can only flow from higher to lower (or equal) classification.
 */
export function canShareData(sourceLevel: ClassificationLevel, targetLevel: ClassificationLevel): boolean {
  return CLASSIFICATION_ORDER[sourceLevel] <= CLASSIFICATION_ORDER[targetLevel];
}

/**
 * Get a summary report of classification results for compliance logging.
 */
export function classificationReport(result: ClassificationResult): string {
  const lines = [
    `Classification: ${result.level.toUpperCase()}`,
    `Confidence: ${(result.confidence * 100).toFixed(0)}%`,
    `Patterns detected: ${result.detectedPatterns.length > 0 ? result.detectedPatterns.join(', ') : 'none'}`,
  ];
  if (result.reasons.length > 0 && result.reasons[0] !== 'No sensitive patterns detected') {
    lines.push('Details:');
    for (const reason of result.reasons.slice(0, 5)) {
      lines.push(`  - ${reason}`);
    }
  }
  return lines.join('\n');
}
