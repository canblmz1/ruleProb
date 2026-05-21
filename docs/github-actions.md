# GitHub Actions Integration

## Quickstart — Official Action (Recommended)

Use the official `canblmz1/ruleProb` action directly from the marketplace:

```yaml
name: RuleProbe Compliance

on:
  pull_request:
  push:
    branches: [main]

jobs:
  ruleprobe:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      # Zero-config: mock provider, deterministic extraction, never fails
      - uses: canblmz1/ruleProb@v0.4.0
        with:
          dir: .
          provider: mock
          fail-below: '0'
```

### With a real provider and compliance gate

```yaml
      - uses: canblmz1/ruleProb@v0.4.0
        with:
          provider: gemini
          extractor: hybrid
          fail-below: '70'
        env:
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
```

### Inputs

| Input | Default | Description |
|---|---|---|
| `dir` | `.` | Directory with instruction files |
| `provider` | `mock` | `mock`, `dry-run`, `gemini`, `openrouter`, `claude-code` |
| `extractor` | `deterministic` | `deterministic`, `ai-assisted`, `hybrid` |
| `fail-below` | `0` | Fail if score drops below this value (0-100) |
| `model` | _(provider default)_ | Model name for providers that support it |
| `version` | `latest` | `ruleprobe-ai` npm version to pin |
| `args` | _(empty)_ | Extra CLI flags (e.g. `--no-cache --debug-extractor`) |

### Outputs

| Output | Description |
|---|---|
| `score` | Compliance score (0-100) |
| `passed` | Number of rules that passed |
| `failed` | Number of rules that failed |
| `skipped` | Number of rules that were skipped |
| `report-path` | Path to the JSON report (`.ruleprobe/report.json`) |

```yaml
      - uses: canblmz1/ruleProb@v0.4.0
        id: ruleprobe
        with:
          provider: mock
      - name: Print score
        run: echo "Score ${{ steps.ruleprobe.outputs.score }}"
```

---

## Manual CLI step (alternative)

RuleProbe can also run as a normal CLI step without the action:

```yaml
name: RuleProbe Compliance

on:
  pull_request:
  push:
    branches: [main]

jobs:
  ruleprobe:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - name: Compare deterministic and hybrid extraction
        run: pnpm dev compare . --provider openrouter
        env:
          OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
        continue-on-error: true
      - name: RuleProbe compliance
        run: pnpm dev run . --provider mock --extractor deterministic --fail-below 70
      - name: RuleProbe baseline check
        run: pnpm dev run . --provider mock --extractor deterministic --baseline --fail-on-regression
      - name: Post RuleProbe PR comment
        if: github.event_name == 'pull_request'
        run: gh pr comment ${{ github.event.pull_request.number }} --body-file .ruleprobe/report.pr-comment.md
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      - name: Upload RuleProbe reports
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: ruleprobe-report
          path: .ruleprobe/
```

Exit behavior:

- `ruleprobe run ... --fail-below 70` exits non-zero when the overall score is below 70.
- `mock` is deterministic and suitable for wiring the compliance gate.
- `dry-run` is useful for checking extraction and report generation only; use `--fail-below 0`.
- Real providers can fail because of missing keys, quota, rate limits, malformed structured output, or local CLI availability. Gate on them only when your team accepts that operational dependency.
- Reports include a Known Limitations section so CI artifacts show whether the run used simulation, dry-run, fallback extraction, or failed providers.


- `ruleprobe run ... --fail-below 70` exits non-zero when the overall score is below 70.
- `mock` is deterministic and suitable for wiring the compliance gate.
- `dry-run` is useful for checking extraction and report generation only; use `--fail-below 0`.
- Real providers can fail because of missing keys, quota, rate limits, malformed structured output, or local CLI availability. Gate on them only when your team accepts that operational dependency.
- Reports include a Known Limitations section so CI artifacts show whether the run used simulation, dry-run, fallback extraction, or failed providers.
