# GitHub Actions Integration

RuleProbe can run as a normal CLI step in CI. The recommended baseline is deterministic extraction plus `mock` runtime checks, because it has stable exit behavior and does not require provider credentials.

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
