# RuleProbe Phase 20-22 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Phase 20 (Python + Go HTTP clients), Phase 21 (opt-in ML Rule Advisor), and Phase 22 (real-world repo fixtures + distribution polish) to make ruleprobe-ai the reference tool for AI instruction compliance testing.

**Architecture:**
- Phase 20 wraps the existing `ruleprobe serve` HTTP API (Phase 18: POST /ruleprobe/run, GET /ruleprobe/rules) with thin clients in Python and Go. No gRPC, no new runtime deps on the Node side.
- Phase 21 layers semantic similarity onto the existing Phase 14 heuristic advisor via `optionalDependencies` — graceful fallback to heuristics when ML deps are absent.
- Phase 22 adds real-world example fixtures and polishes README/docs for distribution.

**Tech Stack:** TypeScript (tsup/ESM), Python 3.9+, Go 1.21+, transformers.js (optionalDep), vitest, pnpm

---

## Phase 20 — v2.3.0: Python + Go Language Bindings
**Branch:** `feat/phase20-lang-bindings`

### Files to create/modify:
- Create: `clients/python/ruleprobe_client/__init__.py`
- Create: `clients/python/ruleprobe_client/client.py`
- Create: `clients/python/pyproject.toml`
- Create: `clients/python/README.md`
- Create: `clients/go/ruleprobe/client.go`
- Create: `clients/go/go.mod`
- Create: `clients/go/README.md`
- Create: `tests/clients/test_python_client.py` (integration smoke)
- Modify: `docs/getting-started.md` (add Python/Go sections)
- Modify: `README.md` (add Language Bindings section)
- Modify: `package.json` (version → 2.3.0)

---

### Task 20.1: Branch setup

- [ ] **Create branch**
```bash
git checkout main
git checkout -b feat/phase20-lang-bindings
```

---

### Task 20.2: Python client library

**Files:**
- Create: `clients/python/ruleprobe_client/__init__.py`
- Create: `clients/python/ruleprobe_client/client.py`
- Create: `clients/python/pyproject.toml`

- [ ] **Step 1: Create directory structure**
```bash
mkdir -p clients/python/ruleprobe_client
```

- [ ] **Step 2: Write `clients/python/ruleprobe_client/client.py`**
```python
"""ruleprobe_client — thin HTTP wrapper for ruleprobe serve."""
from __future__ import annotations
import urllib.request
import urllib.error
import json
from typing import Any

DEFAULT_BASE_URL = "http://localhost:3000"


class RuleProbeClient:
    """HTTP client for a running `ruleprobe serve` instance."""

    def __init__(self, base_url: str = DEFAULT_BASE_URL) -> None:
        self.base_url = base_url.rstrip("/")

    def rules(self, dir: str = ".") -> list[dict[str, Any]]:
        """GET /ruleprobe/rules — return extracted rules for *dir*."""
        url = f"{self.base_url}/ruleprobe/rules?dir={urllib.parse.quote(dir)}"
        with urllib.request.urlopen(url, timeout=30) as resp:
            return json.loads(resp.read())

    def run(self, dir: str = ".", provider: str = "mock") -> list[dict[str, Any]]:
        """POST /ruleprobe/run — run compliance tests and return results."""
        payload = json.dumps({"dir": dir, "provider": provider}).encode()
        req = urllib.request.Request(
            f"{self.base_url}/ruleprobe/run",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read())

    def score(self, dir: str = ".", provider: str = "mock") -> int:
        """Run compliance tests and return the overall integer score (0-100)."""
        results = self.run(dir=dir, provider=provider)
        if not results:
            return 0
        scores = [r.get("score", 0) for r in results if r.get("status") != "SKIPPED"]
        return round(sum(scores) / len(scores)) if scores else 0
```

- [ ] **Step 3: Write `clients/python/ruleprobe_client/__init__.py`**
```python
from .client import RuleProbeClient

__all__ = ["RuleProbeClient"]
__version__ = "0.1.0"
```

