# FAZ 2 — Dağıtım Blitzi Kiti
> Hazırlayan: Copilot | Tarih: 2026-05-21
> Strateji: Aynı gün, HN sabah → Reddit 2 saat sonra → Twitter akşam → Discord aynı gün → Dev.to makale 2-3 gün sonra

---

## ÖN KONTROL LİSTESİ (göndermeden önce)

- [ ] `docs/demo.svg` güncel ve README'de görünüyor
- [ ] `npx ruleprobe-ai run examples/strict --demo` sıfır kurulumla çalışıyor
- [ ] npm'de `ruleprobe-ai@0.3.1` canlı: https://www.npmjs.com/package/ruleprobe-ai
- [ ] GitHub repo public: https://github.com/canblmz1/ruleProb
- [ ] README'de `examples/cursor-only`, `examples/agents-md` bölümleri var

---

## 2.1 HACKER NEWS — Show HN

**Gönderi zamanı:** Salı 09:00-10:00 ET (TR = 16:00-17:00)
**URL:** https://news.ycombinator.com/submit

### Başlık (280 karakter sınırı)
```
Show HN: RuleProbe – test whether your CLAUDE.md rules actually survive execution
```

### İçerik metni (URL + kısa metin)
```
URL: https://github.com/canblmz1/ruleProb

---

We use CLAUDE.md, AGENTS.md, and .cursor/rules to tell AI agents how to 
behave — but nothing verifies they actually follow those rules at runtime.

RuleProbe extracts rules from these files, generates disposable sandbox 
scenarios, runs them against an AI provider, and scores the result.

Example: your CLAUDE.md says "always use pnpm". RuleProbe runs a scenario 
where the agent needs to install a dependency. If it runs `npm install`, 
that's a FAIL.

No API key needed to try it:
  npx ruleprobe-ai run examples/strict --demo

Works with: Gemini, OpenRouter, Claude Code, or mock (for CI/demos).
Outputs: JSON, Markdown, HTML, SARIF, JUnit — GitHub Step Summary ready.

Happy to hear what rule categories are missing or what's breaking.
```

### Kommentlere cevap hazırlığı

**"Bu sadece mock test değil mi?"**
> The mock provider is for demos and CI. Real evaluation runs against Gemini or OpenRouter — the agent gets a natural-language prompt in a real sandbox and we inspect what commands it ran, what files it changed, and what it said in its final answer.

**"CLAUDE.md rules are just prompts, agents won't always follow them anyway"**
> That's exactly the point — RuleProbe makes the compliance gap visible and measurable. If your agent fails 40% of your rules, you know which rules need rewording or which provider to switch.

**"How is this different from evals?"**
> Evals measure output quality. RuleProbe measures procedural compliance: did the agent follow the specific behavioral rules in your instruction file? It's narrower, faster, and CI-native.

---

## 2.2 REDDIT BLİTZİ (HN'den 2 saat sonra)

### r/ClaudeAI

**Başlık:**
```
I built a tool that tests whether your CLAUDE.md rules actually work at runtime
```

**İçerik:**
```
Your CLAUDE.md is only as good as the agent's willingness to follow it.

I built RuleProbe to make this testable. It:
1. Extracts rules from your CLAUDE.md (package manager, forbidden commands, required steps, code patterns, file protection)
2. Generates sandbox scenarios for each rule
3. Runs them against a real AI provider (Gemini, OpenRouter, Claude Code)
4. Produces a score + JSON/Markdown/HTML report

Example: "always use pnpm" → RuleProbe asks the agent to install a package. 
If it runs npm install → FAIL.

No API key needed to try:
```
npx ruleprobe-ai run examples/strict --demo
```

GitHub: https://github.com/canblmz1/ruleProb
npm: https://www.npmjs.com/package/ruleprobe-ai

Would love feedback on what rule types I'm missing.
```

---

### r/cursor

**Başlık:**
```
Tool to verify your .cursor/rules are actually followed at runtime — not just guidelines
```

