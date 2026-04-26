# Engineering Agent Rules

## Package manager and validation

- ALWAYS use `pnpm`; never use npm or yarn for repository scripts.
- NEVER run `npm install` or `yarn install`.
- ALWAYS run `pnpm lint` before handing off frontend changes.
- ALWAYS run `pnpm typecheck` before final response.

## File ownership

- Do not change `package.json` unless the task explicitly asks for dependency metadata.
- Never edit files under `packages/web/src/generated/`.
- Bug fixes must include tests.
- Public API changes must update docs.

## Code patterns

- Avoid `any`; use unknown and narrow it.
- Use `Uint8Array` instead of `Buffer` in browser-facing code.

## Git boundaries

- DO NOT COMMIT unless the maintainer explicitly asks.