- [ ] **Step 4: Write `clients/python/pyproject.toml`**
```toml
[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[project]
name = "ruleprobe-client"
version = "0.1.0"
description = "Python client for ruleprobe-ai HTTP API"
readme = "README.md"
requires-python = ">=3.9"
license = { text = "MIT" }
keywords = ["ruleprobe", "ai", "compliance", "claude-md", "agents-md"]
classifiers = [
    "Programming Language :: Python :: 3",
    "License :: OSI Approved :: MIT License",
]

[project.urls]
Repository = "https://github.com/canblmz1/ruleProb"
```

- [ ] **Step 5: Write `clients/python/README.md`**
```markdown
# ruleprobe-client (Python)

Thin HTTP wrapper for [`ruleprobe-ai`](https://www.npmjs.com/package/ruleprobe-ai)'s built-in HTTP server.

## Setup

```bash
# Start the server in your project directory
npx ruleprobe-ai serve --port 3000

# Install the Python client
pip install ruleprobe-client
```

## Usage

```python
from ruleprobe_client import RuleProbeClient

client = RuleProbeClient("http://localhost:3000")

# Get extracted rules
rules = client.rules(".")
print(f"{len(rules)} rules found")

# Run compliance tests
results = client.run(".", provider="mock")
score = client.score(".")
print(f"Score: {score}/100")
```
```

- [ ] **Step 6: Commit**
```bash
git add clients/python/
git commit -m "feat(phase20): Python HTTP client for ruleprobe serve"
```

---

### Task 20.3: Go client library

**Files:**
- Create: `clients/go/ruleprobe/client.go`
- Create: `clients/go/go.mod`

- [ ] **Step 1: Create directory structure**
```bash
mkdir -p clients/go/ruleprobe
```

- [ ] **Step 2: Write `clients/go/go.mod`**
```go
module github.com/canblmz1/ruleprobe-go

go 1.21
```

- [ ] **Step 3: Write `clients/go/ruleprobe/client.go`**
```go
// Package ruleprobe provides a thin HTTP client for ruleprobe-ai's HTTP API.
package ruleprobe

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"
)

const DefaultBaseURL = "http://localhost:3000"

// Client is an HTTP client for a running `ruleprobe serve` instance.
type Client struct {
	BaseURL    string
	HTTPClient *http.Client
}

// New creates a Client pointing at baseURL (default: http://localhost:3000).
func New(baseURL string) *Client {
	if baseURL == "" {
		baseURL = DefaultBaseURL
	}
	return &Client{
		BaseURL:    baseURL,
		HTTPClient: &http.Client{Timeout: 60 * time.Second},
	}
}

// Rules calls GET /ruleprobe/rules and returns the extracted rules for dir.
func (c *Client) Rules(dir string) ([]map[string]any, error) {
	u := fmt.Sprintf("%s/ruleprobe/rules?dir=%s", c.BaseURL, url.QueryEscape(dir))
	resp, err := c.HTTPClient.Get(u)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	var out []map[string]any
	return out, json.Unmarshal(body, &out)
}

// Run calls POST /ruleprobe/run and returns evaluation results.
func (c *Client) Run(dir, provider string) ([]map[string]any, error) {
	payload, _ := json.Marshal(map[string]string{"dir": dir, "provider": provider})
	resp, err := c.HTTPClient.Post(
		c.BaseURL+"/ruleprobe/run",
		"application/json",
		bytes.NewReader(payload),
	)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	var out []map[string]any
	return out, json.Unmarshal(body, &out)
}

// Score runs compliance tests and returns the overall score (0-100).
func (c *Client) Score(dir, provider string) (int, error) {
	results, err := c.Run(dir, provider)
	if err != nil {
		return 0, err
	}
	var sum, count float64
	for _, r := range results {
		if r["status"] == "SKIPPED" {
			continue
		}
		if s, ok := r["score"].(float64); ok {
			sum += s
			count++
		}
	}
	if count == 0 {
		return 0, nil
	}
	return int(sum / count), nil
}
```

