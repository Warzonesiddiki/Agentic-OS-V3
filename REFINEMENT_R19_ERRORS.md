# Agentic OS V4 - Error Messages (UX Optimization) - Round 19

## Summary
This report evaluates the clarity, actionability, and consistency of error messages across the Agentic OS V4 codebase, focusing on CLI, TUI, logs, and API responses. The review identified several areas for improvement, including generic error messages, insufficient context, inconsistent error handling, and missed opportunities for user guidance.

## Detailed Findings

### 1. Generic and Unactionable Error Messages
Several error messages lack specificity and actionable guidance, making troubleshooting difficult:

- **Generic Failure Messages**: 
  - `"Failed to spawn agent"` (server/src/routes/agent-lifecycle.ts:47)
  - `"Failed to pause agent"` (server/src/routes/agent-lifecycle.ts:70)
  - `"Failed to terminate agent"` (server/src/routes/agent-lifecycle.ts:102)
  - `"Failed to create memory — DB returned no row"` (server/src/services.ts:48)
  - `"Failed to create skill — DB returned no row"` (server/src/services.ts:103)
  - `"Failed to create checkpoint — DB returned no row"` (server/src/services.ts:200)
  - `"Failed to store undistilled transcript — DB returned no row"` (server/src/services.ts:242)

  These messages indicate what failed but not *why* (e.g., database connection issue, constraint violation, timeout) or what the user can do (e.g., check database connection, retry later, verify inputs).

- **Vague Authentication Errors**:
  - `"Authentication required"` (server/src/lib/auth-context.ts:22)
  - `"Authorization header required"` (server/src/routes/sse.ts:21)
  - `"Invalid API key"` (server/src/routes/sse.ts:25, 46)
  - `"MCP requires a valid API key"` (server/src/mcp-http.ts:100)

  While better than generic messages, these could specify *how* to authenticate (e.g., "Provide API key via NEXUS_API_KEY environment variable or --api-key flag").

- **Non-descriptive Internal Errors**:
  - `"Internal error"` (server/src/app.ts:65)
  - `"Distillation failed"` (server/src/services.ts:234)

  These provide zero diagnostic information for users or operators.

### 2. Missing Context in Error Messages
Many error messages omit contextual information that would aid troubleshooting:

- **Missing Identifiers**: Errors like `"Memory ${id} not found"` (server/src/services.ts:58,80,90,130) are good, but others lack identifiers:
  - `"Skill not found"` (server/src/services.ts:113,120,152) – missing skill ID
  - `"Agent not found"` (server/src/routes/agent-lifecycle.ts:65,80,98,122,142) – missing agent ID in some instances

- **Missing Operational Context**: Errors often don't include:
  - What operation was being performed
  - What input caused the failure
  - What resources were involved
  - Timing information (timeouts, durations)

### 3. Inconsistent Error Handling Patterns
The codebase shows inconsistency in how errors are handled and presented:

- **Mixed Error Representation**:
  - Some functions throw `Error` objects: `throw new Error("Failed to create memory")`
  - Some return structured errors: `return c.json(err("NOT_FOUND", "Memory not found"))`
  - Some log errors without propagating: `log.error("schema_check_failed", { error })`
  - Some use custom error types: `throw new ApiError("NOT_FOUND", \`Memory ${id} not found.\`)`

- **Inconsistent Error Formatting**:
  - Plain strings: `"Failed to create memory — DB returned no row"`
  - Structured objects: `{ ok: false, error: { code: "NOT_FOUND", message: "Memory not found." } }`
  - JSON-RPC error format: `{ jsonrpc: "2.0", error: { code: -32601, message: "Only POST is supported (stateless MCP)." }, id: null }`
  - Plain console errors: `console.error(\"nexus:\", e instanceof Error ? e.message : String(e))`

### 4. Missing Actionable Guidance
Error messages rarely suggest next steps or solutions:

- **No Recovery Suggestions**: Errors like rate limit or authentication failures don't suggest waiting, retrying, or checking credentials
- **No Configuration Guidance**: Configuration errors don't point to documentation or show expected format
- **No Resource Guidance**: Resource exhaustion errors don't suggest increasing limits or freeing resources
- **No Escalation Path**: Severe errors don't indicate when to seek help or gather diagnostics

