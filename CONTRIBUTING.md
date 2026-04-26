# Contributing

RuleProbe is currently focused on release-ready beta stability.

## Development Setup

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm test
pnpm dev benchmark --fixtures-only
pnpm dev compare examples/basic --provider mock
pnpm dev providers
```

## Working Principles

- Keep changes small and verifiable.
- Preserve deterministic extraction behavior unless a test or fixture proves it is wrong.
- Do not weaken tests to make them pass.
- Prefer fixture-backed fixes over broad refactors.
- Ground evaluator logic in actual sandbox state wherever practical.
- Treat provider/API failures as expected runtime conditions.
- Keep docs honest about beta limits.
- Keep comparison output readable; teams should be able to see deterministic vs hybrid differences quickly.
- Keep scenario templates category-native and small.
- Follow BENCHMARKS.md when adding fixtures.

## Pull Request Checklist

- `pnpm build` passes.
- `pnpm typecheck` passes.
- `pnpm test` passes.
- `pnpm dev benchmark --fixtures-only` passes.
- `pnpm dev compare examples/basic --provider mock` prints deterministic vs hybrid counts and deltas.
- `pnpm dev providers` prints the provider capability matrix.
- `pnpm dev list-rules examples/basic` passes.
- `pnpm dev run examples/basic --provider mock --fail-below 70` passes.
- `pnpm dev run examples/basic --provider dry-run --fail-below 0` passes.
- `npm pack --dry-run --json` looks clean.
- New extraction behavior is covered by a fixture or targeted test.
- Provider changes include missing-key, malformed-output, or throttling behavior where relevant.
- Reports remain readable and evidence-oriented for a GitHub demo.
- Reports include Known Limitations when runs are synthetic, skipped, fallback, or provider-limited.
- New providers or rule categories follow docs/extensions.md.
