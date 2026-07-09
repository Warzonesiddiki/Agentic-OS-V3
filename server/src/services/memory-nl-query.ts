import { fedRecall } from './federated-recall.js';

const NL_QUERY_RECALL_BUDGET = 4000;

export interface NLQueryParse {
  topic: string;
  timeExpr: string | null;
  timeFrom: string | null;
  timeTo: string | null;
  raw: string;
}

export interface RecallSummary {
  id: string;
  content: string;
  score: number;
}

export interface NLQueryResult {
  query: string;
  parsed: NLQueryParse;
  answer: string;
  results: RecallSummary[];
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function offsetDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  const day = x.getDay();
  x.setDate(x.getDate() - day);
  return x;
}

function startOfMonth(d: Date): Date {
  const x = new Date(d);
  x.setDate(1);
  x.setHours(0, 0, 0, 0);
  return x;
}

const FILLER_PATTERNS: RegExp[] = [
  /what (did|do|does) (i|we|you) (learn|know|find|remember|recall|study|read|write|discover|build|make)/gi,
  /tell me about/gi,
  /show me/gi,
  /memor(y|ies) (about|on|of|regarding)/gi,
  /note[s]? (about|on|of|regarding)/gi,
  /anything (about|on|of|regarding)/gi,
  /what (is|are) (my|the|our)/gi,
  /can you (find|recall|remember)/gi,
];

function extractTopic(working: string, fallback: string): string {
  let t = working;
  for (const re of FILLER_PATTERNS) t = t.replace(re, ' ');
  t = t.replace(/\?/g, ' ').replace(/\s+/g, ' ').trim();
  return t.length > 0 ? t : fallback;
}

export function parseNaturalLanguageQuery(input: string): NLQueryParse {
  const raw = input.trim();
  const now = new Date();
  let working = raw;
  let timeExpr: string | null = null;
  let timeFrom: string | null = null;
  let timeTo: string | null = null;

  const patterns: Array<{
    re: RegExp;
    build: (m: RegExpExecArray) => { label: string; from: Date; to: Date };
  }> = [
    {
      re: /\b(\d+)\s*days?\b/i,
      build: (m) => {
        const n = parseInt(m[1] ?? '0', 10);
        return { label: `${n} days`, from: startOfDay(offsetDays(now, -n)), to: now };
      },
    },
    {
      re: /\b(\d+)\s*weeks?\b/i,
      build: (m) => {
        const n = parseInt(m[1] ?? '0', 10) * 7;
        return { label: `${n} days`, from: startOfDay(offsetDays(now, -n)), to: now };
      },
    },
    { re: /\btoday\b/i, build: () => ({ label: 'today', from: startOfDay(now), to: now }) },
    {
      re: /\byesterday\b/i,
      build: () => ({
        label: 'yesterday',
        from: startOfDay(offsetDays(now, -1)),
        to: offsetDays(now, -1),
      }),
    },
    {
      re: /\bthis week\b/i,
      build: () => ({ label: 'this week', from: startOfWeek(now), to: now }),
    },
    {
      re: /\bthis month\b/i,
      build: () => ({ label: 'this month', from: startOfMonth(now), to: now }),
    },
    {
      re: /\blast week\b/i,
      build: () => ({
        label: 'last week',
        from: startOfWeek(offsetDays(now, -7)),
        to: startOfWeek(now),
      }),
    },
    {
      re: /\blast month\b/i,
      build: () => ({
        label: 'last month',
        from: startOfMonth(offsetDays(now, -30)),
        to: startOfMonth(now),
      }),
    },
  ];

  for (const p of patterns) {
    const m = p.re.exec(working);
    if (m) {
      const r = p.build(m);
      timeExpr = r.label;
      timeFrom = r.from.toISOString();
      timeTo = r.to.toISOString();
      working = working.replace(m[0], ' ');
      break;
    }
  }

  const topic = extractTopic(working, raw);
  return { topic, timeExpr, timeFrom, timeTo, raw };
}

function formatAnswer(parsed: NLQueryParse, results: RecallSummary[]): string {
  if (results.length === 0) {
    const when = parsed.timeExpr ? ` from ${parsed.timeExpr}` : '';
    return `I could not find any memories${when} about "${parsed.topic}".`;
  }
  const lines = results.slice(0, 5).map((r, i) => `${i + 1}. ${r.content.trim().slice(0, 280)}`);
  const when = parsed.timeExpr ? ` from ${parsed.timeExpr}` : '';
  return `Here is what I found${when} about "${parsed.topic}":\n\n${lines.join('\n\n')}`;
}

export async function answerNaturalLanguageQuery(
  input: string,
  opts?: { actor?: string; limit?: number }
): Promise<NLQueryResult> {
  const parsed = parseNaturalLanguageQuery(input);
  const actor = opts?.actor ?? 'nexus-nl-query';
  const limit = opts?.limit ?? 10;
  // Route NL recall through the advanced FederatedRecall engine so we get
  // proof-of-memory, privacy-budget enforcement, content dedup and RRF fusion.
  const result = await fedRecall.search({
    text: parsed.topic || input,
    budget: NL_QUERY_RECALL_BUDGET,
    actor,
    options: { limit, dedupeContent: true, includeFederated: true },
  });
  const results: RecallSummary[] = result.returned.map((r) => ({
    id: r.id,
    content: r.content,
    score: r.score,
  }));
  const answer = formatAnswer(parsed, results);
  return { query: input, parsed, answer, results };
}
