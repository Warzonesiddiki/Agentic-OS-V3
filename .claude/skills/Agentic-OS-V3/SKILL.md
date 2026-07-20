```markdown
# Agentic-OS-V3 Development Patterns

> Auto-generated skill from repository analysis

## Overview
This skill teaches you the core development patterns and conventions used in the Agentic-OS-V3 repository, a TypeScript React project. You'll learn how to follow the project's coding standards, write and organize code, structure commits, and understand the testing approach. This guide helps ensure consistency and maintainability across the codebase.

## Coding Conventions

### File Naming
- Use **camelCase** for all file names.
  - Example: `userProfile.tsx`, `agentManager.ts`

### Import Style
- Use **relative imports** for modules within the project.
  - Example:
    ```typescript
    import { UserProfile } from './userProfile';
    ```

### Export Style
- Prefer **named exports** over default exports.
  - Example:
    ```typescript
    // userProfile.tsx
    export function UserProfile() { ... }
    ```

### Commit Messages
- Follow the **Conventional Commits** specification.
- Use prefixes such as `feat` for features and `docs` for documentation.
- Keep commit messages concise (average 52 characters).
  - Example:
    ```
    feat: add agent manager component
    docs: update README with setup instructions
    ```

## Workflows

_No automated workflows detected in this repository._

## Testing Patterns

- **Test Framework:** Not specified (unknown).
- **Test File Pattern:** Name test files with `.test.` in the filename.
  - Example: `agentManager.test.ts`, `userProfile.test.tsx`
- Place tests alongside the files they test or in a dedicated test directory.

#### Example Test File
```typescript
// agentManager.test.ts
import { AgentManager } from './agentManager';

describe('AgentManager', () => {
  it('should initialize correctly', () => {
    // test implementation
  });
});
```

## Commands
| Command | Purpose |
|---------|---------|
| /commit-conventions | Show commit message guidelines |
| /file-naming        | Show file naming conventions   |
| /import-export      | Show import/export patterns    |
| /testing            | Show test file patterns        |
```