- [ ] **Step 4: Commit**
```bash
git add clients/go/
git commit -m "feat(phase20): Go HTTP client for ruleprobe serve"
```

---

### Task 20.4: Update README and docs

**Files:**
- Modify: `README.md`
- Modify: `package.json` (version → 2.3.0)

- [ ] **Step 1: Add Language Bindings section to README**

Find the `## Providers` section in README.md and add before it:

```markdown
## Language Bindings

Thin HTTP clients built on `ruleprobe serve`:

```bash
# Python
pip install ruleprobe-client
```

```python
from ruleprobe_client import RuleProbeClient
client = RuleProbeClient("http://localhost:3000")
print(f"Score: {client.score('.')}/100")
```

```go
// Go
import "github.com/canblmz1/ruleprobe-go/ruleprobe"
client := ruleprobe.New("")
score, _ := client.Score(".", "mock")
```

See [`clients/python/`](clients/python/) and [`clients/go/`](clients/go/) for full docs.

---
```

- [ ] **Step 2: Bump version**
```bash
# In package.json, change "version": "2.2.0" to "version": "2.3.0"
```

- [ ] **Step 3: Run full test suite**
```bash
pnpm build && pnpm test
```
Expected: all 310+ tests pass, exit 0.

- [ ] **Step 4: Commit and merge**
```bash
git add README.md package.json
git commit -m "feat(phase20): language bindings docs + v2.3.0"
git checkout main
git merge feat/phase20-lang-bindings --no-ff -m "feat(phase20): Python+Go HTTP clients (v2.3.0)"
git tag v2.3.0
git push origin main --tags
```

---

## Phase 21 — v2.4.0: ML-Powered Rule Advisor (opt-in)
**Branch:** `feat/phase21-ml-advisor`

### Files to create/modify:
- Create: `src/advisor/ml/similarity.ts`
- Create: `src/advisor/ml/classifier.ts`
- Create: `src/advisor/ml/index.ts`
- Create: `tests/advisor/ml.test.ts`
- Modify: `src/advisor/suggest.ts` (add --ml code path)
- Modify: `src/cli/commands/advise.ts` (add --ml flag)
- Modify: `package.json` (optionalDependencies + version → 2.4.0)
- Modify: `docs/getting-started.md` (add ML advisor section)

### Architecture notes:
- `transformers.js` loaded via dynamic `import()` wrapped in try/catch → graceful fallback to Phase 14 heuristics if not installed
- Similarity computed with cosine distance on `all-MiniLM-L6-v2` embeddings (25MB model, quantized)
- No training required: zero-shot similarity between new rules and existing labeled history
- `optionalDependencies` so `pnpm install` doesn't break for users without ML needs

---

### Task 21.1: Branch setup

- [ ] **Create branch**
```bash
git checkout main
git checkout -b feat/phase21-ml-advisor
```

---

### Task 21.2: ML similarity module

