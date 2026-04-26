# CLAUDE.md

## 1. Project Overview
RuleProbe is a CLI tool for extracting, testing, and validating repository rules from instruction files (CLAUDE.md, AGENTS.md, .cursor/rules, Copilot, etc). It generates testable rules, creates sandbox scenarios, runs multiple providers (mock, dry-run, openrouter, gemini, claude-code), and evaluates agent behavior against repo rules. It is not a generic LLM playground, not a code linter, and not a greenfield project. Current maturity: stable core, but AI-assisted extraction and hybrid flows are brittle.

## 2. Architecture Summary
- CLI entry: src/cli/index.ts
- Discovery: src/config/load.ts
- Extraction: src/rules/extract.ts (deterministic), src/extractors/aiAssisted.ts (AI/hybrid)
- Scenario generation: src/scenarios/generate.ts
- Providers: src/providers/* (mock, dry-run, openrouter, gemini, claude-code)
- Evaluation: src/evaluator/score.ts
- Reporting: src/reporters/* (json, markdown, html)
- Benchmarks/tests: benchmarks/, tests/

## 3. Core Files to Inspect First
1. src/rules/extract.ts
2. src/extractors/aiAssisted.ts
3. src/scenarios/generate.ts
4. src/evaluator/score.ts
5. src/providers/normalize.ts
6. src/types/index.ts
7. tests/benchmark.test.ts

## 4. Working Rules for Claude Opus 4.7
- Read CLAUDE.md first
- Do not ask questions
- Do not redesign the whole project
- Do not add large new features
- Do not rewrite architecture unnecessarily
- Preserve existing passing behavior
- Prioritize real blockers only
- Verify commands before claiming success

## 5. Known Good Behavior
- Deterministic extraction is robust for most rule types
- Multi-rule split logic works for lines like "NEVER run `pnpm test`. Use `vitest ...`"
- Deduplication for command rules is based on normalized semantics
- required_file_change is evaluated (test file detection)
- Scenario generation is category-correct
- Runtime reporting is human-readable
- Informational/conventional commit rules are excluded from runtime scenarios

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
- All verification commands pass
- No duplicate or misclassified rules in better-auth
- No runtime scenarios for informational/conventional commit lines
- Human-readable reporting
- No evaluator crashes on undefined arrays
- required_file_change is evaluated
- Gemini/hybrid extraction does not crash, falls back cleanly

## 10. Non-Goals
- Do not add new providers
- Do not refactor for style
- Do not add new rule categories
- Do not rewrite tests unless required for blockers
- Do not change passing behavior
