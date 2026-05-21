# agents-md Example

This example shows RuleProbe running against a project that uses only
`AGENTS.md` — the format used by OpenAI Codex, GitHub Copilot Workspace,
and other agents that follow the AGENTS.md convention.

## Usage

```bash
# npx (no install needed)
npx ruleprobe-ai run examples/agents-md --provider mock

# or if installed globally
ruleprobe run examples/agents-md --provider mock
ruleprobe list-rules examples/agents-md
```

## What's tested

Rules come from `AGENTS.md`:

- Package manager: always pnpm
- Forbidden: `git push --force`, `pnpm build` without release context
- Required: `pnpm test` before submitting
- TypeScript: no `any`, no stray `console.log`
- File safety: no edits to `dist/`, no `.env` changes
- Response format: list changed files, include test command
