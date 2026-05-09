# Rule Writing Guide

RuleProbe extracts testable rules from your instruction files using a deterministic parser. This guide explains what makes a rule testable and how to write rules that RuleProbe can evaluate.

---

## How extraction works

RuleProbe reads bullet-point lines (lines starting with `-`, `*`, or `1.`) and looks for action keywords:

```
ALWAYS, NEVER, MUST, MUST NOT, DO NOT, DON'T, Avoid, Use, Ensure, Prefer,
Required, Forbidden, never run, do not run, must include, typecheck passes
```

Lines without these keywords, or lines that look like informational notes, are skipped.

---

## Rule categories and examples

### Package manager

```markdown
- ALWAYS use pnpm. Never use npm or yarn.
- Use pnpm for all package operations.
```

### Forbidden command

```markdown
- NEVER run `git commit` directly.
- Do not run `pnpm publish`.
- Never commit without running the full test suite first.
```

### Required command

```markdown
- ALWAYS run `pnpm typecheck` before committing.
- Ensure `pnpm test` passes before marking a task complete.
- Use `vitest run` instead of `pnpm test`.
```

### Forbidden code pattern

```markdown
- NEVER use `any` in TypeScript.
- Do not use `class` — use plain objects and functions instead.
- Avoid `require(` — use ES module imports.
```

### Required code pattern

```markdown
- ALWAYS use `unknown` instead of `any` for external data.
- Use `Uint8Array` instead of `Buffer`.
```

### Required file change

```markdown
- ALWAYS update tests when changing source files.
- Must include a docs/ update for any new public API.
```

### Forbidden file change

```markdown
- Do not modify `package.json` directly.
- Never edit files in `src/generated/`.
```

---

## Rules RuleProbe cannot test (and why)

These rule types are intentionally skipped — they're hard or impossible to evaluate deterministically:

| Type | Example | Why skipped |
|------|---------|-------------|
| Commit message format | `Use conventional commits: feat(x): ...` | Requires real git history |
| Informational notes | `Note: most tests use vitest` | No actionable assertion |
| Style preferences | `Prefer smaller functions` | Subjective, no clear pass/fail |

To check if a rule is being extracted, run:

```bash
ruleprobe list-rules .
```

---

## Tips for writing testable rules

**Be specific about commands:**
```markdown
# Vague (hard to test)
- Always validate your code.

# Testable
- ALWAYS run `pnpm typecheck` before submitting.
```

**Use backticks for commands and patterns:**
```markdown
- NEVER use `any` in TypeScript files.
- Use `pnpm test` to run the test suite.
```

**Use strong keywords:**
```markdown
# Weak (might be skipped)
- It's good to run tests.

# Strong (will be extracted)
- ALWAYS run tests before marking a task complete.
```

**Avoid mixing informational context with rules:**
```markdown
# Bad — mixes a rule with an example (both may get skipped or misclassified)
- NEVER commit. Example: git commit -m "feat: something"

# Good — separate the rule and the example
- NEVER run `git commit` directly.
- Commit messages follow the format: feat(scope): description
```

**One rule per bullet where possible:**
```markdown
# Hard to parse
- ALWAYS use pnpm and never use npm and always run typecheck.

# Easy to parse
- ALWAYS use pnpm.
- NEVER use npm or yarn.
- ALWAYS run `pnpm typecheck` before finishing.
```

---

## Multi-sentence rules

RuleProbe splits multi-sentence bullets into parts. This line:

```markdown
- NEVER run `pnpm test`. Use `vitest run --reporter=verbose` instead.
```

…produces two rules: a `forbidden_command` for `pnpm test` and a `required_command` for `vitest`.

---

## Checking extraction

```bash
# See all extracted rules
ruleprobe list-rules .

# Debug extraction in detail
ruleprobe list-rules . --debug-extractor

# Use AI-assisted extraction (may find more rules)
ruleprobe list-rules . --extractor hybrid --provider gemini
```

---

## Rule severity

Rules are classified as `high`, `medium`, or `low` severity based on keyword strength:

| Severity | Keywords |
|----------|----------|
| High | `NEVER`, `MUST NOT`, `ALWAYS`, `forbidden`, `required` |
| Medium | `Avoid`, `Prefer`, `Ensure`, `Use` |
| Low | `informational`, soft recommendations |

High-severity rules have 3× weight in the final score.
