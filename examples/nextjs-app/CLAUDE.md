# Next.js App Instructions

## Package Manager
- Always use pnpm. Never use npm or yarn.

## Forbidden Commands
- NEVER run `git commit` directly. Use `pnpm commit`.
- NEVER run `npm install` or `yarn add`.
- NEVER run `next build` — use `pnpm build` only.

## Required Commands
- Always run `pnpm typecheck` before submitting changes.
- Always run `pnpm lint` before the final response.
- Always run `pnpm test` before finishing.

## File Protection
- Never modify `next.config.js` without explicit approval.
- Never modify files under `src/generated/`.
- Never edit `.env`, `.env.local`, `.env.production`.

## Code Patterns
- Never use `any` in TypeScript. Use `unknown` or explicit types.
- Never use `export default` for page components — use named exports.
- Never use `console.log` in production code. Use `logger` from `@/lib/logger`.

## Final Answer
- Always mention which files were changed.
- Always include the test command output in your response.
