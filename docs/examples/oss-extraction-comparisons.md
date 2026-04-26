# Public OSS Extraction Comparison Examples

These examples are fixture-backed and reproducible without provider credentials:

```bash
pnpm dev benchmark --fixtures-only
```

The goal is to show what RuleProbe can extract from recognizable repository instruction styles. These examples are extraction comparisons, not real-provider runtime rankings.

| Repo/style | Instruction style | Expected categories | Why it is useful |
| --- | --- | --- | --- |
| better-auth | `CLAUDE.md` | package manager, forbidden command, required command, code patterns | Dense rule file with package-manager, validation, and TypeScript pattern instructions. |
| formatjs | `CLAUDE.md` | forbidden command, required command | Clear command-boundary example around Bazel usage. |
| fern | `CLAUDE.md` | forbidden code patterns | Code-style extraction example for module/import restrictions. |
| restatedev | `AGENTS.md` | forbidden command, required command | Small AGENTS-style command rule fixture. |
| mastra | `AGENTS.md` | forbidden command, required command | Commit/push and package test guidance. |
| team-monorepo-style | `AGENTS.md` | package manager, command, file-change, code-pattern, docs/tests | Synthetic but realistic monorepo-style fixture for broader rule-category coverage. |
| copilot-workflow-style | Copilot instructions | package manager, command, file-change, final answer | Numbered workflow-style fixture with protected CI files and final-answer requirements. |

Example verified output shape:

```text
Overall:
- Repos tested: 7
- Passed: 7
- Failed: 0
- Extraction coverage: 100%
```

## Deterministic Vs Hybrid Example

Run a local comparison on the included example project:

```bash
pnpm dev compare examples/basic --provider mock
```

Expected shape:

```text
RuleProbe deterministic vs hybrid comparison
Rules extracted: deterministic=11, hybrid=10
Category deltas:
- package_manager: deterministic=2, hybrid=1, delta=-1
Rules only in deterministic:
- package_manager | ... | Use pnpm, not npm or yarn.
Notable cleaned noise / repaired categories:
- cleaned package_manager | ... | deduplicated or filtered by hybrid validation | Use pnpm, not npm or yarn.
```

Provider-backed hybrid comparison can be run with `gemini` or `openrouter` when credentials are available. If credentials are missing or the provider is rate-limited, the comparison should show deterministic fallback behavior rather than claiming AI-assisted success.
