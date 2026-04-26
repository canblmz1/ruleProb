# Copilot Instructions

1. Use `pnpm` for all workspace commands; do not use npm.
2. Never run `git push` from an agent session.
3. Required checks for library edits: run `pnpm build` and `pnpm test`.
4. Do not touch `.github/workflows/release.yml` during feature work.
5. Never modify files in `src/generated/`.
6. Final answers must mention test results.
7. Conventional commit examples such as `feat(scope):` are references only.
