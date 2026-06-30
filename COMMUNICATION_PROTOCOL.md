# Hermes & OpenCode Communication Protocol

## Overview
This document defines the structured communication pattern between Hermes (orchestrator) and OpenCode (executor) for the Nexus-20 AI Agent OS V3 project.

## Communication Channels

### Primary Channels
1. **Direct Task Commands** - Specific execution instructions
2. **Status Updates** - Progress and completion reports
3. **Verification Requests** - Validation and testing commands
4. **Problem Reports** - Error and issue notifications

### Communication Format
All messages follow this structure:
```
[CHANNEL] [TIMESTAMP] [PRIORITY] [MESSAGE_TYPE]

MESSAGE CONTENT

METADATA:
- Context: <task-context>
- Dependencies: <list>
- Expected Output: <description>

NEXT ACTIONS:
1. <action-1>
2. <action-2>

VERIFICATION:
- Test commands to run
- Validation steps
```

## Channel Definitions

### 1. Task Assignment Channel
**Format:** `[TASK] [PRIORITY] [TASK_ID] - <description>`

**Examples:**
```
[TASK] CRITICAL P1-LINT-01 - Fix lint errors in src/lib/env.ts

Fix the module resolution error for env.js import in schema.ts (TS2307)

METADATA:
- Context: TypeScript compilation failing during validate phase
- Dependencies: None
- Expected Output: Clean build without lint/typecheck errors

NEXT ACTIONS:
1. Check current schema.ts import statement
2. Match with dist/src/lib/env.js
3. Update import to match built module

VERIFICATION:
- Run npm run typecheck
```

### 2. Status Update Channel
**Format:** `[STATUS] [PRIORITY] [OPERATION_ID] - <operation-status>`

**Examples:**
```
[STATUS] INFO P1-ENG-23 - Analysis complete, 3 issues found

Analyzed tests/sandbox.test.ts for timeout issues (P0-6)

METADATA:
- Start Time: 2025-06-29 20:30:00
- End Time: 2025-06-29 20:32:15
- Duration: 2m 15s
- Issues Found: 2 critical, 1 warning

NEXT ACTIONS:
1. Fix injection type checking in sandbox.test.ts line 21
2. Add proper error boundary for timeout tests
3. Update test assertions to match audit manual

VERIFICATION:
- npm test -- --testPathPattern=sandbox.test.ts
```

### 3. Verification Request Channel
**Format:** `[VERIFY] [PRIORITY] [CHECK_ID] - <verification-purpose>`

**Examples:**
```
[VERIFY] HIGH V1-LINT-01 - Validate environment imports

Verify all env.js imports across the codebase

METADATA:
- Check Pattern: "from \'../lib/env.js\' or from \"../lib/env.mjs\""
- Expected Pattern: Consistent import across src/db/ and src/lib/
- Success Criteria: All imports resolve correctly

NEXT ACTIONS:
1. Search for all env.js import patterns
2. Identify mismatches
3. Standardize imports to match built modules

VERIFICATION:
- grep -r "from ../lib/env" src/
- npm run typecheck
```

## Operation Coordination

### Task Prioritization

**Priority Levels:**
- **CRITICAL** - Blocks validate phase (lint/typecheck/test)
- **HIGH** - Major feature/roadmap item
- **MEDIUM** - Bug fixes, documentation
- **LOW** - Minor improvements, cleanup

**Tier-1 Tasks (Immediate):**
1. Fix validate phase blockers (C-1 through C-3)
2. Complete Phase 1 server fixes (sandbox, security, stability)
3. Set up communication infrastructure

### Working Patterns

#### 1. Sequential Tasks
Execute in defined order; next task waits for completion of previous.

#### 2. Parallel Tasks
Independent components can be executed concurrently when safe.

#### 3. Dependency-Chain
Tasks that build upon previous work results.

## Operational Procedures

### Task Distribution Protocol

