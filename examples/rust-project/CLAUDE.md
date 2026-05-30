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