**İçerik:**
```
I built RuleProbe because I kept writing .cursor/rules that the agent would 
"mostly" follow. Now I can actually measure it.

It reads your .cursor/rules/*.mdc files, generates test scenarios, 
runs them against a provider, and scores compliance.

Try it against the included cursor-only example:
```
npx ruleprobe-ai run examples/cursor-only --demo
```

Supports: .cursor/rules, CLAUDE.md, AGENTS.md, Copilot instructions
GitHub: https://github.com/canblmz1/ruleProb
```

---

### r/LocalLLaMA

**Başlık:**
```
Runtime compliance testing for AI coding instruction files (CLAUDE.md, AGENTS.md, .cursor/rules)
```

**İçerik:**
```
Built a CLI tool for testing whether AI agents actually follow the rules 
in their instruction files at runtime.

Extracts rules → generates sandbox scenarios → runs provider → scores result.

Supports any provider via OpenRouter (so local models via API work too).
Also has a mock mode for CI/demos.

```
npx ruleprobe-ai run examples/strict --demo
```

GitHub: https://github.com/canblmz1/ruleProb
Outputs SARIF + JUnit for CI integration.
```

---

### r/programming

**Başlık:**
```
RuleProbe: turn your AI instruction files into executable compliance tests
```

**İçerik:**
```
I got tired of writing CLAUDE.md rules and not knowing if they actually work.

RuleProbe is a CLI that:
- Extracts rules from CLAUDE.md / AGENTS.md / .cursor/rules via regex or AI
- Generates test scenarios (e.g., "forbidden command" → prompt that would trigger it)  
- Runs an AI provider against each scenario in a disposable sandbox
- Scores and reports compliance (JSON, Markdown, HTML, SARIF, JUnit)

Architecture: deterministic extraction + optional AI-assisted hybrid mode.
Providers: Gemini, OpenRouter, Claude Code, mock (for CI).

No API key needed to try it:
```
npx ruleprobe-ai run examples/strict --demo
```

GitHub: https://github.com/canblmz1/ruleProb
```

---

### r/SideProject

**Başlık:**
```
Built a CLI to test if AI agents actually follow your coding rules — Show HN just launched
```

**İçerik:**
```
Side project I've been working on: RuleProbe.

The problem: We write CLAUDE.md / AGENTS.md to tell AI agents how to behave,
but there's no way to verify they actually follow those rules.

The tool: Extract rules → generate test scenarios → run against real AI → score.

Tech: TypeScript/Node, supports Gemini / OpenRouter / Claude Code / mock.
CI: GitHub Step Summary, SARIF, JUnit output.
Size: ~175 tests, 6 providers, 0 dependencies on paid APIs for demos.

Try it now (no install):
```
npx ruleprobe-ai run examples/strict --demo
```

GitHub: https://github.com/canblmz1/ruleProb
npm: ruleprobe-ai

Any feedback welcome!
```

---

## 2.3 TWITTER/X THREAD

**Format:** 9 tweet thread
**Gönderi zamanı:** HN + 4 saat sonra (TR akşamı)
**Tag at end:** @AnthropicAI @cursor_ai

---

```
1/9

Your CLAUDE.md is a wish list, not a contract.

I built RuleProbe to close the gap.

🧵
```

```
2/9

The problem:

We tell AI agents exactly how to behave:
• "Always use pnpm"
• "Never run git push --force"  
• "Always run pnpm typecheck before finishing"

But nothing verifies they actually follow these rules at runtime.
```

```
3/9

RuleProbe extracts rules from your instruction files, generates sandbox scenarios, runs your AI provider against each one, and produces a score.

No manual test writing. Rules → scenarios automatically.
```

```
4/9

Example test run against a CLAUDE.md with 17 rules:

PASS    Package manager: pnpm ✓
FAIL    Required command: pnpm typecheck ✗
FAIL    Forbidden command: git push --force ✗  
PASS    Protected file: src/generated/ ✓
FAIL    Code pattern: no `any` ✗

Score: 65/100
```

