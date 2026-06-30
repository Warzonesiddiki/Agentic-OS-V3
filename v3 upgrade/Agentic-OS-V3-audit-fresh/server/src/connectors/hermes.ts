/**
 * connectors/hermes.ts — Seamless Hermes Agent integration.
 *
 * Hermes Agent (by Nous Research) is an autonomous AI agent framework that
 * supports MCP connections and context files. This connector generates
 * everything needed for a one-time setup:
 *
 *   1. .mcp.json — MCP server config with correct URL + auth
 *   2. nexus-os-context.md — Operating instructions that teach Hermes
 *      when and how to use NEXUS tools
 *
 * After generation, Hermes loads the context file and connects to NEXUS
 * automatically on every session start — no manual intervention needed.
 */

export interface HermesConnectorConfig {
  /** The NEXUS server origin (e.g. http://localhost:9900). */
  origin: string;
  /** The API key for authentication. */
  apiKey: string;
}

export interface HermesConnectorResult {
  agent: string;
  files: { path: string; content: string; description: string }[];
  instructions: string[];
}

/** Generate the Hermes .mcp.json config block. */
function generateMcpConfig(cfg: HermesConnectorConfig): string {
  return JSON.stringify(
    {
      mcpServers: {
        nexus: {
          url: `${cfg.origin}/api/mcp`,
          headers: {
            Authorization: `Bearer ${cfg.apiKey}`,
            "Content-Type": "application/json",
          },
        },
      },
    },
    null,
    2
  );
}

/** Generate the operating context file that teaches Hermes how to use NEXUS. */
function generateContextFile(cfg: HermesConnectorConfig): string {
  return `# SYSTEM PROTOCOL: NEXUS 2.0 INTEGRATION

You are running on top of NEXUS 2.0, an Agentic OS and permanent memory layer.
You MUST utilize your connected \`nexus\` MCP tools for memory management, recall,
and state coordination.

## Connection Details
- **MCP Server:** ${cfg.origin}/api/mcp
- **Transport:** Stateless HTTP (StreamableHTTPServerTransport)
- **Auth:** Bearer token (pre-configured in .mcp.json)

## Core Directives

### 1. Pre-Task Grounding
Before answering complex questions, executing code, or making architecture
decisions, ALWAYS call \`nexus_recall\` with a targeted search query and a
token budget of 1500-2000. This retrieves relevant:
- Architecture decisions and their rationale
- Known pitfalls and debugging lessons
- User preferences and coding conventions
- Relevant skills and command recipes

### 2. Post-Task Memory Storage
After solving a problem, making a decision, or learning something durable,
call \`nexus_remember\` with:
- A descriptive \`title\` (max 200 chars)
- The correct \`kind\`: episodic | semantic | preference | reflexion | fact
- Full \`content\` with enough detail to reconstruct the decision
- Relevant \`tags\` for future discovery
- An \`importance\` score (0.0-1.0): 0.9 for critical rules, 0.5 for minor notes

### 3. Session Distillation
When completing a large chunk of work or ending a session, call
\`nexus_capture\` with the transcript. NEXUS will:
- Extract durable memories and skills heuristically
- ALWAYS preserve the raw transcript (never-lose invariant)
- Link to the project if a name is provided

### 4. Error Handling

#### Kill Switch (HTTP 423)
If a NEXUS tool returns an error containing "SAFETY_KILL_SWITCH" or status 423,
the human operator has engaged the emergency kill switch.
**Behavior:** Immediately stop all \`nexus_remember\` and \`nexus_capture\` calls.
Inform the user that NEXUS is in locked mode.

#### Rate Limiting (HTTP 429)
If you receive status 429, you are calling NEXUS too fast.
**Behavior:** Wait 2 seconds, then retry. Do NOT retry in a tight loop.

#### Validation Errors (HTTP 400)
If you receive a VALIDATION_ERROR, read the \`error.message\` field which
explains exactly what field is wrong. Fix the payload and retry.

## Tool Reference

### nexus_recall(query: string, budget?: number = 1500)
Retrieves token-budgeted memories, skills, and notes ranked by:
  score = 0.6 * lexical(BM25) + 0.25 * importance + 0.10 * recency + feedback
Returns: { returned: [...], tokensUsed, tokenBudget, truncated, mode }

### nexus_remember(kind, title, content, tags?, importance?)
Stores a durable memory. Kinds: episodic, semantic, preference, reflexion, fact.
Returns: { stored: true, memory: { id, tokenCost } }

### nexus_capture(transcript: string, projectName?: string)
Distills a transcript into memories + skills. NEVER loses the transcript.
Returns: { distilled, transcriptPreserved, memories, transcript }

### nexus_stats()
Returns brain statistics: memory_count, skill_count, note_count, token_footprint,
tokens_saved, audit_entries, db health, kill_switch status.
Use this to check if NEXUS is alive and has data.

### nexus_audit_verify()
Verifies the SHA-256 hash-chained audit ledger.
Returns: { valid: boolean, verifiedEntries, brokenAt, total }

### nexus_feedback(query, itemId, itemType, helpful)
Records whether a recalled item was helpful. Improves future ranking.

## Behavioral Rules

1. **Do NOT hallucinate project state.** If you don't know a fact, call
   \`nexus_recall\` first. If nothing relevant comes back, state that you
   have no prior memory of this topic.

2. **Prefer specific queries.** \`nexus_recall("database connection pooling")\`
   is better than \`nexus_recall("database")\`.

3. **Store decisions, not trivia.** Use \`nexus_remember\` for things that
   will matter in future sessions: architecture decisions, user preferences,
   debugging lessons, gotchas. Don't store every sentence.

4. **Tag for discoverability.** Always add tags. Future-you will search by them.

5. **Respect the token budget.** Don't set budget to 8192 unless you genuinely
   need deep context. 1500 is a good default for most tasks.

---
*Generated by: nexus connect hermes*
*This file should be loaded via: \`hermes personality load nexus-os-context.md\`*
`;
}

/** Generate the full Hermes integration package. */
export function generateHermesConnector(cfg: HermesConnectorConfig): HermesConnectorResult {
  return {
    agent: "hermes",
    files: [
      {
        path: ".mcp.json",
        content: generateMcpConfig(cfg),
        description: "MCP server configuration — tells Hermes where NEXUS is and how to authenticate",
      },
      {
        path: "nexus-os-context.md",
        content: generateContextFile(cfg),
        description: "Operating instructions — teaches Hermes when/how to use NEXUS tools automatically",
      },
    ],
    instructions: [
      "1. Copy .mcp.json to your Hermes workspace (~/.hermes/.mcp.json or the project root)",
      "2. Load the context file: hermes personality load nexus-os-context.md",
      "3. Start Hermes — it will auto-connect to NEXUS and use memory tools autonomously",
      "4. Verify with: nexus connect hermes --verify (or the in-app Evals page)",
    ],
  };
}

// Verification is handled by lib/verify.ts which makes REAL HTTP requests
// against the running server — no mock checklists.
