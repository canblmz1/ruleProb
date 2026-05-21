#!/bin/sh
# RuleProbe pre-commit hook
# Runs extraction-only check (dry-run) before every commit.
# Fails commit if compliance score drops below threshold.
#
# Install: cp .husky/pre-commit.ruleprobe .husky/pre-commit && chmod +x .husky/pre-commit
# Or add to existing .husky/pre-commit:
#   npx ruleprobe-ai run . --provider dry-run --extractor deterministic --fail-below 0

npx ruleprobe-ai run . --provider dry-run --extractor deterministic --fail-below 0
