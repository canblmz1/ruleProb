# AGENTS.md — Project Rules for AI Agents

## Commands
- ALWAYS use pnpm. Never run `npm install` or `yarn`.
- NEVER run `git push --force`.
- ALWAYS run `pnpm test` before submitting changes.
- NEVER run `pnpm build` unless you are finalizing a release.

## Code Quality
- NEVER use `any` type in TypeScript files. Use `unknown` or explicit types.
- NEVER leave `console.log` statements in production code.
- NEVER commit directly to `main`. Work on a feature branch.

## File Safety
- NEVER modify files in `dist/` or `build/` directories.
- NEVER edit `.env` files without explicit instruction from the user.
- NEVER delete files without confirming with the user first.

## Response Format
- ALWAYS list which files were changed in your final response.
- ALWAYS include the test command you ran to verify the change.
- Keep responses concise — avoid padding or filler sentences.
