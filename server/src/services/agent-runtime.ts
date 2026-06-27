import { log } from "../lib/logging.js";
import { appendAudit } from "../lib/audit.js";
import { callLLM } from "./llm.js";
import { recall } from "./recall.js";
import { createMemory, createSkill } from "../services.js";
import { browserNavigate, browserExtract } from "./browser.js";
import { getAgent, incrementTokenUsage, listAgents } from "./kernel.js";
import { db } from "../db/client.js";
import { memories, skills } from "../db/schema.js";
import { eq } from "drizzle-orm";

export interface AgentConfig {
  agentId: string;
  goal: string;
  context?: Record<string, unknown>;
  maxIterations?: number;
  actor: string;
}

export interface AgentStep {
  iteration: number;
  thought: string;
  tool: string;
  toolInput: Record<string, unknown>;
  toolOutput: unknown;
}

export interface AgentResult {
  ok: boolean;
  answer: string;
  steps: AgentStep[];
  iterations: number;
  tokensUsed: number;
  error?: string;
}

const AVAILABLE_TOOLS = [
  {
    name: "recall",
    description: "Search across all memories, skills, and notes by semantic meaning.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "The search query" },
        budget: { type: "number", description: "Token budget (max 8192)", default: 4000 },
      },
      required: ["query"],
    },
  },
  {
    name: "createMemory",
    description: "Store a new durable memory.",
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["episodic", "semantic", "preference", "reflexion", "fact"] },
        title: { type: "string" },
        content: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        importance: { type: "number", minimum: 0, maximum: 1 },
      },
      required: ["kind", "title", "content"],
    },
  },
  {
    name: "createSkill",
    description: "Create a new reusable skill from successful patterns.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        content: { type: "string" },
        category: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["name", "title", "description", "content"],
    },
  },
  {
    name: "readMemory",
    description: "Read the full content of a specific memory by ID.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Memory ID" },
      },
      required: ["id"],
    },
  },
  {
    name: "readSkill",
    description: "Read the full content of a specific skill by ID.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Skill ID" },
      },
      required: ["id"],
    },
  },
  {
    name: "browserNavigate",
    description: "Navigate to a URL and extract page text.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "The URL to visit" },
      },
      required: ["url"],
    },
  },
  {
    name: "browserExtract",
    description: "Extract text from a specific URL.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string" },
        selector: { type: "string", description: "CSS selector (optional)" },
      },
      required: ["url"],
    },
  },
  {
    name: "listAgents",
    description: "List all active sub-agents and their statuses.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "finish",
    description: "Complete the task with a final answer. Call this when the goal is achieved.",
    inputSchema: {
      type: "object",
      properties: {
        answer: { type: "string", description: "The final answer or summary" },
      },
      required: ["answer"],
    },
  },
];

function buildSystemPrompt(): string {
  const tools = AVAILABLE_TOOLS.map((t) => {
    const props = Object.entries(t.inputSchema.properties)
      .map(([k, v]) => {
        const desc = (v as Record<string, unknown>).description ?? "";
        const required = t.inputSchema.required?.includes(k) ? " (required)" : " (optional)";
        return `    ${k}: ${desc}${required}`;
      })
      .join("\n");
    return `  - ${t.name}: ${t.description}\n${props}`;
  }).join("\n\n");

  return `You are NEXUS Agent Runtime — a reasoning agent that achieves goals by calling tools.

You have these tools available:

${tools}

Work through the goal step by step. For each step:
1. THINK about what to do next
2. CALL ONE tool with the correct arguments
3. OBSERVE the result and decide the next step

Respond in this JSON format:
{
  "thought": "Your reasoning about what to do next",
  "tool": "tool_name",
  "input": { "key": "value" }
}

When the goal is achieved, call the finish tool with your final answer.
Be concise and precise. If a tool fails, try an alternative approach.`;
}

