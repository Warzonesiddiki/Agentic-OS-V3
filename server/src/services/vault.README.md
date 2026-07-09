# vault

## Purpose
Obsidian-vault bridge. `parseMarkdown` extracts frontmatter + headings from a markdown doc (pure); `syncVault`
indexes the vault folder into memories; `writeBack` persists a generated note back to the vault. (Prism/Artisan
boundary — file lives in server, consumed by dashboard.)

## Public exports
- `function parseMarkdown(raw: string): Parsed` — pure.
- `async function syncVault(actor: string): Promise<{ indexed: number }>`.
- `async function writeBack(...)` — persiste a note to `NEXUS_OBSIDIAN_VAULT`.

## Env vars
- `NEXUS_OBSIDIAN_VAULT` — path to the Obsidian vault root.

## Test file
- `server/tests/vault.test.ts` (parseMarkdown pure, syncVault/writeBack mock).
