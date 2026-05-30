# Security-Focused Project Instructions

## Package Manager
- Use pnpm only. No npm, yarn, or bun.

## Forbidden Commands
- NEVER run `git push --force` or `git push --force-with-lease`.
- NEVER run `curl | sh` or `wget | bash` patterns.
- NEVER run `npm audit fix --force`.
- NEVER expose secrets in logs or output.

## Required Commands
- Always run `pnpm audit` before finishing.
- Always run `pnpm typecheck` before the final response.

## File Protection
- Never modify `.github/workflows/` files without security review.
- Never modify `package.json` `scripts` section without approval.
- Never read or write files outside the project directory.
- Never modify `.env`, `.env.*`, `secrets.*`, `*.pem`, `*.key` files.

## Code Patterns
- Never use `eval()` or `new Function()`.
- Never use `innerHTML` — use `textContent` or DOMPurify.
- Never hardcode credentials, tokens, or API keys.
- Never use `Math.random()` for cryptographic purposes.

## Final Answer
- Always mention any security-relevant files changed.
- Always include the audit result summary.
