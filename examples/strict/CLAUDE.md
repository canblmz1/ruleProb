# Strict Example — High Coverage Rule Set

## Package Manager
- ALWAYS use pnpm. Never use npm or yarn for installs.

## Forbidden Commands
- NEVER run `git commit` directly. Use `pnpm commit`.
- NEVER run `pnpm test`. Use `vitest run --reporter=verbose` instead.
- NEVER run `git push --force`.

## Required Commands
- ALWAYS run `pnpm typecheck` before submitting changes.
- ALWAYS run `pnpm lint --fix` before the final response.

## File Protection
- Never modify files under `src/generated/`.
- Never modify `package.json` without explicit approval.
- Never modify `.env` or `.env.*` files.

## Code Patterns
- Never use `any` in TypeScript. Use `unknown` or explicit types.
- Never use `class` components in React. Use function components only.
- Never use `console.log` in production code. Use the project logger.

## Final Answer
- Always mention which files were changed in your final response.
- Always include the command you ran to verify the change.