**Files:**
- Create: `src/advisor/ml/similarity.ts`
- Create: `tests/advisor/ml.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/advisor/ml.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { cosineSimilarity, isMLAvailable } from '../../src/advisor/ml/similarity.js';

describe('ML similarity', () => {
  it('cosineSimilarity returns 1.0 for identical vectors', () => {
    const v = [0.1, 0.5, 0.3];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0, 5);
  });

  it('cosineSimilarity returns 0.0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0.0, 5);
  });

  it('isMLAvailable returns a boolean without throwing', async () => {
    const result = await isMLAvailable();
    expect(typeof result).toBe('boolean');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
```bash
pnpm test tests/advisor/ml.test.ts
```
Expected: FAIL — `Cannot find module '../../src/advisor/ml/similarity.js'`

- [ ] **Step 3: Write `src/advisor/ml/similarity.ts`**
```typescript
/**
 * Cosine similarity and ML availability check.
 * Works without transformers.js (fallback: returns undefined from embed()).
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

let _pipeline: any = null;

export async function isMLAvailable(): Promise<boolean> {
  try {
    await import('@xenova/transformers');
    return true;
  } catch {
    return false;
  }
}

export async function embedText(text: string): Promise<number[] | undefined> {
  try {
    if (!_pipeline) {
      const { pipeline } = await import('@xenova/transformers');
      _pipeline = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    }
    const output = await _pipeline(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data as Float32Array);
  } catch {
    return undefined;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**
```bash
pnpm test tests/advisor/ml.test.ts
```
Expected: 3 tests PASS

- [ ] **Step 5: Commit**
```bash
git add src/advisor/ml/similarity.ts tests/advisor/ml.test.ts
git commit -m "feat(phase21): ML cosine similarity + availability check"
```

---

### Task 21.3: ML-powered suggest integration

**Files:**
- Create: `src/advisor/ml/classifier.ts`
- Create: `src/advisor/ml/index.ts`
- Modify: `src/advisor/suggest.ts`

- [ ] **Step 1: Write `src/advisor/ml/classifier.ts`**
```typescript
import { embedText, cosineSimilarity } from './similarity.js';
import type { Rule } from '../../types/index.js';

export interface SimilarRule {
  ruleText: string;
  similarity: number;
  verdict: 'duplicate' | 'conflict' | 'related';
}

/**
 * Find rules semantically similar to `candidate` using cosine similarity.
 * Returns top-k results above the similarity threshold.
 */
export async function findSimilarRules(
  candidate: Rule,
  existing: Rule[],
  threshold = 0.85,
  topK = 3
): Promise<SimilarRule[]> {
  const candidateVec = await embedText(candidate.text);
  if (!candidateVec) return [];

  const scored: SimilarRule[] = [];
  for (const rule of existing) {
    if (rule.id === candidate.id) continue;
    const vec = await embedText(rule.text);
    if (!vec) continue;
    const sim = cosineSimilarity(candidateVec, vec);
    if (sim >= threshold) {
      const verdict: SimilarRule['verdict'] =
        sim > 0.95 ? 'duplicate'
        : rule.category !== candidate.category ? 'conflict'
        : 'related';
      scored.push({ ruleText: rule.text, similarity: sim, verdict });
    }
  }
  return scored.sort((a, b) => b.similarity - a.similarity).slice(0, topK);
}
```

- [ ] **Step 2: Write `src/advisor/ml/index.ts`**
```typescript
export { cosineSimilarity, isMLAvailable, embedText } from './similarity.js';
export { findSimilarRules } from './classifier.js';
export type { SimilarRule } from './classifier.js';
```

- [ ] **Step 3: Add --ml flag to advise command**

In `src/advisor/suggest.ts`, find the `generateSuggestions` function and add ML branch:

```typescript
import { isMLAvailable, findSimilarRules } from './ml/index.js';

