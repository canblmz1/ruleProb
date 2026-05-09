# Patch Plan

> Generated: 2026-04-27
> Workstream: security
> Scope: ruleProb (RuleProbe CLI)

This plan documents the security findings discovered during the planner pass and
the safest, smallest patches to land. Each finding has an ID, severity, exact
file/line citations, and a bounded patch outline. No code is being modified by
the planner — these are proposals for the implementer agent.

---

## Finding Summary

| ID     | Severity | Title                                                                  | Selected for next task |
|--------|----------|------------------------------------------------------------------------|------------------------|
| SEC-001 | P1 High  | Command-injection bypass in action executor via shell metacharacters   | YES                    |
| SEC-002 | P2 Med   | Gemini provider rawOutput is not redacted before being returned/logged | NO (follow-up)         |
| SEC-003 | P2 Med   | Gemini API key transmitted as URL query string instead of header       | NO (follow-up)         |
| SEC-004 | P3 Low   | Sandbox is a temp directory, not an OS-level isolation boundary        | NO (doc-only)          |

---

## SEC-001 — Command-injection bypass in action executor

**Severity:** P1 (High)
**Files:**
- src/actions/execute.ts:65–84 (run_command branch, `executeSingleAction`)
- src/actions/execute.ts:112 (`FORBIDDEN_CMD_REGEX`)
- src/actions/execute.ts:114–134 (`isCommandAllowed`)
**Reachable from:** every action-bridge provider that calls `executeActionPlan`:
- src/providers/gemini.ts:122
- src/providers/openrouter.ts:103
- src/providers/opencodeGo.ts:145

### What is wrong

`executeSingleAction` runs untrusted LLM-produced commands with shell semantics:

```ts
await execa(action.command, { shell: true, cwd: sandboxDir, timeout, reject: false });
```

The gate in front of this call is `isCommandAllowed`, which does:
1. Reject if the string matches `FORBIDDEN_CMD_REGEX` (rm/sudo/curl/wget/bash/sh/...).
2. Otherwise require the string to start with one of an allow list of prefixes
   (e.g. `^pnpm test\b`, `^vitest\b`, `^npm run build\b`, ...).

Because `shell: true` lets the shell interpret the rest of the string, a prompt-
injected or jailbroken model can craft commands that satisfy the allow-list
prefix and then chain something else past the deny list. Concrete bypasses:

- `pnpm test && node -e "require('fs').writeFileSync(process.env.HOME+'/.bashrc','x')"`
  — `node` is not on the deny list. `pnpm test` matches the allow prefix.
- `pnpm test > $HOME/.bashrc`
  — no forbidden token; redirection writes outside the sandbox cwd.
- ``pnpm test `whoami` `` or `pnpm test $(echo PWN)`
  — command substitution executes attacker-controlled subcommand.
- `pnpm test || python -c "import os,urllib.request; ..."`
  — `python` is not on the deny list.

The deny list also misses: `node`, `python`, `python3`, `perl`, `ruby`, `awk`,
`tee`, `cat`, `mv`, `cp`, `tar`, `zip`, `find`, `xargs`, `env`, `eval`, `exec`,
`make`, `cmake`. Any of these with `-e`, `-c`, or output redirection is an
exfil/destruction primitive. Because the sandbox `cwd` is just a temp dir
(src/sandbox/create.ts:9) and not an OS sandbox, the spawned shell inherits the
user's environment and can read/write anywhere on disk the user can.

### Threat model

- Untrusted LLM output is the source of `action.command`.
- Trigger paths: any user running `ruleprobe run` against a repository that
  includes (directly or transitively) an instruction file with adversarial
  content, OR any user pointing the tool at a freshly compromised provider/key.
- Impact: arbitrary code execution as the user invoking `ruleprobe`. On a dev
  machine that means access to git credentials, ssh keys, and any other API
  keys in the environment, plus the ability to modify dotfiles for persistence.

### Fix

Defense in depth — apply both:

**1. Reject shell metacharacters in `isCommandAllowed`.**
Add a metacharacter check at the top so the allow-list prefix actually means
something. Reject any command containing any of:

