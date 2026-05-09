# AGENTS.md — RuleProbe

## Project

RuleProbe is a CLI that extracts rules from AI instruction files (CLAUDE.md, AGENTS.md, .cursor/rules, etc.), generates sandbox scenarios, runs AI providers against them, and scores compliance. It is **not** a generic LLM playground, linter, or greenfield project.

**Maturity**: stable core; AI-assisted and hybrid extraction are brittle.

## Commands

```bash
pnpm install          # always pnpm, never npm/yarn
pnpm build            # tsup — ESM + DTS, two entry points
pnpm typecheck        # tsc --noEmit
pnpm test             # vitest run (15s timeout, globals enabled)

pnpm dev <cmd>        # tsx src/cli/index.ts <cmd>
pnpm dev benchmark --fixtures-only
pnpm dev run examples/basic --provider mock
pnpm dev list-rules examples/basic
pnpm dev doctor       # local diagnostics
pnpm dev compare . --provider mock   # deterministic vs hybrid diff
```

**CI order**: install -> build -> typecheck -> test -> benchmark -> smoke tests.

## Architecture

| Layer | Path |
|---|---|
| CLI entry | `src/cli/index.ts` |
| Config loading | `src/config/load.ts` |
| Deterministic extraction | `src/rules/extract.ts` |
| AI/hybrid extraction | `src/extractors/aiAssisted.ts` |
| Scenario generation | `src/scenarios/generate.ts` |
| Providers | `src/providers/*` |
| Evaluation | `src/evaluator/score.ts` |
| Reporting | `src/reporters/*` (json, md, html) |
| Types | `src/types/index.ts` |

Two tsup entry points: `src/cli/index.ts` -> `dist/cli/index.js` (CLI bin), `src/index.ts` -> `dist/index.js` (library export).

## Providers

| Provider | Extraction | Runtime | Needs key? |
|---|---|---|---|
| `mock` | no | simulated | no |
| `dry-run` | no | none | no |
| `gemini` | yes | sandbox bridge | yes (GEMINI_API_KEY) |
| `openrouter` | yes | sandbox bridge | yes (OPENROUTER_API_KEY) |
| `opencode-go` | yes | experimental bridge | yes (OPENCODE_GO_API_KEY) |
| `claude-code` | no | real local CLI | yes (local install) |

API keys: copy `.env.example` to `.env` and fill in. Mock and dry-run work without keys.

## Extraction modes

- **`deterministic`** — regex/heuristic, fast, no API key
- **`ai-assisted`** — sends files to provider for JSON classification
- **`hybrid`** — runs both, deduplicates by normalized signature (recommended with API key)

AI extraction is cached at `.ruleprobe/cache/`. Use `--no-cache` or `pnpm dev clear-cache` to bust.

## Runtime output

Every `run` writes `.ruleprobe/report.{json,md,html}`. This directory is gitignored.

## Known broken areas

- Gemini/OpenRouter JSON parse failures — fallback to deterministic, not hybrid
- Hybrid merge may not always combine AI/deterministic cleanly
- Benchmark/test drift if fixture content changes
- Evaluator can crash on undefined arrays (guard before access)

## Working rules

- Preserve deterministic extraction unless a test or fixture proves it wrong
- Do not weaken tests to make them pass
- Prefer fixture-backed fixes over broad refactors
- Keep changes small and verifiable
- Do not add new providers, rule categories, or refactor for style
- Treat provider/API failures as expected runtime conditions
- Verify commands before claiming success — run them

## Test quirks

- Benchmarks use fixtures under `benchmarks/`
- Run single test: `pnpm vitest run tests/<file> -t "pattern"`
- Do not modify fixture content unless intentional (it drives extraction expectations)
