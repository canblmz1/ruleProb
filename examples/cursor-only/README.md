# cursor-only Example

This example shows RuleProbe running against a project that uses only
`.cursor/rules` — no `CLAUDE.md` or `AGENTS.md`.

## Usage

```bash
# npx (no install needed)
npx ruleprobe-ai run examples/cursor-only --provider mock

# or if installed globally
ruleprobe run examples/cursor-only --provider mock
ruleprobe list-rules examples/cursor-only
```

## What's tested

Rules come from `.cursor/rules/main.mdc`:

- Package manager: always pnpm, never npm/yarn
- TypeScript: no `any`, no stray `console.log`
- File safety: no edits to generated files or `.env`
- Commands: must run `pnpm typecheck`, never `git push --force`
