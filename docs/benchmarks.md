# Benchmark Corpus Governance

RuleProbe's benchmark corpus is an extraction regression suite and public example corpus for repository AI instruction files. It is not a claim of universal semantic extraction accuracy.

## What The Corpus Proves

- Deterministic extraction continues to recognize the concrete rule styles represented by the fixtures.
- Expected categories and must-contain assertions stay stable across releases.
- Public examples remain reproducible without cloning repositories or requiring provider credentials.

## What The Corpus Does Not Prove

- It does not prove every instruction in a real repository will be extracted.
- It does not prove real-provider runtime compliance.
- It does not rank providers unless a documented comparison command was actually run.
- It does not replace manual review for subjective or policy-heavy instructions.

## Fixture Conventions

- Put fixtures in `benchmarks/fixtures/`.
- Use names that identify the source or style, such as `better-auth.CLAUDE.md`, `restatedev.AGENTS.md`, or `copilot-workflow.instructions.md`.
- Keep fixtures small enough to review in a pull request.
- Prefer real instruction styles: headings, bullets, numbered lists, command rules, file ownership, code patterns, package-manager rules, final-answer rules, and commit/push restrictions.
- Remove private project details, secrets, internal URLs, and proprietary policy text.

## Corpus Metadata

Add each fixture to `benchmarks/corpus.json`:

```json
{
  "name": "repo-or-style-name",
  "url": "https://github.com/org/repo.git",
  "instructionFiles": ["CLAUDE.md"],
  "fixture": "benchmarks/fixtures/repo.CLAUDE.md",
  "expected": {
    "minRules": 2,
    "categories": ["required_command"],
    "mustContain": [
      { "category": "required_command", "commandIncludes": "pnpm test" }
    ]
  }
}
```

Use `url: "fixture-only"` for synthetic fixtures that represent a common style rather than a specific public repository.

## Must-Contain Checks

Good checks are stable and meaningful:

- category exists for a real rule style
- command assertion includes an executable command such as `pnpm test`
- file assertion preserves an explicit path or glob
- code-pattern assertion captures a concrete forbidden or required token

Avoid overfitting:

- Do not require every extracted rule.
- Do not assert ordering.
- Do not assert incidental wording from the fixture.
- Do not add fixtures only because they make coverage look better.

## Adding A Fixture

1. Add the fixture file under `benchmarks/fixtures/`.
2. Add metadata to `benchmarks/corpus.json`.
3. Run `pnpm dev benchmark --fixtures-only`.
4. Add or update a focused extractor test only if the new fixture exposes a behavior gap.
5. Update `docs/examples/oss-extraction-comparisons.md` when the fixture is part of the public comparison story.

The benchmark should make RuleProbe more credible, not more flattering.
