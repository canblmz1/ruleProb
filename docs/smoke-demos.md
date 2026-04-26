# Reproducible Smoke Demos

These demos are intentionally small. They distinguish extraction checks from runtime checks and avoid claiming real-provider success when a provider is unavailable.

## Extraction Smoke: Gemini Hybrid

```bash
GEMINI_API_KEY=... pnpm dev compare examples/basic --provider gemini --debug-extractor
```

Expected successful shape:

```text
RuleProbe deterministic vs hybrid comparison
Rules extracted: deterministic=5, hybrid=5
Category deltas:
- package_manager: deterministic=1, hybrid=1, delta=0
...
Notable cleaned noise / repaired categories:
```

If `GEMINI_API_KEY` is missing or the API is unavailable, the honest expected behavior is a warning about Gemini credentials or provider failure and deterministic fallback for hybrid extraction. That is still useful for validating fallback honesty, but it is not a real-provider extraction success.

## Runtime Smoke: Gemini Structured Actions

```bash
GEMINI_API_KEY=... pnpm dev run examples/basic --provider gemini --extractor deterministic --fail-below 0 --debug-extractor
```

Expected successful shape:

```text
RuleProbe Runner Started
Extracted 5 testable rules (5 total).
Generated 5 sandbox scenarios.
Running provider: gemini
...
Reports written:
- .ruleprobe/report.json
- .ruleprobe/report.md
- .ruleprobe/report.html
```

If Gemini is rate-limited or returns malformed JSON, RuleProbe should report provider failure in scenario evidence and add Known Limitations to the report. Do not turn that into a claimed PASS.

## Local CLI Runtime Smoke: Claude Code

```bash
claude --version
pnpm dev run examples/basic --provider claude-code --extractor deterministic --fail-below 0
```

Expected unavailable shape when the CLI is not installed:

```text
Running provider: claude-code
FAIL    ...
Actual: Provider failed before compliance could be verified.
```

When the local CLI is installed and authenticated, this is a real local-agent smoke. It is not perfectly comparable with `gemini` or `openrouter`, because it does not use the structured action bridge.

## OpenCode Go Smoke: Extraction + Runtime

```bash
OPENCODE_GO_API_KEY=... OPENCODE_GO_MODEL=opencode-go/kimi-k2.6 \
  pnpm dev run examples/basic --provider opencode-go --extractor hybrid --fail-below 0 --debug-extractor
```

Expected successful debug output shape:

```text
--- OPENCODE_GO EXTRACTOR DEBUG ---
OPENCODE_GO API key visible: yes
OPENCODE_GO model: opencode-go/kimi-k2.6
OPENCODE_GO base URL: https://opencode.ai/zen/go/v1
OPENCODE_GO timeout (ms): 60000
OPENCODE_GO request URL: https://opencode.ai/zen/go/v1/chat/completions
OPENCODE_GO request body shape: model=opencode-go/kimi-k2.6, messages=2, auth=bearer
OPENCODE_GO request sent: yes
OPENCODE_GO response received: yes
OPENCODE_GO http status: 200
OPENCODE_GO parse success: yes
```

### Troubleshooting: remote-abort before response

If you see `remote connection aborted before a response was received`, work through this checklist:

**1. Run doctor first**

```bash
pnpm dev doctor
```

Checks key visibility, dist artifact, shebang, and CLI tools without burning quota.

**2. Try the namespaced model form**

OpenCode Go models may require the `opencode-go/` prefix in the request body:

```bash
OPENCODE_GO_MODEL=opencode-go/kimi-k2.6 pnpm dev analyze examples/basic \
  --provider opencode-go --extractor ai-assisted --debug-extractor --no-cache
```

If that still aborts, try the bare form:

```bash
OPENCODE_GO_MODEL=kimi-k2.6 pnpm dev analyze examples/basic \
  --provider opencode-go --extractor ai-assisted --debug-extractor --no-cache
```

The debug line `request body shape: model=<value>` confirms which form was sent.

**3. Try X-Api-Key auth header**

If the endpoint rejects bearer auth, set:

```bash
OPENCODE_GO_AUTH_HEADER_MODE=x-api-key OPENCODE_GO_API_KEY=... OPENCODE_GO_MODEL=... \
  pnpm dev analyze examples/basic --provider opencode-go --extractor ai-assisted --debug-extractor --no-cache
```

The debug line `auth=x-api-key` confirms the header switch is active.

**4. Verify plan entitlement**

Visit `https://opencode.ai` and confirm the model is on your plan. A model that exists but is not on your subscription may trigger a silent connection reset rather than a 403.

**5. Increase timeout for slow models**

```bash
OPENCODE_GO_TIMEOUT_MS=120000 OPENCODE_GO_API_KEY=... OPENCODE_GO_MODEL=... \
  pnpm dev analyze examples/basic --provider opencode-go --extractor ai-assisted --no-cache
```

A `local-timeout` error (shown as `fetch error type: local-timeout` in debug) means the model took longer than the timeout — increase it. A `remote-abort` error means the server closed the connection before the timeout fired — it is not a timeout issue.

**Honest fallback behavior**

If the connection aborts, extraction falls back to deterministic. The report will include a Known Limitations note: `extractor-provider-mismatch` or `deterministic-extraction-fallback`. That is correct behavior — do not interpret a green deterministic score as OpenCode Go compliance proof.
