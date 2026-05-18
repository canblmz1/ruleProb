# RuleProbe

> **AI coding rules are documentation until you test them.**

[![Node >=18](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org) [![MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE) [![npm](https://img.shields.io/npm/v/ruleprobe)](https://www.npmjs.com/package/ruleprobe)

RuleProbe is a CLI that turns AI instruction files (`CLAUDE.md`, `AGENTS.md`, `.cursor/rules`, Copilot instructions) into executable compliance tests. It extracts rules, generates disposable sandbox scenarios, runs an AI provider against each one, and produces a scored JSON/Markdown/HTML report.

---

## What it tests

| Signal | How |
|---|---|
| Package manager compliance | Detects `npm`/`yarn` when `pnpm` is required, etc. |
| Forbidden commands | Checks that blocked commands (`git commit`, `pnpm test`) are not invoked |
| Required commands | Verifies that required validation steps run before the final response |
| Protected file changes | Catches writes to `src/generated/**`, `package.json`, etc. |
| Forbidden/required code patterns | Inspects changed file content for `any`, `class`, `Uint8Array`, etc. |
| Final-answer phrasing | Checks that response text contains/excludes required phrases |

**Does not measure:** full multi-turn workflow replay, subjective code quality, or "is this a good rule".

---

## Quick start

```bash
npm install -g ruleprobe
# or: pnpm add -g ruleprobe

# Run mock demo — no API key needed
ruleprobe run examples/basic --provider mock

# Real provider (Gemini)
GEMINI_API_KEY=... ruleprobe run . --provider gemini --extractor hybrid --fail-below 70
```

From source:

```bash
git clone https://github.com/canblmz1/ruleProb
cd ruleProb
pnpm install && pnpm build
pnpm dev run examples/basic --provider mock
```

---

## Commands

| Command | Description |
|---|---|
| `ruleprobe run [dir]` | Run all compliance tests and write reports |
| `ruleprobe list-rules [dir]` | Preview extracted rules (no sandbox); use `--show-scenarios` to preview generated test scenarios |
| `ruleprobe analyze [dir]` | AI extraction only — emit JSON candidates, no evaluation |
| `ruleprobe compare [dir]` | Deterministic vs hybrid extraction diff, or branch vs base ref |
| `ruleprobe doctor` | Local diagnostics: Node, pnpm, git, claude, dist, env keys |
| `ruleprobe providers` | Show provider capability matrix |
| `ruleprobe clear-cache` | Wipe AI extraction cache at `.ruleprobe/cache/` |
| `ruleprobe init [dir]` | Write a starter `ruleprobe.config.json`; use `--from-claude` to auto-detect instruction files |
| `ruleprobe report` | Show latest report path |
| `ruleprobe badge` | Generate score and trend SVG badges |

### Common flags

```
--provider <name>           mock | dry-run | openrouter | gemini | claude-code | opencode-go
--providers <list>          Comma-separated providers for side-by-side comparison
--extractor <type>          deterministic | ai-assisted | hybrid
--model <model>             Override model for the extraction provider
--fail-below <score>        Exit 1 if score < N (default: off)
--debug-extractor           Print per-file extraction diagnostics
--no-cache                  Disable AI extraction cache for this run
--provider-timeout-ms <ms>  Override the default provider timeout
--keep-sandbox              Do not delete sandbox after run
--watch                     Watch instruction files and re-run on changes
--badge                     Generate SVG score and trend badges after run
```

---

## Report output

Every run writes `.ruleprobe/report.{json,md,html}`. The Markdown report opens with a shareable proof block:

```text
RuleProbe Compliance Report
Provider: gemini  Extractor: hybrid
Score: 85/100  (severity-weighted: 78/100)
Rules tested: 12  PASS=9  PARTIAL=1  FAIL=2  SKIPPED=0
Instruction files: CLAUDE.md, AGENTS.md
Top issues:
- [FAIL] (high/forbidden_command) Forbidden command boundary: git commit
- [FAIL] (medium/required_command) Required validation command: pnpm typecheck
Known limitations:
- Results are based on generated sandbox scenarios, not a replay of the full repository workflow.
Report: .ruleprobe/report.md
```

The severity-weighted score uses `high=3 / medium=2 / low=1`.

### Interactive HTML dashboard

The HTML report is now a fully interactive dashboard powered by Chart.js:

- **Doughnut chart** — overall pass/partial/fail/skipped distribution
- **Stacked bar chart** — results broken down by category
- **Search & filter** — filter results by keyword, status, or severity
- **Expand/collapse all** — quickly navigate large result sets
- **Score trend line** — when history is available, shows score evolution over time

Open `.ruleprobe/report.html` in your browser after any run.

---

## Providers

```bash
ruleprobe providers
```

| Provider | Extraction | Runtime | Notes |
|---|---|---|---|
| `mock` | — | Simulated (mixed PASS/FAIL/SKIPPED) | CI smoke; not real model behavior |
| `dry-run` | — | None | Inspects flow only |
| `openrouter` | Yes | Sandboxed action bridge | Quality depends on model and quota |
| `gemini` | Yes | Sandboxed action bridge | JSON-mode extraction + runtime |
| `opencode-go` | Yes | Experimental action bridge | Requires `OPENCODE_GO_API_KEY` + `OPENCODE_GO_MODEL` |
| `claude-code` | — | Real local CLI | Inferred from transcript; not comparable with action-bridge providers |

Full capability matrix: [docs/provider-capabilities.md](docs/provider-capabilities.md)

### Environment variables

Copy `.env.example` and fill in the keys you need:

```bash
cp .env.example .env
```

```ini
OPENROUTER_API_KEY=
OPENROUTER_MODEL=openrouter/free

GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash

OPENCODE_GO_API_KEY=
OPENCODE_GO_MODEL=opencode-go/kimi-k2.6
OPENCODE_GO_AUTH_HEADER_MODE=bearer   # or x-api-key
```

---

## Extraction modes

**`deterministic`** — regex/heuristic extraction from instruction text. Fast, no API key needed, works well for common patterns.

**`ai-assisted`** — sends instruction files to the configured provider and asks it to classify rules as structured JSON. Requires an API-capable provider (gemini, openrouter, opencode-go).

**`hybrid`** — runs both and merges, deduplicating by normalized signature. Recommended when you have an API key.

AI extraction results are hash-keyed and cached at `.ruleprobe/cache/`. Use `--no-cache` or `ruleprobe clear-cache` to bust it.

---

## Comparing extraction modes / branches

```bash
# Deterministic vs hybrid for the same file
ruleprobe compare . --provider gemini

# Branch vs base ref (useful in CI to detect rule regressions)
ruleprobe compare . --base origin/main --extractor hybrid
```

---

## Multi-provider comparison

Compare how different AI providers perform against the same rule set in a single run:

```bash
ruleprobe run . --providers mock,gemini --report-dir .ruleprobe-compare
```

This generates a side-by-side Markdown comparison report (e.g., `.ruleprobe-compare/comparison-{id}.md`) showing which scenarios each provider passes or fails.

---

## Watch mode

Automatically re-run tests when instruction files change:

```bash
ruleprobe run . --provider gemini --watch
```

RuleProbe watches the directories containing your `instructionFiles` and triggers a full re-run on any change.

---

## Score history & trends

RuleProbe automatically tracks scores across runs in `.ruleprobe/history.json`. The HTML report renders a trend line chart when history exists, and the CLI prints a summary of best, worst, and average scores.

History entries include:
- timestamp, score, weighted score
- provider and extractor used
- git branch and commit (when available)

---

## Badge generation

Generate SVG badges for your README or CI dashboards:

```bash
# Auto-generate after a run
ruleprobe run . --provider gemini --badge

# Or generate manually
ruleprobe badge --score 85 --weighted-score 78
```

Outputs:
- `.ruleprobe/badge-score.svg` — current score badge
- `.ruleprobe/badge-trend.svg` — trend direction badge (up/down/stable)

Use them in your README:

```markdown
![RuleProbe Score](.ruleprobe/badge-score.svg)
```

---

## CI integration

Copy the example GitHub Actions workflow:

```bash
cp .github/workflows/ruleprobe-compliance.example.yml \
   .github/workflows/ruleprobe-compliance.yml
```

The workflow automatically publishes the compliance report to the GitHub Actions **Step Summary**, so results appear inline in the job view without opening an artifact.

Full walkthrough: [docs/github-actions.md](docs/github-actions.md)

---

## Configuration

`ruleprobe.config.json` (auto-generated by `ruleprobe init`):

```json
{
  "provider": "mock",
  "extractor": "deterministic",
  "instructionFiles": [
    "CLAUDE.md",
    "AGENTS.md",
    ".cursor/rules/*.mdc",
    ".github/copilot-instructions.md"
  ],
  "reportDir": ".ruleprobe",
  "failBelow": 70,
  "keepSandbox": false
}
```

---

## Safety model

RuleProbe creates disposable sandboxes and blocks:

- Path traversal and absolute-path writes
- Writes to `.git`, `.ruleprobe`, `node_modules`
- Destructive shell commands (`rm`, `git reset`, `git push`, package publishes)
- Long-running commands via action timeouts

**API key and data privacy:** When using real providers (gemini, openrouter, opencode-go), your instruction file contents are sent to the provider API for extraction and/or scenario evaluation. Do not include secrets, personal data, or proprietary information in your instruction files when using third-party providers.

**Recommended: add `.ruleprobe/` to your `.gitignore`** to avoid committing reports, cache, badges, and history files that may contain sensitive rule details:

```
echo '.ruleprobe/' >> .gitignore
```

Use real providers only with repositories and credentials you are comfortable testing.

---

## Troubleshooting

**API key not found:** Ensure you copied `.env.example` to `.env` and filled in the required keys. Run `ruleprobe doctor` to verify key presence.

**Provider returns no rules:** Try `--extractor deterministic` first to verify extraction works, then add `--debug-extractor` for verbose output.

**Typecheck fails after install:** Ensure you are using `pnpm` (not `npm` or `yarn`). Run `pnpm install --frozen-lockfile`.

**Windows path issues:** RuleProbe normalizes paths internally. If you see path separator issues in sandbox output, report them with the full error message and your OS/Node version.

**Score below threshold / exit code 1:** Use `--fail-below 0` to disable the threshold check while debugging.

---

## Development

```bash
pnpm install
pnpm build        # tsup ESM + DTS
pnpm test         # vitest (53 tests)
pnpm typecheck    # tsc --noEmit
pnpm dev doctor   # local diagnostics

# Benchmark extraction corpus
pnpm dev benchmark --fixtures-only
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines and [ROADMAP.md](ROADMAP.md) for planned work.

---

## License

MIT — see [LICENSE](LICENSE)