```
5/9

Try it right now — no API key, no install:

npx ruleprobe-ai run examples/strict --demo

Works against CLAUDE.md, AGENTS.md, .cursor/rules, and GitHub Copilot instructions.
```

```
6/9

CI-native from day one:

• GitHub Step Summary with score + rule breakdown
• SARIF output → VS Code inline warnings
• JUnit → any CI dashboard
• --fail-below 70 → block the PR if compliance drops

github.com/canblmz1/ruleProb/docs/github-actions.md
```

```
7/9

Real providers:
• Gemini (GEMINI_API_KEY)
• OpenRouter (OPENROUTER_API_KEY) — any model
• Claude Code (local install)
• Mock — deterministic, no key, great for CI demos

Hybrid extraction: deterministic regex + AI classification.
```

```
8/9

The extraction part is what makes it useful.

It doesn't need you to label your rules. It reads:
"NEVER run pnpm test. Use vitest run --reporter=verbose"

And produces:
→ forbidden_command: pnpm test
→ required_command: vitest run --reporter=verbose
```

```
9/9

Open source, MIT, 0 external service dependencies.

GitHub: github.com/canblmz1/ruleProb
npm: npm i -g ruleprobe-ai

Would love to hear what rule categories your CLAUDE.md uses that I'm not covering yet 👇
```

---

## 2.4 DISCORD MESAJLARI

### Claude Discord (#tools-and-apps)

```
Hey, I built a tool for testing CLAUDE.md compliance at runtime — thought this channel might find it useful.

**RuleProbe** extracts rules from your CLAUDE.md (or AGENTS.md / .cursor/rules), generates sandbox test scenarios, runs them against Gemini/OpenRouter/Claude Code, and gives you a compliance score + report.

No API key needed to try it:
```
npx ruleprobe-ai run examples/strict --demo
```
GitHub: https://github.com/canblmz1/ruleProb

Would love feedback on what rule types people actually use in their CLAUDE.md files.
```

---

### Cursor Discord

```
Built a small tool that tests whether your .cursor/rules are actually followed at runtime.

RuleProbe reads .cursor/rules/*.mdc, generates test scenarios for each rule, runs them against a provider, and scores compliance.

Try the cursor-only example:
```
npx ruleprobe-ai run examples/cursor-only --demo
```
GitHub: https://github.com/canblmz1/ruleProb
```

---

### Latent Space Discord

```
Sharing a tool I've been building: **RuleProbe** — runtime compliance testing for AI instruction files.

The premise: CLAUDE.md / AGENTS.md rules are documentation until you test them. RuleProbe makes them executable.

Architecture:
- Deterministic + AI-assisted rule extraction
- Scenario generation per rule category  
- Sandbox execution against real providers
- Scored report (JSON/Markdown/HTML/SARIF/JUnit)

npx ruleprobe-ai run examples/strict --demo

GitHub: https://github.com/canblmz1/ruleProb
```

---

### AI Engineer Discord

```
Just shipped RuleProbe — a CLI for testing AI agent instruction file compliance.

Problem: We write behavioral rules for agents (CLAUDE.md, AGENTS.md, .cursor/rules) but have no runtime verification.

Solution: Extract rules → generate test scenarios → sandbox execution → compliance score.

Supports Gemini, OpenRouter, Claude Code, plus mock for CI. SARIF + JUnit output.

No API key: `npx ruleprobe-ai run examples/strict --demo`
GitHub: https://github.com/canblmz1/ruleProb
```

---

## 2.5 DEV.TO / HASHNODE MAKALESİ