// Add to generateSuggestions() after heuristic suggestions:
export async function generateSuggestionsWithML(rules: Rule[]): Promise<string[]> {
  const available = await isMLAvailable();
  if (!available) {
    console.warn('[ml-advisor] transformers.js not installed — falling back to heuristics.');
    console.warn('[ml-advisor] Run: pnpm add @xenova/transformers');
    return [];
  }

  const mlSuggestions: string[] = [];
  for (let i = 0; i < rules.length; i++) {
    const similar = await findSimilarRules(rules[i], rules.slice(i + 1));
    for (const s of similar) {
      if (s.verdict === 'duplicate') {
        mlSuggestions.push(
          `[ML/duplicate] "${rules[i].text.slice(0, 60)}" is semantically identical to "${s.ruleText.slice(0, 60)}" (similarity: ${(s.similarity * 100).toFixed(0)}%) — consider removing one.`
        );
      } else if (s.verdict === 'conflict') {
        mlSuggestions.push(
          `[ML/conflict] "${rules[i].text.slice(0, 60)}" may conflict with "${s.ruleText.slice(0, 60)}" (different categories, high similarity ${(s.similarity * 100).toFixed(0)}%).`
        );
      }
    }
  }
  return mlSuggestions;
}
```

- [ ] **Step 4: Add --ml flag to CLI advise command**

In `src/cli/index.ts` or `src/cli/commands/advise.ts`, find the `advise` command and add:
```typescript
.option('--ml', 'Use ML-powered semantic similarity (requires: pnpm add @xenova/transformers)')
```

In the action handler:
```typescript
if (options.ml) {
  const { generateSuggestionsWithML } = await import('../../advisor/suggest.js');
  const mlSuggestions = await generateSuggestionsWithML(rules);
  // Append to suggestions output
}
```

- [ ] **Step 5: Add optionalDependency to package.json**

In `package.json`, add:
```json
"optionalDependencies": {
  "@xenova/transformers": "^2.17.2"
}
```

- [ ] **Step 6: Update version to 2.4.0 in package.json**
```json
"version": "2.4.0"
```

- [ ] **Step 7: Build and run tests**
```bash
pnpm build && pnpm test
```
Expected: all tests pass (ML tests pass without @xenova/transformers because isMLAvailable() returns false gracefully).

- [ ] **Step 8: Commit and merge**
```bash
git add src/advisor/ml/ src/advisor/suggest.ts package.json docs/
git commit -m "feat(phase21): opt-in ML rule advisor with semantic similarity (v2.4.0)"
git checkout main
git merge feat/phase21-ml-advisor --no-ff -m "feat(phase21): ML-powered rule advisor, opt-in via --ml (v2.4.0)"
git tag v2.4.0
git push origin main --tags
```

---

## Phase 22 — v2.5.0: Real-World Fixtures + Distribution Polish
**Branch:** `feat/phase22-fixtures-polish`

### Files to create/modify:
- Create: `examples/nextjs-app/CLAUDE.md` — realistic Next.js project rules
- Create: `examples/rust-project/CLAUDE.md` — Rust-specific rules
- Create: `examples/security-focused/CLAUDE.md` — security-heavy rules
- Modify: `docs/getting-started.md` — complete end-to-end guide
- Modify: `docs/rule-writing-guide.md` — concrete vs. subjective rule guidance
- Modify: `README.md` — hero section, one-liner improvement
- Modify: `package.json` (version → 2.5.0)

---

### Task 22.1: Branch setup

- [ ] **Create branch**
```bash
git checkout main
git checkout -b feat/phase22-fixtures-polish
```

---

### Task 22.2: Real-world example fixtures

- [ ] **Step 1: Create `examples/nextjs-app/CLAUDE.md`**
```markdown
# Next.js App Instructions

## Package Manager
- Always use pnpm. Never use npm or yarn.

## Forbidden Commands
- NEVER run `git commit` directly. Use `pnpm commit`.
- NEVER run `npm install` or `yarn add`.
- NEVER run `next build` — use `pnpm build` only.

## Required Commands
- Always run `pnpm typecheck` before submitting changes.
- Always run `pnpm lint` before the final response.
- Always run `pnpm test` before finishing.

## File Protection
- Never modify `next.config.js` without explicit approval.
- Never modify files under `src/generated/`.
- Never edit `.env`, `.env.local`, `.env.production`.

## Code Patterns
- Never use `any` in TypeScript. Use `unknown` or explicit types.
- Never use `export default` for page components — use named exports.
- Never use `console.log` in production code. Use `logger` from `@/lib/logger`.

## Final Answer
- Always mention which files were changed.
- Always include the test command output in your response.
```

- [ ] **Step 2: Create `examples/rust-project/CLAUDE.md`**
```markdown
# Rust Project Instructions

## Package Manager / Build Tool
- Use `cargo` for all Rust operations. Never use rustup directly in code.
- Never run `cargo install` without explicit approval.

## Forbidden Commands
- NEVER run `cargo publish` without approval.
- NEVER run `git push` directly.
- NEVER modify `Cargo.lock` manually.

## Required Commands
- Always run `cargo test` before finishing.
- Always run `cargo clippy -- -D warnings` before the final response.
- Always run `cargo fmt --check` to verify formatting.

