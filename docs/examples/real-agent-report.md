# Real Agent Report (Reproducible Example)

> Status: **template + reproduce-recipe** — committed so the README's proof-first
> claim is verifiable. The exact numbers in this file should be regenerated
> against a live provider before publishing a run as "official". The honest
> caveats around mock vs. real providers also apply here.

## What this file shows

A representative RuleProbe run on a real OSS instruction file (`benchmarks/fixtures/better-auth.CLAUDE.md`)
using the `mock` provider with mixed PASS/FAIL behavior. The mock is a
**deterministic simulation**, not real model behavior — the layout below is
what a real-provider report looks like, and the reproduce recipe at the bottom
shows how to swap mock for Gemini, OpenRouter, or OpenCode Go.

## Reproduce locally

```bash
# 1. Reproduce against the mock provider (no API key required)
pnpm install
pnpm build
pnpm dev list-rules benchmarks/fixtures/better-auth.CLAUDE.md --extractor hybrid
pnpm dev run benchmarks/fixtures/better-auth.CLAUDE.md --provider mock --fail-below 70

# 2. Or against Gemini (requires GEMINI_API_KEY in your environment / .env)
GEMINI_API_KEY=... pnpm dev run benchmarks/fixtures/better-auth.CLAUDE.md \
  --provider gemini --extractor hybrid --fail-below 0 --debug-extractor

# 3. Or against OpenCode Go (requires OPENCODE_GO_API_KEY + OPENCODE_GO_MODEL)
OPENCODE_GO_API_KEY=... OPENCODE_GO_MODEL=opencode-go/kimi-k2.6 \
  pnpm dev run benchmarks/fixtures/better-auth.CLAUDE.md \
  --provider opencode-go --extractor hybrid --fail-below 0
```

After any of those runs, the actual proof artifacts will be written to:

- `.ruleprobe/report.md`
- `.ruleprobe/report.html`
- `.ruleprobe/report.json`

## Sample shape (mock provider, deterministic)

The mock provider deliberately produces a mixed PASS/FAIL distribution
(~80% compliant, ~10% non-compliant, ~10% no-op) so the resulting report
is not a "100/100 demo".

```text
RuleProbe Compliance Report
Provider: mock  Extractor: deterministic
Score: 80/100  (severity-weighted: 80/100)
Rules tested: 10  PASS=8  PARTIAL=0  FAIL=1  SKIPPED=1
Instruction files: better-auth.CLAUDE.md
Top issues:
- [FAIL] (high/forbidden_command) Forbidden command boundary: pnpm test
- [SKIPPED] (medium/code_pattern_forbidden) Forbidden code pattern: any
Known limitations:
- The mock provider is deterministic simulation; it is useful for CI plumbing but is not proof of real model behavior.
- Results are based on generated sandbox scenarios, not a replay of the full repository workflow.
- Some rule categories are heuristic and approximate; subjective instructions may be omitted or marked informational.
Report: .ruleprobe/report.md
```

## How to read this honestly

- The proof block above is intentionally **mixed**, not perfect. A real
  provider will look similar but with provider-specific failure modes
  (rate limits, malformed JSON, fallbacks). RuleProbe always names those
  in the Known Limitations section.
- `SKIPPED` for a `code_pattern_*` rule means RuleProbe could not see any
  changed file content for that scenario. RuleProbe deliberately refuses
  to call this PASS, because provider prose alone is not evidence.
- Severity-weighted score gives `high`-severity failures 3x the impact of
  `low`-severity ones (`high=3, medium=2, low=1`).

## Known limitations of this artifact

- This file is a checked-in **example**. Regenerate it for any official
  release proof.
- If a real provider was used, that provider's quota / availability / model
  behavior at run time is part of the result and cannot be reproduced
  bit-for-bit later.
