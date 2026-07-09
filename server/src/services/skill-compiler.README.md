# skill-compiler

## Purpose
Autonomous skill compiler (Phase 16/19). Detects repetitive code patterns (`detectRepetitivePatterns`),
generates a skill script (`generateScript`), evaluates it against match threshold (`evaluateScript`,
`EvalScriptResult`), validates declared capabilities against an allowlist (`validateSkillCapabilities`,
`SKILL_ALLOWED_CAPABILITIES`, `SkillCapabilityViolation`), dry-runs generated code (`dryRunSkill`), and runs
the full `runCompilationPipeline` + `checkCompiledScript` + `listCompiledScripts`. (Artisan area.)

## Public exports (selected)
- `const COMPILATION_THRESHOLD`, `const EVAL_MATCH_THRESHOLD` (from env).
- `interface DetectedPattern`, `async function detectRepetitivePatterns(): Promise<DetectedPattern[]>`.
- `interface GeneratedScript`, `function generateScript(pattern): GeneratedScript`.
- `interface EvalScriptResult`, `async function evaluateScript(...)`.
- `interface CompilationResult`, `class SkillCapabilityViolation`.
- `const SKILL_ALLOWED_CAPABILITIES: string[]`.
- `function validateSkillCapabilities(declared, attempted): void`.
- `function dryRunSkill(code, sampleInputs): string[]`.
- `async function runCompilationPipeline(actor): Promise<CompilationResult>`.
- `async function checkCompiledScript(...)`, `listCompiledScripts()`.

## Env vars
- `NEXUS_COMPILATION_THRESHOLD`, `NEXUS_EVAL_MATCH_THRESHOLD`.

## Test file
- `server/tests/skill-compiler.test.ts` (detect/generate/evaluate, capability validation, dry-run).