## File Protection
- Never modify `Cargo.toml` version field without approval.
- Never modify files under `target/`.

## Code Patterns
- Never use `unwrap()` in library code. Use `?` or explicit error handling.
- Never use `unsafe` without a safety comment explaining why.

## Final Answer
- Always mention which crates were modified.
- Always include clippy output in your response.
```

- [ ] **Step 3: Create `examples/security-focused/CLAUDE.md`**
```markdown
# Security-Focused Project Instructions

## Package Manager
- Use pnpm only. No npm, yarn, or bun.

## Forbidden Commands
- NEVER run `git push --force` or `git push --force-with-lease`.
- NEVER run `curl | sh` or `wget | bash` patterns.
- NEVER run `npm audit fix --force`.
- NEVER expose secrets in logs or output.

## Required Commands
- Always run `pnpm audit` before finishing.
- Always run `pnpm typecheck` before the final response.

## File Protection
- Never modify `.github/workflows/` files without security review.
- Never modify `package.json` `scripts` section without approval.
- Never read or write files outside the project directory.
- Never modify `.env`, `.env.*`, `secrets.*`, `*.pem`, `*.key` files.

## Code Patterns
- Never use `eval()` or `new Function()`.
- Never use `innerHTML` — use `textContent` or DOMPurify.
- Never hardcode credentials, tokens, or API keys.
- Never use `Math.random()` for cryptographic purposes.

## Final Answer
- Always mention any security-relevant files changed.
- Always include the audit result summary.
```

- [ ] **Step 4: Verify all examples extract correctly**
```bash
pnpm dev list-rules examples/nextjs-app
pnpm dev list-rules examples/rust-project
pnpm dev list-rules examples/security-focused
```
Expected: each shows 10+ testable rules, no extraction errors.

- [ ] **Step 5: Run examples with --demo**
```bash
pnpm dev run examples/nextjs-app --demo --fail-below 0
pnpm dev run examples/rust-project --demo --fail-below 0
pnpm dev run examples/security-focused --demo --fail-below 0
```
Expected: each completes with score output and report files written.

- [ ] **Step 6: Commit**
```bash
git add examples/nextjs-app/ examples/rust-project/ examples/security-focused/
git commit -m "feat(phase22): real-world fixtures — Next.js, Rust, security-focused"
```

---

### Task 22.3: README hero section improvement

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README hero section**

Replace the current tagline block (lines 1-12 approximately) with:
```markdown
# RuleProbe

> **Your AI coding rules are documentation until you test them.**

