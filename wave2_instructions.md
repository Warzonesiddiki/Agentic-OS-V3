# Wave 2: Architecture Alignment — Pre-prepared Delegation Instructions
# Rounds 6-10 — ready to launch with: delegate(instructions: readfile, ...)

--- ROUND 6 ---
Round 6: Architecture Alignment Review
Read these files:
1. C:/Users/Tahir/OneDrive/Desktop/nexus-20-ai-agent-os (7)/Agentic OS V3/MASTER_INTEGRATION_PLAN_30_PHASES_P1.md
2. C:/Users/Tahir/OneDrive/Desktop/nexus-20-ai-agent-os (7)/Agentic OS V3/MASTER_INTEGRATION_PLAN_30_PHASES_P2.md
3. C:/Users/Tahir/OneDrive/Desktop/nexus-20-ai-agent-os (7)/Agentic OS V3/MASTER_INTEGRATION_PLAN_30_PHASES_P3.md
4. C:/Users/Tahir/OneDrive/Desktop/nexus-20-ai-agent-os (7)/Agentic OS V3/MASTER_INTEGRATION_PLAN_30_PHASES_P4.md
5. C:/Users/Tahir/OneDrive/Desktop/nexus-20-ai-agent-os (7)/Agentic OS V3/MASTER_INTEGRATION_PLAN_30_PHASES_P5.md
6. C:/Users/Tahir/OneDrive/Desktop/nexus-20-ai-agent-os (7)/Agentic OS V3/MASTER_INTEGRATION_PLAN_30_PHASES_P6.md
7. C:/Users/Tahir/OneDrive/Desktop/nexus-20-ai-agent-os (7)/Agentic OS V3/ARCHITECTURE_ANALYSIS.md

Check: Are the 5 layers (UI → ACP → Orchestration → Gateway → Infrastructure) properly connected across all phases? Any layer boundary violations? Is ACP the consistent unification protocol?

Write: C:/Users/Tahir/OneDrive/Desktop/nexus-20-ai-agent-os (7)/Agentic OS V3/REFINEMENT_R6_ARCHITECTURE.md

--- ROUND 7 ---
Round 7: Data Model Consistency
Read: P1.md, ARCHITECTURE_ANALYSIS.md (section 4)

Check: Are the Rust core types (ChatRequest, ProviderAdapter, ChatResponse, etc.) used consistently across all phases? Any type conflicts?

Write: C:/Users/Tahir/OneDrive/Desktop/nexus-20-ai-agent-os (7)/Agentic OS V3/REFINEMENT_R7_DATAMODEL.md

--- ROUND 8 ---
Round 8: Interface Contracts
Read: P1.md (Phases 1-5), P2.md (Phases 6-10)

Check: Are the ProviderAdapter, Router, Orchestrator, and Skill interfaces well-defined? Are they compatible? Any missing methods?

Write: C:/Users/Tahir/OneDrive/Desktop/nexus-20-ai-agent-os (7)/Agentic OS V3/REFINEMENT_R8_INTERFACES.md

--- ROUND 9 ---
Round 9: Cross-Phase Dependencies
Read: All P1-P6.md files

Check: Are phase dependencies correct? Any circular dependencies? Missing prerequisites?

Write: C:/Users/Tahir/OneDrive/Desktop/nexus-20-ai-agent-os (7)/Agentic OS V3/REFINEMENT_R9_DEPENDENCIES.md

--- ROUND 10 ---
Round 10: Naming Conventions
Read: All P1-P6.md files and .agentic-os-rules.md

Check: Are naming conventions consistent (Rust: snake_case, PascalCase types; TS: camelCase, PascalCase types; Config: TOML snake_case)?

Write: C:/Users/Tahir/OneDrive/Desktop/nexus-20-ai-agent-os (7)/Agentic OS V3/REFINEMENT_R10_NAMING.md
