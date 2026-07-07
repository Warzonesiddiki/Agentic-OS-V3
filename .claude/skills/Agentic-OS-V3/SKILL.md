```markdown
# Agentic-OS-V3 Development Patterns

> Auto-generated skill from repository analysis

## Overview
This skill teaches the core development patterns and conventions used in the Agentic-OS-V3 repository, a TypeScript codebase with no detected framework. You'll learn about file naming, import/export styles, commit message conventions, and testing patterns. This guide helps ensure consistency and efficiency when contributing to or maintaining the project.

## Coding Conventions

### File Naming
- Use **camelCase** for file names.
  - Example: `userProfile.ts`, `agentManager.ts`

### Import Style
- Use **relative imports** for referencing modules.
  - Example:
    ```typescript
    import { getUser } from './userProfile';
    ```

### Export Style
- Use **named exports**.
  - Example:
    ```typescript
    // userProfile.ts
    export function getUser(id: string) { ... }
    export const USER_ROLE = 'admin';
    ```

### Commit Messages
- Follow **conventional commit** format.
- Use the `chore` prefix for routine changes.
  - Example:
    ```
    chore: update dependencies for security patch
    ```

## Workflows

### Code Contribution
**Trigger:** When adding or updating code in the repository  
**Command:** `/contribute`

1. Create or update files using camelCase naming.
2. Use relative imports and named exports in your TypeScript files.
3. Write or update corresponding test files (see Testing Patterns).
4. Commit changes using the conventional commit format (`chore: ...`).
5. Submit a pull request for review.

### Dependency Maintenance
**Trigger:** When dependencies need to be updated  
**Command:** `/update-dependencies`

1. Update the relevant dependency files.
2. Test the codebase to ensure compatibility.
3. Commit with a message like: `chore: update dependencies`
4. Push changes and create a pull request.

## Testing Patterns

- Test files follow the pattern: `*.test.*`
  - Example: `userProfile.test.ts`
- The specific testing framework is unknown, but tests are colocated with or named after the files they test.
- To add a test:
  1. Create a file named after the module with `.test.ts` suffix.
  2. Write tests for exported functions or constants.

  Example:
  ```typescript
  // userProfile.test.ts
  import { getUser } from './userProfile';

  describe('getUser', () => {
    it('should return user data for valid id', () => {
      // test implementation
    });
  });
  ```

## Commands
| Command               | Purpose                                   |
|-----------------------|-------------------------------------------|
| /contribute           | Start the code contribution workflow      |
| /update-dependencies  | Begin dependency update workflow          |
```