```
; & | < > $ ` \ ( ) { } [ ] * ? ~ ! \n \r \t (multiple) \\
```

Reasoning: every allow-listed command is a single shell word optionally followed
by simple `--flag` / `value` arguments; none of them legitimately need shell
operators, redirection, substitution, globbing, or process control.

**2. Switch to `shell: false` and tokenize on whitespace.**
Once metacharacters are gone, splitting on `/\s+/` and passing
`execa(parts[0], parts.slice(1), { cwd, timeout, reject: false })` is safe and
removes the residual shell layer entirely. This blocks any future deny-list
miss because nothing is interpreted by the shell.

**3. Extend `FORBIDDEN_CMD_REGEX` to add `node`, `python`, `python3`, `perl`,
`ruby`, `awk`, `eval`, `exec`, `tee`, `xargs`.**
Belt and braces, in case a future maintainer reintroduces shell mode for some
allowed command.

### Tests to add (tests/instructions.test.ts)

Extend the existing `executeActionPlan blocks dangerous maneuvers` test (line
203) to also assert that each of the following is blocked and reports an error:

- `pnpm test && node -e "process.exit(1)"`
- `pnpm test ; rm -rf .git`
- `pnpm test > /tmp/leak`
- `pnpm test $(echo x)`
- `` pnpm test `echo x` ``
- `pnpm test | tee /tmp/leak`
- `pnpm test\nrm -rf .git` (newline injection)

### Acceptance criteria

- Existing test `executeActionPlan blocks dangerous maneuvers and handles success paths` still passes.
- New metacharacter-bypass cases are blocked and surfaced via `result.errors`
  and `result.commands` (`BLOCKED: …` entries).
- Plain `pnpm test`, `pnpm typecheck`, `pnpm build`, `vitest`, `npm test`
  still execute via `execa` with `shell: false`.
- `pnpm test` and `pnpm build` continue to pass.

### Rollback plan

Single-file change confined to src/actions/execute.ts plus tests. Revert by
git revert of the commit; no data migrations or persisted state involved.

---

## SEC-002 — Gemini provider does not redact API responses before logging

**Severity:** P2 (Medium)
**Files:** src/providers/gemini.ts:97 (`rawOutput += ...jsonText`)

The other action-bridge providers (src/providers/claudeCode.ts:84
`sanitizeOutput`, src/providers/opencodeGo.ts:189 `sanitizeProviderText`) run
their stdout/response text through a redactor before returning it. The Gemini
provider does not — it concatenates the raw response body into `rawOutput`,
which is then surfaced through the reporters and may end up in `report.json`,
markdown reports, and HTML reports. If a future Gemini error response includes
the API key fragment or any echoed env-var assignment, it will be persisted.

**Fix:** Reuse the existing `sanitizeProviderText` helper (already exported
shape exists in src/extractors/aiAssisted.ts:394 and src/providers/opencodeGo.ts:189)
in src/providers/gemini.ts when assembling `rawOutput`. Either lift it into a
small shared utility or duplicate the small regex-set inline in `gemini.ts`.

**Tests:** Add a unit test that injects a fake `OPENROUTER_API_KEY=sk-...`
substring into the response body and asserts it is `[REDACTED]` in the result.

---

## SEC-003 — Gemini API key in URL query string

**Severity:** P2 (Medium)
**Files:**
- src/providers/gemini.ts:70 (`?key=${apiKey}`)
- src/extractors/aiAssisted.ts:225 (`?key=${profile.apiKey}`)

Putting the key in the URL is the historical Gemini pattern, but it shows up in
process listings, `fetch`-error stacks (which embed the URL), HTTP proxy logs,
and any `console.log(error)` path. Google supports `x-goog-api-key` as a header
alternative for the same `generateContent` endpoint.

**Fix:** Send the key via `headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' }`
and drop `?key=` from the URL in both files.

**Tests:** Update the existing Gemini test to assert the header is sent and the
URL does not contain `?key=`.

---

## SEC-004 — Sandbox is a temp directory, not OS-level isolation

**Severity:** P3 (Low — documentation/expectations only)
**Files:** src/sandbox/create.ts:7–36

`createSandbox` makes a directory under `os.tmpdir()` and sets it as `cwd` for
the spawned provider. This is a *workspace*, not a sandbox — there is no
process, network, or filesystem isolation. Once SEC-001 is patched the
realistic blast radius is reduced, but a determined adversarial prompt can
still e.g. `npm run build` a compromised script from the seeded sandbox files.

**Fix:** Documentation only for now. Add a short "Sandbox guarantees and
limits" section to README.md and to docs/extensions.md noting that the sandbox
is filesystem-scoped, not process/OS-scoped, and recommending users run inside
firejail / sandbox-exec / container when evaluating untrusted instruction
sources. Out of scope for this run; logged for follow-up.

---

## Order of work

1. SEC-001 — patch executor and add bypass tests. **Selected for this run.**
2. SEC-002 — wire `sanitizeProviderText` into `gemini.ts`. (~15 min, low risk.)
3. SEC-003 — move Gemini key to header. (~15 min, low risk; verify upstream.)
4. SEC-004 — README/docs update. (Doc-only follow-up.)