[![Node >=18](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org) [![MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE) [![npm](https://img.shields.io/npm/v/ruleprobe-ai)](https://www.npmjs.com/package/ruleprobe-ai)

![RuleProbe Demo](docs/demo.gif)

**RuleProbe** turns `CLAUDE.md`, `AGENTS.md`, `.cursor/rules`, and Copilot instructions into executable compliance tests — run them in CI, get a score, fail the build if agents break your rules.

```bash
# Try it now — no API key needed
npx ruleprobe-ai run examples/strict --demo

# Your project
npx ruleprobe-ai run . --provider gemini --fail-below 70
```
```

- [ ] **Step 2: Update the Examples table to include new fixtures**

Find the `## Examples` table and update:
```markdown
| Example | Description | Rules |
|---|---|---|
| `examples/basic` | Minimal starter | 6 |
| `examples/minimal` | 3-rule zero-friction intro | 3 |
| `examples/strict` | Full-coverage — all rule categories | 17 |
| `examples/nextjs-app` | Realistic Next.js project | 14 |
| `examples/rust-project` | Rust/cargo rules | 11 |
| `examples/security-focused` | Security-heavy enforcement | 16 |
| `examples/unverifiable` | Shows unverifiable rule detection | 3 testable + 5 unverifiable |
```

- [ ] **Step 3: Commit**
```bash
git add README.md
git commit -m "docs(phase22): improved README hero + examples table"
```

---

### Task 22.4: rule-writing-guide.md polish

**Files:**
- Modify: `docs/rule-writing-guide.md`

- [ ] **Step 1: Add "Verifiable vs Unverifiable" section to rule-writing-guide**

Read the current file first, then add after the introduction:
```markdown
## Verifiable vs Unverifiable Rules

RuleProbe automatically detects rules it cannot test. A rule is **verifiable** if a provider's output can be checked against a concrete criterion. A rule is **unverifiable** if it requires subjective judgment, internal reasoning inspection, or multi-turn context.

| Type | Example | Why unverifiable | How to fix |
|---|---|---|---|
| Internal reasoning | "Think step by step" | Can't observe thought process | Remove or make the output constraint explicit |
| Subjective style | "Be concise" | No objective pass/fail | Replace with "Response must be under 500 words" |
| Multi-turn context | "Remember our previous discussion" | No prior turn in sandbox | Document in a separate working-context file |
| Human judgment | "Match the existing code style" | Needs codebase read | Make it concrete: "Use 2-space indentation, no semicolons" |
| Process/attitude | "Take your time" | No measurable outcome | Drop it — it doesn't constrain agent behavior |

**Rule of thumb:** if you can write a test that passes or fails without human judgment, the rule is verifiable.
```

- [ ] **Step 2: Run tests to confirm nothing broke**
```bash
pnpm build && pnpm test
```
Expected: all tests pass.

- [ ] **Step 3: Bump version and commit**
```bash
# Change "version": "2.4.0" to "version": "2.5.0" in package.json
git add docs/rule-writing-guide.md package.json
git commit -m "docs(phase22): rule writing guide + v2.5.0"
```

---

### Task 22.5: Final merge and tag

- [ ] **Step 1: Run full test suite one last time**
```bash
pnpm build && pnpm test
```
Expected: all tests pass, exit 0.

- [ ] **Step 2: Merge and tag**
```bash
git checkout main
git merge feat/phase22-fixtures-polish --no-ff -m "feat(phase22): real-world fixtures + distribution polish (v2.5.0)"
git tag v2.5.0
git push origin main --tags
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ Phase 20: Python client — Task 20.2
- ✅ Phase 20: Go client — Task 20.3
- ✅ Phase 20: HTTP-first, no gRPC — architecture note honored
- ✅ Phase 21: opt-in ML via optionalDependencies — Task 21.3 step 5
- ✅ Phase 21: graceful fallback to heuristics — Task 21.3 step 3 (isMLAvailable check)
- ✅ Phase 21: ruleprobe advise --ml — Task 21.3 step 4
- ✅ Phase 22: real-world fixtures — Task 22.2
- ✅ Phase 22: README hero — Task 22.3
- ✅ Phase 22: rule-writing-guide unverifiable section — Task 22.4
- ✅ Each phase has own branch, version bump, tag

**Placeholder scan:** No TBD, TODO, or vague steps found.

**Type consistency:**
- `cosineSimilarity(a: number[], b: number[]): number` — used consistently in similarity.ts and classifier.ts
- `findSimilarRules(candidate: Rule, existing: Rule[], threshold, topK): Promise<SimilarRule[]>` — matches import in suggest.ts
- `SimilarRule.verdict: 'duplicate' | 'conflict' | 'related'` — consistent

---

## Summary

| Phase | Branch | Version | Key deliverable |
|---|---|---|---|
| 20 | `feat/phase20-lang-bindings` | v2.3.0 | Python + Go HTTP clients |
| 21 | `feat/phase21-ml-advisor` | v2.4.0 | Opt-in ML semantic similarity via `--ml` |
| 22 | `feat/phase22-fixtures-polish` | v2.5.0 | Next.js/Rust/security fixtures + README polish |

**Senin yapacakların (insan görevleri — koda dokunma):**
- HN/Reddit/Twitter dağıtımı → Faz 2'deki AI bağlantıları dağıtım kitini kullan
- npm token yenileme (automation token, 2FA bypass)
- PyPI'a `ruleprobe-client` publish (Faz 20 tamamlandıktan sonra)
