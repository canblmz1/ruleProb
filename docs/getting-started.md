# Getting Started with RuleProbe

RuleProbe tests whether AI coding agents (Claude, Cursor, Copilot, Gemini CLI…) actually follow the rules you wrote in your `CLAUDE.md`, `AGENTS.md`, or `.cursor/rules/` files. It extracts your rules, generates sandbox scenarios, runs a provider, and scores the results.

---

## 1. Install

```bash
npm install -g ruleprobe
# or
pnpm add -g ruleprobe
```

Verify:
```bash
ruleprobe doctor
```

---

## 2. Initialize in your repo

```bash
cd your-project
ruleprobe init
```

This creates `ruleprobe.config.json`:

```json
{
  "provider": "mock",
  "instructionFiles": ["CLAUDE.md", "AGENTS.md", ".cursor/rules/*.mdc", ".github/copilot-instructions.md"],
  "reportDir": ".ruleprobe",
  "failBelow": 70
}
```

---

## 3. First run (no API key needed)

```bash
ruleprobe run . --provider mock
```

**What is mock?** The mock provider is a *simulation* — it does not call a real AI model. It deterministically passes ~80% of rules and randomly fails the rest. Use it to verify your setup and see what a report looks like before connecting a real provider.

The report is written to `.ruleprobe/report.md` and `.ruleprobe/report.html`.

```bash
ruleprobe report   # prints the path
```

---

## 4. See what rules were extracted

```bash
ruleprobe list-rules .
```

This shows every rule RuleProbe found in your instruction files, its category, severity, and whether it's testable.

**If you see 0 rules:** your instruction file may not use the bullet-point format RuleProbe expects. See [docs/rule-writing-guide.md](./rule-writing-guide.md).

---

## 5. Connect a real provider

### Gemini (free tier available)

```bash
export GEMINI_API_KEY=your_key_here
ruleprobe run . --provider gemini
```

### OpenRouter (paid, many models)

```bash
export OPENROUTER_API_KEY=your_key_here
ruleprobe run . --provider openrouter
```

### Claude Code (local, requires claude CLI)

```bash
ruleprobe run . --provider claude-code
```

---

## 6. Understand the score

| Score | Meaning |
|-------|---------|
| 90–100 | Your rules are being followed well |
| 70–89 | Good, but some rules are being missed |
| 50–69 | Several rules failing — worth investigating |
| < 50 | Rules are not being followed consistently |

- `PASS` — the provider followed this rule
- `PARTIAL` — partially followed
- `FAIL` — rule was violated
- `SKIPPED` — the provider returned no inspectable data for this rule (e.g., dry-run mode)

Use `--fail-below 70` in CI to fail the build if the score drops below a threshold.

---

## 7. Watch mode (during development)

```bash
ruleprobe run . --provider mock --watch
```

RuleProbe will re-run automatically whenever you save an instruction file. Changes are debounced (500ms by default). Use `--watch-delay 1000` to increase the debounce.

---

## 8. CI integration

See [docs/github-actions.md](./github-actions.md) for a ready-to-use GitHub Actions workflow.

```bash
# Fail CI if score drops below 70
ruleprobe run . --provider mock --fail-below 70

# Fail CI if score drops more than 10 points vs last run
ruleprobe run . --provider mock --regression-threshold 10
```

---

## 9. Track history

```bash
ruleprobe history               # show last 10 runs
ruleprobe history --provider gemini --branch main   # filter by provider + branch
ruleprobe history clear         # reset history
```

---

## Next steps

- [Rule Writing Guide](./rule-writing-guide.md) — how to write rules that RuleProbe can test
- [GitHub Actions](./github-actions.md) — CI integration
- [Provider Capabilities](./provider-capabilities.md) — which providers support which features
