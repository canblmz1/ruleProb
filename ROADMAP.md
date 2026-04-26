# Roadmap

## v0.1 - Honest Public Beta

Goal:

- make RuleProbe believable enough to share publicly without misleading people

Ship in v0.1:

- diff- or file-content-grounded scoring for code patterns
- file-change evaluation based on actual extracted patterns
- benchmark exits non-zero on failure
- package cleanup and CLI install sanity
- report fixes: source file, line, category, escaped HTML
- README rewrite with one real proof-oriented demo

Why it matters:

- v0.1 is about trust, not surface area
- without this, launches may get attention but not retention
- release quality means proof-first docs, hard CI gates, and clean packaging

## v0.2 - Proof And Comparison

Goal:

- turn the repo from "interesting beta" into "useful team tool"

Shipped in v0.2:

- deterministic vs hybrid comparison mode
- provider capability matrix
- known-limitation block in reports
- richer benchmark corpus with more real instruction styles
- GitHub Action / CI integration for repo-level compliance checks
- one or two reproducible real-provider smoke demos

Why it matters:

- teams need comparable evidence, not just one score
- GitHub stars come from shareable artifacts and repeatable workflows

## v0.3 - Category Ownership

Goal:

- own the niche of testing repository AI instruction files

Shipped in v0.3:

- repo-native scenario generation templates by rule category
- improved report UX with diff snippets and grouped failures
- benchmark corpus governance and contribution guide
- public comparison examples across popular OSS repos
- stable extension points for additional providers or rule categories

Why it matters:

- this is where RuleProbe stops being a project and becomes the default reference tool for this problem space

## Not On The Roadmap

- SaaS dashboard
- auth or database work
- generic prompt-eval platform expansion
- "perfect enforcement" positioning
- broad product sprawl before scoring trust is solved
