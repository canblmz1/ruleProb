# Release Notes

## v0.2 - Proof And Comparison

v0.2 turns RuleProbe from an honest beta into a more team-usable compliance tool:

- deterministic vs hybrid comparison via `ruleprobe compare` and `list-rules --compare deterministic,hybrid`
- provider capability matrix in docs and CLI via `ruleprobe providers`
- Known Limitations blocks in JSON, Markdown, and HTML reports
- richer fixture benchmark corpus covering monorepo, Copilot, command, file-change, code-pattern, commit, and package-manager rules
- documented GitHub Actions integration with clear exit behavior
- reproducible Gemini and Claude Code smoke demo flows with fallback honesty

## v0.3 - Category Ownership

v0.3 makes RuleProbe more like the reference tool for testing repository AI instruction files:

- category-native scenario templates for commands, package managers, file ownership, code patterns, and final-answer rules
- proof-oriented reports with Failure Groups, result limitation notes, and changed-content snippets
- benchmark corpus governance in `BENCHMARKS.md`
- public OSS extraction comparison examples in `docs/examples/oss-extraction-comparisons.md`
- extension contracts for providers and rule categories in `docs/extensions.md`

## Release Readiness Checklist

Required before a public beta release:

```bash
pnpm build
pnpm typecheck
pnpm test
pnpm dev benchmark --fixtures-only
pnpm dev compare examples/basic --provider mock
pnpm dev providers
pnpm dev list-rules examples/basic
pnpm dev run examples/basic --provider mock --fail-below 70
pnpm dev run examples/basic --provider dry-run --fail-below 0
npm pack --dry-run --json
```

Recommended real-provider smoke checks:

```bash
pnpm dev list-rules C:\dev\better-auth --extractor hybrid --provider gemini --debug-extractor
pnpm dev run C:\dev\better-auth --provider gemini --extractor hybrid --fail-below 0 --debug-extractor
```

If an API provider is rate-limited or unavailable, record the actual behavior. A clean beta result is explicit fallback/debug output and no fake PASS claims.

## Positioning

RuleProbe should be described as:

- a public beta
- a CLI for testing AI coding instruction compliance
- useful for `CLAUDE.md`, `AGENTS.md`, Cursor rules, and Copilot instructions
- a measurement tool, not an enforcement guarantee
- a proof-oriented report generator for sandboxed compliance checks

Avoid claiming production-perfect compliance, complete sandbox security, or universal extraction accuracy.

## Release Artifacts

- README with problem statement, proof-oriented example, benchmark, provider tradeoffs, and limitations
- SECURITY.md
- CONTRIBUTING.md
- CI workflow
- benchmark output from fixture corpus
- comparison output from `ruleprobe compare`
- provider capability matrix from docs or CLI
- benchmark governance and extension docs
- public OSS extraction comparison examples
- demo output from `mock` or `dry-run`; real provider demos must record actual availability/fallback behavior
- `npm pack --dry-run --json` output showing a clean tarball
