# Wave 2 Refinement Instructions - Architecture Alignment
# These are pre-prepared instructions for rounds 6-10

# ───────────────────────────────────────
# ROUND 6: Architecture Alignment Review
# ───────────────────────────────────────
ROUND_6_INSTRUCTIONS="You are executing REFINEMENT ROUND 6 of 30 for the Agentic OS V4 plan.

Focus: **ARCHITECTURE ALIGNMENT** — Do the 5 architectural layers work together coherently?

Read the compiled master plan:
C:/Users/Tahir/OneDrive/Desktop/nexus-20-ai-agent-os (7)/Agentic OS V3/MASTER_INTEGRATION_PLAN_30_PHASES.md

Also read:
C:/Users/Tahir/OneDrive/Desktop/nexus-20-ai-agent-os (7)/Agentic OS V3/ARCHITECTURE_ANALYSIS.md
C:/Users/Tahir/OneDrive/Desktop/nexus-20-ai-agent-os (7)/Agentic OS V3/MASTER_CONTEXT.md

Check:
1. Are the 5 layers (UI -> ACP -> Orchestration -> Gateway -> Infrastructure) properly connected?
2. Does each phase clearly belong to one layer?
3. Are there cross-layer dependencies that might cause issues?
4. Is the ACP protocol used consistently as the unification layer?
5. Are there any components that don't fit the architectural model?

Create: REFINEMENT_R6_ARCHITECTURE.md
Apply fixes to the master plan."
"

# ───────────────────────────────────────
# ROUND 7: Data Model Consistency
# ───────────────────────────────────────
ROUND_7_INSTRUCTIONS="You are executing REFINEMENT ROUND 7 of 30 for the Agentic OS V4 plan.

Focus: **DATA MODEL CONSISTENCY** — Are types and interfaces consistent across all phases?

Read the compiled master plan AND:
C:/Users/Tahir/OneDrive/Desktop/nexus-20-ai-agent-os (7)/Agentic OS V3/ARCHITECTURE_ANALYSIS.md

Check:
1. Are ChatRequest/ChatResponse types consistent across all phases?
2. Is the ProviderAdapter trait used consistently?
3. Are routing types (RouteHint, Strategy, Budget) consistent?
4. Is error handling consistent (AgenticError)?
5. Are config types consistent (TOML structure)?

Create: REFINEMENT_R7_DATAMODEL.md
Apply fixes."
"

# ───────────────────────────────────────
# ROUND 8: Interface Contracts
# ───────────────────────────────────────
ROUND_8_INSTRUCTIONS="You are executing REFINEMENT ROUND 8 of 30 for the Agentic OS V4 plan.

Focus: **INTERFACE CONTRACTS** — Are the provider/orchestrator interfaces well-defined?

Read P1.md, P2.md, and ARCHITECTURE_ANALYSIS.md

Check:
1. Is the ProviderAdapter trait sufficient for both cloud + local providers?
2. Are streaming interfaces well-defined for all transport types?
3. Are the orchestrator interfaces (DAG, Pipeline, Graph) compatible with each other?
4. Are skill/plugin interfaces compatible across all 4 source systems?

Create: REFINEMENT_R8_INTERFACES.md
Apply fixes."
"

# ───────────────────────────────────────
# ROUND 9: Cross-Phase Dependencies
# ───────────────────────────────────────
ROUND_9_INSTRUCTIONS="You are executing REFINEMENT ROUND 9 of 30 for the Agentic OS V4 plan.

Focus: **CROSS-PHASE DEPENDENCIES** — Are phase dependencies correctly ordered?

Read all P1-P6 files.

Check:
1. Can Phase X be executed before Phase Y if Y depends on X?
2. Are there circular dependencies between phases?
3. Are there missing prerequisites in any subphase?
4. Is the dependency graph accurate and complete?

Create: REFINEMENT_R9_DEPENDENCIES.md
Apply fixes."
"

# ───────────────────────────────────────
# ROUND 10: Naming Conventions
# ───────────────────────────────────────
ROUND_10_INSTRUCTIONS="You are executing REFINEMENT ROUND 10 of 30 for the Agentic OS V4 plan.

Focus: **NAMING CONVENTIONS** — Are names consistent across all documents?

Read all P1-P6 files.

Check:
1. Are crate/package names consistent? (Use snake_case for Rust, kebab-case for packages)
2. Are type names consistent? (PascalCase for types, camelCase for instances)
3. Are file/directory paths consistent?
4. Are config keys consistent? (TOML snake_case)
5. Are function names consistent with Rust conventions?

Create: REFINEMENT_R10_NAMING.md
Apply fixes."
"
