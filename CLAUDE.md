# CLAUDE.md

## 1. Project Overview
RuleProbe is a CLI tool for extracting, testing, and validating repository rules from instruction files (CLAUDE.md, AGENTS.md, .cursor/rules, Copilot, etc). It generates testable rules, creates sandbox scenarios, runs multiple providers (mock, dry-run, openrouter, gemini, claude-code, anthropic, openai, ollama, local), and evaluates agent behavior against repo rules. Current version: **v2.12.0**. Core is stable; AI extraction and hybrid flows are still brittle.

## 2. Architecture Summary
- CLI entry: src/cli/index.ts
- Discovery: src/config/load.ts
- Extraction: src/rules/extract.ts (deterministic), src/extractors/aiAssisted.ts (AI/hybrid)
- Scenario generation: src/scenarios/generate.ts
- Providers: src/providers/* (mock, dry-run, openrouter, gemini, claude-code, anthropic, openai, ollama/local)
- Matrix command: src/cli/commands/matrix.ts + src/matrix/build.ts + src/reporters/matrix.ts
- Rule optimizer: src/optimize/* (detect.ts, rewrite.ts) + src/history/ruleHistory.ts
- Sandbox capture: src/actions/execute.ts captureMode + VirtualOp type
- Evaluation: src/evaluator/score.ts
- Reporting: src/reporters/* (json, markdown, html, sarif, junit, pr-comment)
- Advisor (v1.8.0+): src/advisor/* (repoScan, historyMiner, suggest)
- Live monitoring (v1.11.0+): src/live/* (watcher, eventBus)
- Integrations (v2.0.0+): src/integrations/* (express, next, serve)
- Benchmarks/tests: benchmarks/, tests/

## 3. Core Files to Inspect First
1. src/rules/extract.ts
2. src/extractors/aiAssisted.ts
3. src/scenarios/generate.ts
4. src/evaluator/score.ts
5. src/providers/normalize.ts
6. src/types/index.ts
7. tests/benchmark.test.ts

## 4. Working Rules
- Read CLAUDE.md first
- Do not ask questions
- Do not redesign the whole project
- Do not rewrite architecture unnecessarily
- Preserve existing passing behavior
- Verify commands before claiming success
- Each phase = own branch → `pnpm typecheck && pnpm test` green → merge main → tag vX.Y.Z → npm auto-publish

## 5. Known Good Behavior
- Deterministic extraction is robust for most rule types
- Multi-rule split logic works for lines like "NEVER run `pnpm test`. Use `vitest ...`"
- Deduplication for command rules is based on normalized semantics
- required_file_change is evaluated (test file detection)
- Scenario generation is category-correct
- Runtime reporting is human-readable
- Informational/conventional commit rules are excluded from runtime scenarios
- Fix suggestions (suggestion field) rendered in markdown for FAIL/PARTIAL results
- anthropic/openai/ollama providers: raw fetch, no extra npm deps
- Adaptive weights: override via .ruleprobe/weights.yaml; custom scenarios via .ruleprobe/scenarios.yaml

## 6. Known Broken / Risky Areas
- Gemini/OpenRouter AI extraction: JSON parse failures, fallback to deterministic
- Hybrid extraction: may not always merge AI/deterministic cleanly
- Some edge-case rules in fixtures may not extract as expected
- If Gemini fails, fallback is deterministic, not hybrid
- Benchmark/test drift is possible if fixture content changes

## 7. Better-Auth Target Behavior
Should extract:
- package_manager: ALWAYS use pnpm
- forbidden_command: NEVER run pnpm test
- required_command: Use vitest ...
- code_pattern_forbidden: any
- code_pattern_forbidden: class
- required_file_change: tests
- required_command: pnpm typecheck
- forbidden_command: git commit
Should NOT extract:
- informational lines as runtime rules
- conventional commit examples as runtime rules
- duplicate pnpm test rules
- code symbols as commands

## 8. Verification Commands
- pnpm build
- pnpm test
- pnpm dev benchmark --fixtures-only
- pnpm dev list-rules C:\dev\better-auth --extractor hybrid --provider gemini --debug-extractor
- pnpm dev run C:\dev\better-auth --provider gemini --extractor hybrid --fail-below 0 --debug-extractor

## 9. Acceptance Criteria
- All verification commands pass (currently 250 tests)
- No duplicate or misclassified rules in better-auth
- No runtime scenarios for informational/conventional commit lines
- Human-readable reporting
- No evaluator crashes on undefined arrays
- required_file_change is evaluated
- Gemini/hybrid extraction does not crash, falls back cleanly

## 10. Active Roadmap (Phases 14–21)

### Phase 14 — v1.8.0: Rule Advisor (Heuristic)
Branch: `feat/phase14-rule-advisor`
- New `ruleprobe advise [dir]` command
- `src/advisor/`: repoScan.ts (package.json / lockfile / file tree), historyMiner.ts (git log + history.json), suggest.ts (gap + conflict detection)
- Output: `.ruleprobe/suggestions.json` + `.ruleprobe/suggestions.md`
- No ML, no new deps — pure heuristics on existing data
- Suggestions are PROPOSALS only; never auto-write user instruction files
- Skills: senior-data-engineer, senior-architect, tdd

### Phase 15 — v1.9.0: Interactive init Wizard
Branch: `feat/phase15-init-wizard`
- `ruleprobe init --interactive`
- Reuses Phase 14 repoScan core
- Prompt-driven (pnpm? protect src/generated?) → writes config + seed rules
- New dep: `@clack/prompts` (lightweight)
- Skills: senior-fullstack, frontend-design, tdd

### Phase 16 — v1.10.0: Adaptive Weighting (Statistical)
Branch: `feat/phase16-adaptive-weights`
- Enrich history.json with per-rule pass/fail timeseries
- `src/weights/adaptive.ts` — frequency/exponential-decay bandit (NOT Q-learning yet)
- `--adaptive-weights` flag → `.ruleprobe/weights.adaptive.json`
- Extends Phase 9 weights.yaml system; adaptive overrides static when enabled
- Skills: senior-data-scientist, statistical-analyst, senior-architect

### Phase 17 — v1.11.0: Live Sandbox Monitoring (`--live`)
Branch: `feat/phase17-live-monitoring`
- `ruleprobe run --live`
- `src/live/`: watcher.ts (chokidar — already a dep), eventBus.ts
- TTY-aware live terminal streaming; `.ruleprobe/live-events.jsonl`
- WebSocket/web panel DEFERRED — terminal streaming only for now
- Skills: senior-backend, observability-designer, tdd

### Phase 18 — v2.0.0: Plugin Architecture & Framework Adapters (MAJOR)
Branch: `feat/phase18-plugin-arch`
- Formalize public plugin API (versioned, documented)
- `src/integrations/`: express.ts, next.ts route handlers
- `ruleprobe serve` — HTTP API: `POST /ruleprobe/run`, `GET /ruleprobe/rules`
- v2.0.0 — public API surface changes
- Skills: senior-architect, api-design-reviewer, senior-backend

### Phase 19 — v2.1.0: TUI (`ruleprobe gui`)
Branch: `feat/phase19-tui`
- Ink (React-for-CLI) interactive viewer: rules, scenarios, reports, advisor suggestions
- New deps: `ink`, `react`
- Skills: senior-frontend, frontend-design, ui-design-system

### Phase 20 — v2.2.0: Language Bindings (Python / Go)
Branch: `feat/phase20-lang-bindings`
- Thin HTTP clients built on Phase 18 server
- Python: `ruleprobe_client` (PyPI stub)
- Go client (optional)
- HTTP-first; gRPC deferred
- Skills: senior-backend, api-design-reviewer, api-test-suite-builder

### Phase 21 — v2.3.0: ML-Powered Rule Advisor (opt-in)
Branch: `feat/phase21-ml-advisor`
- Layer ML onto Phase 14 heuristics
- `transformers.js` / `onnxruntime-node` (all-MiniLM-L6-v2) — `optionalDependencies`
- Semantic rule/commit similarity + supervised classifier on labeled history
- Graceful degrade to Phase 14 heuristics if ML deps not installed
- `ruleprobe advise --ml`
- Skills: senior-ml-engineer, rag-architect, senior-data-scientist, ai-security

## 11. Non-Goals
- Do not refactor for style
- Do not rewrite tests unless required for blockers
- Do not change passing behavior
- Do not auto-write user instruction files (CLAUDE.md etc.) — advisor suggestions are proposals only
- Do not add ML dependencies for phases before Phase 21
- Do not add WebSocket / server runtime before Phase 18