async function executeTool(
  tool: string,
  input: Record<string, unknown>,
  agentId: string,
  actor: string,
): Promise<unknown> {
  switch (tool) {
    case "recall": {
      const q = String(input.query ?? "");
      const budget = Number(input.budget ?? 4000);
      return recall(q, budget, actor);
    }
    case "createMemory": {
      const kind = String(input.kind ?? "semantic") as "episodic" | "semantic" | "preference" | "reflexion" | "fact";
      const title = String(input.title ?? "");
      const content = String(input.content ?? "");
      const tags = (input.tags as string[]) ?? [];
      const importance = Number(input.importance ?? 0.5);
      return createMemory({ kind, title, content, tags, importance, source: "agent-runtime", projectId: null } as Parameters<typeof createMemory>[0], actor);
    }
    case "createSkill": {
      const name = String(input.name ?? "");
      const title = String(input.title ?? "");
      const description = String(input.description ?? "");
      const content = String(input.content ?? "");
      const category = String(input.category ?? "general");
      const tags = (input.tags as string[]) ?? [];
      return createSkill({ name, title, description, content, category, tags, source: "agent-runtime", trigger: null, projectId: null } as Parameters<typeof createSkill>[0], actor);
    }
    case "readMemory": {
      const id = String(input.id ?? "");
      const mem = await db.query.memories.findFirst({ where: eq(memories.id, id) });
      return mem ?? { error: "Memory not found" };
    }
    case "readSkill": {
      const id = String(input.id ?? "");
      const skl = await db.query.skills.findFirst({ where: eq(skills.id, id) });
      return skl ?? { error: "Skill not found" };
    }
    case "browserNavigate": {
      const url = String(input.url ?? "");
      return browserNavigate(url, agentId, actor);
    }
    case "browserExtract": {
      const url = String(input.url ?? "");
      const selector = input.selector ? String(input.selector) : "body";
      return browserExtract(url, selector, agentId, actor);
    }
    case "listAgents": {
      return listAgents();
    }
    default:
      throw new Error(`Unknown tool: ${tool}`);
  }
}

export async function runAgent(config: AgentConfig): Promise<AgentResult> {
  const { agentId, goal, actor, maxIterations = 15 } = config;
  const steps: AgentStep[] = [];
  let totalTokens = 0;

  await appendAudit("agent_runtime.started", { agentId, goal, maxIterations }, actor);

  const systemPrompt = buildSystemPrompt();

  let conversation = `Goal: ${goal}\n\nContext: ${JSON.stringify(config.context ?? {})}\n\nBegin.`;

  for (let i = 0; i < maxIterations; i++) {
    const agent = await getAgent(agentId);
    if (agent && agent.tokensUsed >= agent.tokenBudget) {
      return {
        ok: false,
        answer: "Token budget exhausted",
        steps,
        iterations: i,
        tokensUsed: totalTokens,
        error: `Token budget exhausted (${agent.tokensUsed}/${agent.tokenBudget})`,
      };
    }

    try {
      const llmResult = await callLLM({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: conversation },
        ],
        temperature: 0.5,
        maxTokens: 1024,
      });

      await incrementTokenUsage(agentId, llmResult.usage.total);
      totalTokens += llmResult.usage.total;

      const parsed = JSON.parse(llmResult.content);
      const thought = String(parsed.thought ?? "");
      const tool = String(parsed.tool ?? "");
      const toolInput = (parsed.input ?? {}) as Record<string, unknown>;

      if (tool === "finish") {
        const answer = String(toolInput.answer ?? thought);
        steps.push({ iteration: i, thought, tool, toolInput, toolOutput: { done: true } });

        await appendAudit("agent_runtime.finished", {
          agentId, iterations: i, tokensUsed: totalTokens, answerLength: answer.length,
        }, actor);

        return { ok: true, answer, steps, iterations: i, tokensUsed: totalTokens };
      }

      const toolOutput = await executeTool(tool, toolInput, agentId, actor);
      steps.push({ iteration: i, thought, tool, toolInput, toolOutput });

      const outputStr = typeof toolOutput === "object"
        ? JSON.stringify(toolOutput).slice(0, 4000)
        : String(toolOutput).slice(0, 4000);

      conversation = `Step ${i + 1} result:
Tool: ${tool}
Output: ${outputStr}

Continue working toward the goal. What is the next step?`;
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      steps.push({
        iteration: i,
        thought: `Error occurred`,
        tool: "_error",
        toolInput: {},
        toolOutput: { error: errMsg },
      });

      if (i === maxIterations - 1) {
        await appendAudit("agent_runtime.failed", {
          agentId, iterations: i, error: errMsg,
        }, actor);

        return {
          ok: false,
          answer: `Failed after ${i + 1} iterations: ${errMsg}`,
          steps,
          iterations: i,
          tokensUsed: totalTokens,
          error: errMsg,
        };
      }

      conversation = `Step ${i + 1} error: ${errMsg}\n\nTry a different approach.`;
    }
  }

  return {
    ok: false,
    answer: `Max iterations (${maxIterations}) reached without completing goal.`,
    steps,
    iterations: maxIterations,
    tokensUsed: totalTokens,
    error: "Max iterations exceeded",
  };
}
