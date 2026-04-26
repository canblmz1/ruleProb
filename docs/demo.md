# Demo GIF / asciinema reproducible path

RuleProbe ships its README without a binary GIF in the repository, but every
demo asset can be regenerated locally using the recipe below. We do this
because:

- Binary GIFs balloon the repo and cannot be diffed in PRs.
- Demos drift fastest of all docs; pinning a commit to a recipe keeps them
  faithful to the code.

## Recommended tools

- [`asciinema`](https://asciinema.org/) — for terminal-only SVG-style demos.
- [`terminalizer`](https://github.com/faressoft/terminalizer) — for GIF
  output that GitHub renders inline.
- [`agg`](https://github.com/asciinema/agg) — for converting an asciinema
  cast to GIF.

## Recommended demo command sequence (~30 s)

```bash
# 1. Show what RuleProbe sees in a real instruction file
pnpm dev list-rules benchmarks/fixtures/better-auth.CLAUDE.md --extractor hybrid

# 2. Run against the mock provider (mixed PASS/FAIL — honest by design)
pnpm dev run benchmarks/fixtures/better-auth.CLAUDE.md --provider mock --fail-below 70

# 3. Show the markdown proof artifact, including the share block
head -40 .ruleprobe/report.md
```

## Producing an asciinema cast

```bash
asciinema rec docs/assets/demo.cast --command \
  "bash -lc 'pnpm dev list-rules benchmarks/fixtures/better-auth.CLAUDE.md --extractor hybrid && \
              pnpm dev run benchmarks/fixtures/better-auth.CLAUDE.md --provider mock --fail-below 70 && \
              head -40 .ruleprobe/report.md'"
```

Commit `docs/assets/demo.cast` (text) — the GIF can be regenerated from it
on demand:

```bash
agg docs/assets/demo.cast docs/assets/demo.gif
```

## Producing a terminalizer GIF

```bash
terminalizer record docs/assets/demo
terminalizer render docs/assets/demo -o docs/assets/demo.gif
```

## Honesty checklist before sharing

- [ ] The demo uses a **real** instruction file (one of `benchmarks/fixtures/*` or
      a public OSS repo), not the mock-only `examples/basic` shape.
- [ ] If the demo uses `--provider mock`, the share block visibly shows
      mixed PASS/FAIL/SKIPPED. A 100/100 GIF is misleading and should be
      rerun.
- [ ] If the demo uses a real provider (gemini/openrouter/opencode-go), the
      provider, model, and date are mentioned in the surrounding text.
- [ ] Any API key visible in the recording is regenerated immediately
      after publishing.
