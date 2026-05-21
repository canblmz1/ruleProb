# RuleProbe OSS Leaderboard

_Generated: 2026-05-21_

Extraction quality across popular AI instruction files.
Score = % of expected rules successfully extracted by the deterministic extractor.

| Repo | File | Rules | Categories | Score |
|------|------|------:|------------|------:|
| team-monorepo-style | `AGENTS.md` | 14 | package_manager, forbidden_command, required_command, forbidden_file_change, required_file_change, code_pattern_forbidden, code_pattern_required | 🟢 100% |
| [better-auth](https://github.com/better-auth/better-auth.git) | `CLAUDE.md` | 10 | package_manager, forbidden_command, required_command, code_pattern_forbidden, code_pattern_required, required_file_change | 🟢 100% |
| copilot-workflow-style | `.github/copilot-instructions.md` | 8 | package_manager, forbidden_command, required_command, forbidden_file_change, final_answer_required | 🟢 100% |
| [fern](https://github.com/fern-api/fern.git) | `CLAUDE.md` | 3 | code_pattern_forbidden, code_pattern_required | 🟢 100% |
| [mastra](https://github.com/mastra-ai/mastra.git) | `AGENTS.md` | 3 | forbidden_command, required_command | 🟢 100% |
| [formatjs](https://github.com/formatjs/formatjs.git) | `CLAUDE.md` | 2 | forbidden_command, required_command | 🟢 100% |
| [restatedev](https://github.com/restatedev/sdk-typescript.git) | `AGENTS.md` | 2 | forbidden_command, required_command | 🟢 100% |

> Run `ruleprobe leaderboard` to regenerate with your local fixtures.
