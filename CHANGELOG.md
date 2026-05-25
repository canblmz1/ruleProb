# Release Notes

## v1.2.0 - Multi-Language Support

- **`--lang` flag:** `ruleprobe run --lang python` (or `go`, `rust`, `node`) activates a language profile that customizes the AI extraction prompt with language-specific package managers, command prefixes, and test runners
- **Language profiles:** Built-in profiles for Node.js/TypeScript (default), Python (pip/poetry/uv/pytest/ruff), Go (go mod/go test/gofmt/golangci-lint), and Rust (cargo/clippy/rustfmt)
- **Cache isolation:** Extraction cache key now includes the active language profile — switching `--lang` always produces a fresh extraction, not a stale cross-language result
- **Validation:** Unknown `--lang` values (e.g. typos) exit with a clear error instead of silently falling back to the Node.js profile

## v1.1.0 - AI Extraction Reliability

- **Retry on parse failure:** When AI extractor returns unparseable JSON, one repair-prompt retry is attempted before falling back to deterministic extraction — improves extraction success rate for models with inconsistent JSON output
- **Rule pre-filter:** AI-returned candidates missing required fields (`id`, `text`, `category`, `testable`, `severity`) are rejected before `validateCandidate` — prevents invalid rules from reaching the evaluator
- **Parse success rate tracking:** Debug mode now reports `parse success rate: X/Y files` per provider — lets you see at a glance how often AI extraction actually succeeded vs fell back

## v1.0.1 - Windows Reliability

- **Fix (Windows):** `getChangedFiles()` now checks for `.git` before spawning `git status` — eliminates ~30 redundant process spawns per mock-provider test run and fixes 15s timeout on Windows CI
- **Fix (Windows):** Test sandbox cleanup in `execute-security.test.ts` now uses `fs.rm` with `maxRetries: 5, retryDelay: 100` — eliminates EBUSY race condition during cleanup on Windows

## v1.0.0 - CLI Architecture & Public API

- **Refactor (CLI):** `src/cli/index.ts` (942 lines) split into 20 focused per-command modules under `src/cli/commands/` — each exporting `register(program: Command): void`. The orchestrator is now 53 lines. No behavior changed.
- **Provider Plugin API:** `src/index.ts` now exports `GeminiProvider`, `OpenRouterProvider`, `DryRunProvider`, `normalizeProviderResult`, and all core types — enables third-party custom providers without depending on internals
- **Docs:** Added `docs/custom-providers.md` with full programmatic usage guide and ProviderResult field reference

## v0.9.1 - Community & Cache Improvements

- **Community:** Added GitHub issue templates (bug report + feature request), PR template, and CODEOWNERS
- **Cache (fix):** Extraction cache now auto-evicts entries older than 7 days and enforces a 100-file maximum — prevents unbounded disk growth in `.ruleprobe/cache/`

## v0.9.0 - Extraction Quality & Security Hardening

- **Extractor (TD-05):** Removed better-auth-specific hardcoded strings (`better-auth/test`, `testwith`, `some under`, `most tests use`) from `repairRule()` in `hybrid.ts` — eliminates overfitting that incorrectly reclassified rules as informational for non-better-auth codebases
- **Security (TD-07):** `add-url` content is now sanitized before appending to instruction files: 100KB size limit, HTML detection and rejection, max 100 rules per pack, rule type validation
- **Deps (TD-10):** Verified dependency state is clean — `chokidar@5.0.0` correctly installed (4.0.3 is transitive only), `pnpm install --frozen-lockfile` completes without drift

## v0.8.0 - UX & Prompt Quality

- **UX (TD-08):** Mock provider reports now show a prominent `⚠ SIMULATED` notice in proof block, JSON report (`overview.simulated: true`), and markdown report — prevents users from mistaking mock results for real agent evaluations
- **Fix (TD-04):** Gemini provider prompt separator now uses real newlines instead of literal `\n` character sequences — improves prompt formatting and model response quality

## v0.7.1 - Security & CI Fixes

- **Security (TD-06):** Gemini API key moved from URL query string to `x-goog-api-key` request header — prevents key exposure in server logs and proxies
- **CI fix:** GitHub Action step summary now correctly reads score and result counts from `report.json` (`overview.overallScore` path)
- **Docs:** README CI examples updated to reference `@v0.7.1`

## v0.7.0 - Coverage, PR Comments & Evaluator Hardening

v0.7.0 delivers three targeted quality improvements.

- **Rule coverage% in reports** (`coverage.evaluated / coverage.total / coverage.skipped / coverage.pct`): Every JSON report now includes a `coverage` block. The Markdown proof block and shields.io badge message show coverage alongside the compliance score. Helps distinguish "high score because all rules ran" from "high score because most were skipped."
- **PR comment workflow** (`comment: 'true'` in GitHub Action): The `canblmz1/ruleProb` Action now accepts a `comment` input. When enabled on a `pull_request` event, it posts the compliance summary as a PR comment — editing the previous one on re-runs (no spam). Requires `pull-requests: write` permission.
- **Enhanced step summary**: GitHub Actions step summary now shows a color-coded score badge (🟢 ≥90, 🟡 ≥70, 🔴 <70) before the full report.
- **Evaluator hardening** (TD-03): Replaced fragile string-sniffing SKIPPED detection (`rawOutput.includes('stub')`) with a typed `kind: 'dry-run' | 'real'` field on `ProviderResult`. Real providers with "stub" in their output are no longer misclassified as SKIPPED.