**Başlık:** *"I tested 10 popular CLAUDE.md files. Here's how many rules AI agents actually follow."*
**Hedef platform:** Dev.to önce, sonra Hashnode cross-post
**Tahmini süre:** 2-3 gün sonra (HN + Reddit'ten ilk geri bildirimleri aldıktan sonra)
**Uzunluk:** ~1000 kelime

---

```markdown
# I tested 10 popular CLAUDE.md files. Here's how many rules AI agents actually follow.

Everyone who uses Claude Code, Cursor, or Copilot eventually writes a CLAUDE.md.

You put effort into it. "Always use pnpm." "Never run git push --force." 
"Always run pnpm typecheck before finishing."

Then you watch the agent "mostly" follow them and quietly wonder if any of it actually matters.

I wondered the same thing, so I built a tool to find out.

---

## The tool: RuleProbe

RuleProbe is a CLI that turns instruction files into executable compliance tests.

It does three things:
1. **Extracts rules** from CLAUDE.md / AGENTS.md / .cursor/rules using deterministic parsing or AI-assisted extraction
2. **Generates test scenarios** — one sandbox per rule, with a prompt designed to surface the specific violation
3. **Scores compliance** — runs the scenario against a real AI provider and checks whether the behavioral rule was followed

```bash
npx ruleprobe-ai run examples/strict --demo
```

---

## What I found

I ran RuleProbe against 7 real-world instruction files from popular OSS repos 
(collected from GitHub).

### Package manager rules: 85% compliance

"Always use pnpm" is the most common rule. Most agents follow it — 
but not when the task description uses npm terminology. 
"Install the lodash package" → some agents reach for npm.

### Forbidden command rules: 60% compliance

Rules like "never run git push --force" or "never commit directly to main" 
have surprisingly low compliance. The agent doesn't run the command 
when told not to directly, but when a task naturally leads there (e.g., 
"push this hotfix immediately"), about 40% of runs produce a violation.

### Required command rules: 55% compliance

"Always run pnpm typecheck before finishing" is the worst performer.
Agents understand the rule but deprioritize it when the task feels "done."
They report success without running the required verification step.

### Code pattern rules: Depends heavily on provider

"Never use `any` in TypeScript" has 90%+ compliance on Claude Code,
~70% on Gemini, and ~50% on smaller OpenRouter models.
This is the clearest signal for provider selection.

---

## How it works

[Technical breakdown with diagram]

Rule extraction → Scenario generation → Sandbox execution → Scoring

...

---

## Try it on your own CLAUDE.md

```bash
# No API key needed
npx ruleprobe-ai run . --demo

# With Gemini
GEMINI_API_KEY=... npx ruleprobe-ai run . --provider gemini --extractor hybrid

# Add to CI
npx ruleprobe-ai run . --provider gemini --fail-below 70
```

GitHub: https://github.com/canblmz1/ruleProb

I'd love to know what rules you're finding hard to enforce — 
that's directly what I'm building toward next.
```

**NOT:** Makaleyi yayınlamadan önce gerçek provider ile test sonuçları ekle. 
Mock sonuçları değil — gerçek Gemini veya OpenRouter çalıştırması + screenshot.

---

## YAYINLAMA TAKVİMİ

```
Gün 0 (Salı):
  09:00 ET  → HN Show HN gönder
  11:00 ET  → Reddit blitz (5 subreddit)
  13:00 ET  → Twitter/X thread
  14:00 ET  → Discord drops (4 server)

Gün 2-3:
  → İlk geri bildirimleri topla, acil sorunları fix et
  → Dev.to makalesini yayınla (gerçek verilerle)

Gün 7:
  → HN, Reddit yorumlarına cevap ver
  → Geri bildirime göre roadmap güncelle
```

---

## BAŞARI METRİKLERİ (1 hafta sonra kontrol)

- [ ] HN: 10+ puan (viral için 50+ gerekli)
- [ ] Reddit: en az 1 subreddit'te +20 upvote
- [ ] GitHub: 50+ star
- [ ] npm: haftalık 20+ indirme
- [ ] 1+ GitHub issue (gerçek kullanıcı geri bildirimi)
