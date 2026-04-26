# Security Policy

RuleProbe is a public beta CLI for measuring repository AI instruction compliance. It creates disposable sandboxes and executes only bounded provider actions, but real provider runs still involve model-generated file and command requests.

## Supported Use

- Prefer `mock` and `dry-run` for CI and demos.
- Use API providers only with repositories and credentials you are comfortable testing.
- Keep API keys in environment variables or `.env`; do not commit them.
- Review `.ruleprobe/` artifacts before sharing logs. Extractor raw responses are sanitized for common API key formats, but logs can still contain repository-sensitive text.
- Treat reports as measurement artifacts, not as a security control or policy enforcement guarantee.

## Runtime Protections

RuleProbe blocks:

- absolute paths and path traversal
- writes to `.git`, `.ruleprobe`, and `node_modules`
- dangerous shell commands such as shell downloads, privilege changes, and destructive filesystem commands
- long-running allowed commands via action timeouts

These protections reduce risk; they do not make arbitrary agent execution perfectly safe.

## Trust Model

- Code-pattern assertions are evaluated from actual changed sandbox file contents, not from provider prose alone.
- File-change assertions are evaluated against the extracted path or glob pattern where possible.
- Provider failures and missing credentials should appear as explicit failures or skipped results, not as fake compliance.
- Reports include Known Limitations so consumers can distinguish mock, dry-run, fallback extraction, skipped execution, and provider failures.
- Report snippets are short evidence excerpts, not complete source archives; review artifacts before sharing them publicly.
- Fixture benchmarks are a regression gate for extraction behavior. They are not proof of universal semantic correctness.

## Reporting Issues

Open an issue with:

- RuleProbe version or commit
- provider and extractor mode
- command used
- sanitized report/debug output
- expected versus actual behavior

Do not include API keys, private repository contents, or provider secrets.