### 5. Positive Examples Found
Some error messages follow good practices:

- **Good Context**: `"Memory ${id} not found"` includes the specific ID
- **Good Specificity**: `"Rate limit of ${env.NEXUS_RATE_LIMIT_PER_MINUTE}/min exceeded"` shows the actual limit
- **Good Structure**: MCP HTTP errors use consistent JSON-RPC error format with codes
- **Good Validation**: Validation errors in routes include specific field information: `Invalid directory: ${safe.reason}`

## Recommendations

### 1. Standardize Error Format
Adopt a consistent error structure across all interfaces:
```typescript
interface AgenticError {
  code: string;          // Machine-readable error code
  message: string;       // Human-readable message
  details?: Record<string, any>; // Optional context
  suggestion?: string;   // Optional actionable advice
  retryAfter?: number;   // For rate limits
}
```

### 2. Enrich Error Messages with Context
Always include relevant identifiers and operational context:
- ❌ `"Failed to create memory"`
- ✅ `"Failed to create memory for agent 'agent-123': database connection timeout"`

### 3. Add Actionable Guidance
Where possible, suggest concrete next steps:
- ❌ `"Authentication required"`
- ✅ `"Authentication required. Provide API key via NEXUS_API_KEY environment variable or --api-key flag"`
- ❌ `"Rate limit exceeded"`
- ✅ `"Rate limit exceeded. Limit: 100 requests/minute. Wait 60 seconds before retrying."`

### 4. Improve Specific Error Types
Address the specific issues found:

**Database Errors**:
- ❌ `"Failed to create memory — DB returned no row"`
- ✅ `"Failed to create memory: database constraint violation on unique index 'memories_user_id_key'"`

**Authentication Errors**:
- ❌ `"Invalid API key"`
- ✅ `"Invalid API key: Key format invalid or key not found in database"`

**Agent Lifecycle Errors**:
- ❌ `"Failed to spawn agent"`
- ✅ `"Failed to spawn agent 'research-bot': insufficient memory allocation (requested 2GB, available 512MB)"`

### 5. Implement Consistent Error Handling
Establish patterns for different layers:

**API Layer**:
- Always return structured error responses with codes
- Use appropriate HTTP status codes (400, 401, 403, 404, 429, 500)
- Include error codes that map to documentation

**CLI/TUI Layer**:
- Present errors in user-friendly format
- Suggest remediation steps when possible
- Use consistent coloring/formatting (red for errors, yellow for warnings)

**Logging Layer**:
- Always include contextual information in logs
- Use structured logging for machine parsing
- Include correlation IDs for request tracing

### 6. Establish Error Code System
Create a standardized error code system:
- `AUTH_001`: Authentication missing
- `AUTH_002`: Invalid credentials
- `RATE_001`: Rate limit exceeded
- `RESOURCE_004`: Not found (with resource type)
- `DB_003`: Database connection failure
- `VALID_002`: Validation failed (with field details)

## Files Examined
- MASTER_INTEGRATION_PLAN_30_PHASES_P1.md through P6.md
- MASTER_CONTEXT.md
- .agentic-os-rules.md
- server/src/ (services.ts, routes/, lib/, app.ts, etc.)
- crates/ (installer/, safety/)
- Various TypeScript and Rust files throughout the codebase

## Conclusion
While Agentic OS V4 has a solid foundation for error handling (as evidenced by the CS-001 standard in .agentic-os-rules.md), implementation inconsistencies and missed opportunities for clarity impact the user experience. Addressing the issues outlined above will significantly improve the usability and operability of the system, particularly for troubleshooting and support scenarios.

The error handling improvements should focus on making errors:
1. **Specific**: Clearly state what went wrong
2. **Contextual**: Include relevant IDs, values, and operational context
3. **Actionable**: Tell users what they can do to resolve or work around the issue
4. **Consistent**: Follow predictable patterns across all interfaces
5. **Informative**: Provide enough detail for both users and operators

Implementing these improvements will reduce support burden, improve user satisfaction, and increase operational efficiency.