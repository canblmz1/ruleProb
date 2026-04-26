# Extension Points

RuleProbe's extension surface is intentionally small. Additions should strengthen repository instruction testing without turning the project into a generic eval platform.

## Provider Contract

A provider implements:

```ts
interface Provider {
  name: string;
  run(input: ProviderInput): Promise<ProviderResult>;
}
```

`ProviderInput` includes:

- `scenario`: the generated sandbox scenario and expected assertions
- `sandboxDir`: the disposable working directory

`ProviderResult` must report:

- `success`: whether the provider completed enough work to evaluate compliance
- `finalAnswer`: final response text, if any
- `changedFiles`: sandbox-relative changed paths
- `changedFileContents`: contents for changed files when available
- `commands`: commands actually executed or structurally executed by the action bridge
- `rawOutput`: sanitized provider transcript or error details

Provider rules:

- Missing credentials should return `success: false` with clear raw output.
- Rate limits and malformed responses should be explicit, not converted to PASS.
- Raw output must avoid leaking common API key formats.
- Action-bridge providers should use `parseActionPlan` and `executeActionPlan`.
- Local CLI providers should keep execution inside `sandboxDir`.

## Adding A Provider

1. Add `src/providers/<name>.ts`.
2. Return a complete `ProviderResult` through `normalizeProviderResult` expectations.
3. Wire the provider in `src/cli/index.ts`.
4. Add provider capability metadata in `src/providers/capabilities.ts`.
5. Add missing-key or unavailable-provider tests.
6. Update `docs/provider-capabilities.md` and README if the tradeoff matters to users.

## Rule Category Contract

A rule category needs agreement across four places:

- extraction: `src/rules/extract.ts` or AI-assisted extraction prompt/schema
- validation: `src/extractors/validateCandidate.ts`
- scenario generation: `src/scenarios/generate.ts`
- scoring: `src/evaluator/score.ts`

The core types live in `src/types/index.ts`.

## Adding A Rule Or Assertion Type

1. Add the `RuleCategory`, `AssertionType`, and `Assertion` shape.
2. Teach deterministic and/or AI-assisted extraction to emit it.
3. Validate candidate shape and reject ambiguous/noisy outputs.
4. Add a category-native scenario template.
5. Add evaluator logic grounded in commands, changed files, changed content, or final answer text.
6. Add benchmark coverage only when the rule style is representative.
7. Add tests for extraction, scenario generation, and scoring.

Good new categories should be concrete, observable, and common in repository instruction files.