## v0.6.0 - FAZ 4: Ecosystem & Network Effects

v0.6.0 delivers four FAZ 4 ecosystem features.

- **Community packs** (`packs --search <tag>`, `add-url <https://...>`): Filter built-in packs by tag/keyword. Load a community rule pack from any HTTPS URL — supports JSON (RulePack schema) or plain-text `- ...` lines. Security: https:// only.
- **OSS Leaderboard** (`ruleprobe leaderboard`): Scores all corpus fixture files with the deterministic extractor and shows extraction quality as a ranked table. Outputs `docs/leaderboard.md`. `--json` flag for CI pipelines.
- **Shields.io badge endpoint** (`.ruleprobe/badge.json`): Auto-generated on every `run` and `badge` command. Standard [shields.io endpoint](https://shields.io/endpoint) format — host it publicly and use `https://img.shields.io/endpoint?url=...` for a live dynamic README badge.
- **Slack & Teams notifications** (`.github/workflows/ruleprobe-notify.example.yml`): Copy-paste GitHub Actions workflow that sends a rich Slack or Teams message when compliance drops below threshold. Weekly cron option included.

## v0.5.0 - FAZ 3: GitHub Action, Pre-commit Hooks, VS Code Integration, Comparison Reports

v0.5.0 delivers four major FAZ 3 improvements.

- **GitHub Action** (`action.yml`): Official composite action for the GitHub Actions Marketplace. `uses: canblmz1/ruleProb@v0.5.0` — inputs: `dir`, `provider`, `extractor`, `fail-below`, `model`, `version`, `args`. Outputs: `score`, `passed`, `failed`, `skipped`, `report-path`. Writes to GitHub Step Summary automatically.
- **Pre-commit hook examples** (`examples/hooks/`): Drop-in Husky (`husky-pre-commit.sh`) and lefthook (`lefthook.yml`) configs that run RuleProbe on every commit.
- **VS Code integration** (`.vscode/tasks.json`, `.vscode/extensions.json`): Built-in tasks (Run, SARIF, List Rules, Demo) + SARIF Viewer extension recommendation. SARIF report at `.ruleprobe/report.sarif` shows inline squiggles in your instruction files.
- **Multi-provider HTML comparison** (`--providers a,b,c`): `compare` command now writes both `.md` and `.html` reports. HTML includes colored status chips, score bars, and category leaders section showing which provider leads on each rule category.
- **Extraction quality** (`list-rules --explain`): `--explain` flag shows assertions, source file+line, and severity per rule. New code pattern detections: `console.log` forbidden, `process.exit` forbidden, `import type` required, `node:` protocol required.

## v0.4.0 - Demo Mode & New Examples

v0.4.0 ships the `--demo` flag, two new example projects, and an animated terminal demo.

- **`--demo` flag**: `ruleprobe run <dir> --demo` forces the mock provider with a realistic PASS/FAIL mix (~30% failures) and shows a DEMO MODE banner. No API key needed. Ideal for first-time users and README demos.
- **`examples/cursor-only/`**: New example project using only `.cursor/rules/main.mdc` (8 testable rules). Shows RuleProbe working with Cursor rule files with no CLAUDE.md.
- **`examples/agents-md/`**: New example project using only `AGENTS.md` (10 testable rules). For OpenAI Codex / GitHub Copilot Workspace users.
- **Animated SVG demo**: `docs/demo.svg` — regenerate any time with `node scripts/make-demo-cast.mjs` (requires `pnpm build`).
- **`scripts/make-demo-cast.mjs`**: Script that runs real CLI commands and produces `docs/demo.cast` + `docs/demo.svg` via svg-term-cli.

## v0.3.1 - Workflow Improvements

v0.3.1 ships targeted improvements to coverage visibility, skipped-result guidance, CI integration, and the developer workflow:

- **Rule Coverage Summary**: `ruleprobe run` now prints `Rule coverage: N/M evaluated (X%) Skipped: K` after the score, and the markdown report includes a `## Rule Coverage` section
- **Actionable Skipped Guidance**: When `code_pattern_*` rules are SKIPPED because no file contents are available, the CLI, report, and assertion evidence now suggest re-running with `--provider claude-code` or `--provider openrouter`
- **GitHub Step Summary**: The example CI workflow (`ruleprobe-compliance.example.yml`) now writes the markdown report to `$GITHUB_STEP_SUMMARY` so results appear inline in the Actions job view
- **`ruleprobe init --from-claude`**: New flag that auto-detects existing instruction files (CLAUDE.md, AGENTS.md, .cursor/rules, etc.) in the target directory and populates `instructionFiles` with the paths that actually exist
- **`ruleprobe list-rules --show-scenarios`**: New flag that prints a preview of each rule's generated test scenario title and prompt before running a full evaluation
- **Dependency hygiene**: `chart.js` moved to `optionalDependencies`; esbuild CVE (GHSA-67mh-4wv8-2f99) resolved via pnpm override; vitest upgraded to v2.1.9

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
