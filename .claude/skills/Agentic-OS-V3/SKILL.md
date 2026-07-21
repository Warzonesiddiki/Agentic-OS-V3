```markdown
# Agentic-OS-V3 Development Patterns

> Auto-generated skill from repository analysis

## Overview
This skill teaches you the core development patterns and conventions used in the Agentic-OS-V3 TypeScript codebase. You'll learn about file organization, code style, commit practices, and how to write and run tests using Vitest. These patterns ensure consistency, readability, and maintainability across the project.

## Coding Conventions

### File Naming
- **Style:** kebab-case
- **Example:**  
  ```
  agent-manager.ts
  user-session-handler.ts
  ```

### Import Style
- **Style:** Relative imports
- **Example:**  
  ```typescript
  import { Agent } from './agent';
  import { SessionManager } from '../session/session-manager';
  ```

### Export Style
- **Style:** Named exports
- **Example:**  
  ```typescript
  // agent.ts
  export function createAgent() { ... }
  export const AGENT_VERSION = '3.0.0';
  ```

### Commit Messages
- **Type:** Conventional commits
- **Prefix:** `feat`
- **Example:**  
  ```
  feat: add agent session persistence
  feat: improve error handling in agent manager
  ```

## Workflows

### Creating a New Feature
**Trigger:** When adding new functionality  
**Command:** `/create-feature`

1. Create a new `.ts` file using kebab-case for the filename.
2. Use relative imports for any dependencies.
3. Export your functions or constants using named exports.
4. Write a corresponding test file named `your-feature.test.ts`.
5. Commit your changes using the `feat:` prefix and a concise description.

### Running Tests
**Trigger:** When verifying code correctness  
**Command:** `/run-tests`

1. Ensure your test files follow the `*.test.ts` pattern.
2. Run the test suite using Vitest:
   ```
   npx vitest
   ```
3. Review the output and fix any failing tests.

## Testing Patterns

- **Framework:** Vitest
- **Test File Pattern:** `*.test.ts`
- **Example Test File:**  
  ```typescript
  // agent-manager.test.ts
  import { createAgent } from './agent-manager';

  describe('createAgent', () => {
    it('should create a valid agent', () => {
      const agent = createAgent('test');
      expect(agent.name).toBe('test');
    });
  });
  ```

## Commands
| Command         | Purpose                                   |
|-----------------|-------------------------------------------|
| /create-feature | Scaffold a new feature with conventions   |
| /run-tests      | Run all tests using Vitest                |
```
