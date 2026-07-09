# skill.service

## Purpose
Skill registry CRUD + outcome tracking. `createSkill`/`updateSkill`/`deleteSkill` manage `SkillRow`s;
`recordOutcome` logs a skill run's success/failure for ranking. (Artisan area.)

## Public exports (selected)
- `async function createSkill(input: SkillRow, actor: string): Promise<unknown>`.
- `async function updateSkill(...)`.
- `async function deleteSkill(id, actor): Promise<void>`.
- `async function recordOutcome(skillId, success, meta?): Promise<void>`.
- `type SkillRow` (re-exported).

## Env vars
None directly.

## Test file
- `server/tests/skill.service.test.ts` (create/update/delete/recordOutcome).