1. **Hermes** distributes tasks in batches (max 3 concurrent)
2. **OpenCode** reports status every 30 seconds or on completion
3. **Rollback** capability for failed operations
4. **Verification** after each major deliverable

### Session Continuity

**Session Handoff:**
```
[SESSION_END] Previous session completed successfully
Main achievements:
- Fixed env.js import issues
- Resolved typecheck lint errors
- Prepared server for validate phase

Next session focus:
- Execute validate phase (C-1)
- Fix sandbox.test.ts timeout issues
- Begin security test validation
```

## Error Handling Protocol

### Error Classification

1. **Environment Issues** - Module resolution, config, dependencies
2. **Code Logic Issues** - Test failures, implementation bugs
3. **Specification Issues** - Test vs. spec mismatches

### Response Templates

**For Environment Issues:**
```
[ERROR] CRITICAL E1-ENV-01 - Module not found
Cannot find module '../lib/env.mjs'

CAUSE: Import mismatch with built files
SOLUTION: Use export from "../lib/env.mjs" (ES2022)

FIX:
1. Change import from "import { env }" to "export { env }".
2. Update all references to schema.ts to use exported env.

VERIFICATION:
- npm run typecheck
- npm run db:generate
```

**For Code Logic Issues:**
```
[ERROR] HIGH E2-LOGIC-01 - Test timeout unexpected
Test timeout test (P0-6) is hanging during runInContext execution

CAUSE: TypeScript injection issue with spread operator on non-object type
SOLUTION: Fix injection type checking in sandbox.test.ts line 21

FIX:
1. Inject proper type guard before spread
2. Add null check before object operations
3. Use identity injection for pure function testing

VERIFICATION:
- npm test -- --testPathPattern=sandbox.test.ts
- Check inject results
```

## Verification Framework

### Pre-Commit Checkpoints

**Phase 1 Validation:**
1. **C-1**: Fix all lint/typecheck errors
2. **C-2**: Resolve env.js import mismatches
3. **C-3**: Fix sandbox.test.ts timeout (P0-6)

**Phase 2 Validation:**
1. **C-4**: Validate security.test.ts path traversal
2. **C-5**: Run full test suite
3. **C-6**: Execute validate phase completely

### Automated Validation Commands

```bash
# Phase 1 Checkpoint
npm run lint                    # Lint validation
npm run typecheck               # TypeScript validation
npm test -- --testPathPattern="sandbox.security"  # Focus tests

# Full Validation
npm run validate                # Complete validation pipeline

# Specific Fixes
npm run db:generate             # Schema generation test
npm test -- --testPathPattern="security"  # Security tests
```

## Progress Tracking

### Task Completion Status

| Task ID | Description | Status | Completion Time | Quality |
|---------|-------------|--------|----------------|---------|
| P1-LINT-01 | Fix env.js imports | ✅ Complete | 2025-06-29 20:32:15 | Excellent |
| P1-ENG-23 | sandbox.test.ts fix | 🔄 In Progress | - | - |
| P1-LINT-02 | Resolve security.test | 🔄 Pending | - | - |
| P1-CORE-04 | Full validate execution | ⏸️ Blocked | - | - |

### Quality Metrics

- **Zero Tolerance**: No lint/typecheck errors in validate phase
- **Test Coverage**: All Phase 1 tests pass (50+ tests)
- **Performance**: Test execution under 30 seconds
- **Dependencies**: No circular imports or resolution issues

## Session Templates

### Beginning Session
```
[SESSION_START] Nexus-20 Phase 1 Focus
Agent: OpenCode (deepseek-v4-flash)
Task: Complete Phase 1.1 server fixes

GOAL:
- Fix sandbox.test.ts timeout (P0-6)
- Validate security.test.ts path traversal
- Run full test suite (50+ tests)

PRIORITIES:
1. ✅ Fixed env.js imports (completed by Hermes)
2. 🔄 Fix sandbox test injection types
3. 🔄 Validate security guard improvements
4. ⏸️ Run complete validation pipeline

REMAINING WORK:
- sandbox.test.ts timeout fix: ~45min
- security.test.ts validation: ~30min
- full test suite: ~15min

AUTONOMY: Full execution rights for code fixes and test validation

CO-QA:
- Run comprehensive test suite
- Validate with audit manual checks
- Ensure zero failures
```

