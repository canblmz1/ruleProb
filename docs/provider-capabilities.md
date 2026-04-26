# Provider Capability Matrix

| Provider | Extraction | Structured actions | Runtime execution | Deterministic fallback | Raw response debug | Real local CLI | Rate-limit sensitivity | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| mock | No | Simulated | Simulated | N/A | No | No | None | Deterministic CI smoke provider; not evidence of real model behavior. |
| dry-run | No | No | No | N/A | No | No | None | Builds scenarios and reports skipped execution so flows can be inspected safely. |
| openrouter | Yes | Yes | Sandboxed action bridge | Yes for extraction | Yes | No | High | Remote API; quality and availability depend on selected model and quota. |
| gemini | Yes | Yes | Sandboxed action bridge | Yes for extraction | Yes | No | Medium to high | Remote API with JSON-mode extraction/runtime path when a key is available. |
| claude-code | No | No | Real local CLI | N/A | CLI transcript | Yes | Depends on local account | Runs the installed Claude Code CLI in a sandbox; not apples-to-apples with action-bridge providers. |

Use `ruleprobe providers` or `pnpm dev providers` to print the same matrix from the CLI.

Important interpretation notes:

- `mock` and `dry-run` are useful in CI, but they do not prove real model behavior.
- `openrouter` and `gemini` can be used for AI-assisted extraction and structured runtime smoke checks when credentials are available.
- `claude-code` is closest to a local real-agent run, but its execution surface is different from JSON structured-action providers.
- Missing credentials, rate limits, malformed JSON, and local CLI absence should appear as explicit failures, skips, or report limitations.