### Progress Reports
```
[PROGRESS] Every 30 seconds during active work
CURRENT TASK: <active-task>
ESTIMATED_COMPLETION: <time-remaining>
BLOCKERS: <any-blockers>

EXAMPLE:
[PROGRESS] CRITICAL sandbox.test injection fix - 75% complete
Fixed spread operator issue
Remaining: Configure proper type guards for test injection
Time remaining: ~15 minutes
BLOCKERS: None
```

### Completion Reports
```
[TASK_COMPLETE] <TASK_ID> - <description>

ACHIEVEMENTS:
- Fixed sandbox.test.ts injection types (P0-6)
- Added proper error boundary for runInContext
- All test assertions aligned with audit manual

VERIFICATION:
✓ npm test -- --testPathPattern=sandbox.test.ts (10/10 passed)
✓ TypeScript compilation clean
✓ Security tests (1/1 passed)

NEXT TASK:
P1-LINT-02 - Resolve security.test.ts path traversal validation

 QUALITY CHECK:
- Code style: ✅ Passed
- Test coverage: ✅ 100% of required tests
- Performance: ✅ < 30 seconds execution
```

## Emergency Protocol

### Critical Failures
**Triggers:**
- Validate phase completely blocked
- Test suite failing > 25% of tests
- Core functionality compromised

**Response:**
1. Immediate halt operations
2. `help me fix critical failure` (Hermes only)
3. Document all findings
4. Pause all parallel work

### Session Recovery
**When resuming:**
1. Review last successful completion
2. Verify no pending blockers
3. Ensure environment intact
4. Restart with clear task list

## Version Control Integration

### Commit Standards
```
git add <modified-files>
git commit -m "FIX: <issue-description> (#<ticket-id>)"
git commit --signoff
```

### Branch Strategy
- **main**: Production-ready state
- **feature/<ticket-id>**: Active development
- **hotfix/<issue-id>**: Immediate emergency fixes

## Success Metrics

### For This Project
- ✅ All Phase 1 tests passing (50+ tests)
- ✅ Zero lint/typecheck errors in validate phase
- ✅ Complete communication framework established
- ✅ Effective Hermes/OpenCode coordination
- ✅ Full Phase 1.5 roadmap implementation

### For Communication
- ✅ Clear, unambiguous messaging
- ✅ Proper error handling and recovery
- ✅ Comprehensive status tracking
- ✅ Effective task distribution
- ✅ Quality verification at every step

---

## Usage Instructions

1. **Hermes (Orchestrator)**:
   - Define clear, prioritized tasks
   - Provide verification templates
   - Track session continuity
   - Handle emergency situations

2. **OpenCode (Executor)**:
   - Execute tasks with autonomy
   - Report progress regularly
   - Follow quality standards
   - Request clarification when needed

3. **Both Agents**:
   - Adhere to communication format
   - Use proper error handling
   - Maintain quality checkpoints
   - Document all decisions

---

**Last Updated**: 2025-06-29
**Version**: 1.0
**Next Review**: After Phase 1 completion

---

*This protocol ensures effective coordination between Hermes and OpenCode agents for the Nexus-20 AI Agent OS V3 project. Follow the established patterns for best results.*

---

**DEPLOYMENT INSTRUCTIONS**:

1. Place this file in your project root
2. Configure Hermes to follow this protocol
3. Use OpenCode Zen with deepseek-v4-flash model
4. Begin with Phase 1.1 critical fixes
5. Progress through phases systematically

**Remember**: The goal is not just to fix issues, but to establish a sustainable communication framework for future collaboration. Use this as a reference, not a constraint.