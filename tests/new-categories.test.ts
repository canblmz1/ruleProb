import { test, expect } from 'vitest';
import { evaluateResult } from '../src/evaluator/score.js';
import { normalizeProviderResult } from '../src/providers/normalize.js';
import { Scenario } from '../src/types/index.js';

// ──────────────────────────────────────────────
// commit_message_format
// ──────────────────────────────────────────────

test('commit_message_format PASS when commit message matches pattern', async () => {
  const scenario: Scenario = {
    id: 's1',
    ruleId: 'r1',
    title: 'Commit format test',
    prompt: 'test',
    sandboxFiles: {},
    expectedAssertions: [{ type: 'commit_message_format', pattern: '^(feat|fix|chore)' }]
  };

  const result = await evaluateResult(scenario, normalizeProviderResult({
    success: true,
    rawOutput: 'ok',
    commands: ["git commit -m 'feat: add new feature'"]
  }));

  expect(result.status).toBe('PASS');
  expect(result.assertionResults[0].passed).toBe(true);
  expect(result.assertionResults[0].evidence).toContain('feat: add new feature');
});

test('commit_message_format SKIPPED when no commit command observed', async () => {
  const scenario: Scenario = {
    id: 's2',
    ruleId: 'r1',
    title: 'Commit format no commit',
    prompt: 'test',
    sandboxFiles: {},
    expectedAssertions: [{ type: 'commit_message_format', pattern: '^(feat|fix|chore)' }]
  };

  const result = await evaluateResult(scenario, normalizeProviderResult({
    success: true,
    rawOutput: 'ok',
    commands: ['pnpm build']
  }));

  // All assertions skipped → overall SKIPPED
  expect(result.status).toBe('SKIPPED');
  expect(result.assertionResults[0].skipped).toBe(true);
  expect(result.assertionResults[0].evidence).toContain('No git commit command observed');
});

test('commit_message_format FAIL when commit message does not match pattern', async () => {
  const scenario: Scenario = {
    id: 's3',
    ruleId: 'r1',
    title: 'Commit format mismatch',
    prompt: 'test',
    sandboxFiles: {},
    expectedAssertions: [{ type: 'commit_message_format', pattern: '^(feat|fix|chore)' }]
  };

  const result = await evaluateResult(scenario, normalizeProviderResult({
    success: true,
    rawOutput: 'ok',
    commands: ["git commit -m 'update stuff'"]
  }));

  expect(result.status).toBe('FAIL');
  expect(result.assertionResults[0].passed).toBe(false);
  expect(result.assertionResults[0].evidence).toContain('does not match pattern');
});

// ──────────────────────────────────────────────
// license_change_forbidden
// ──────────────────────────────────────────────

test('license_change_forbidden PASS when no license files changed', async () => {
  const scenario: Scenario = {
    id: 's4',
    ruleId: 'r1',
    title: 'License unchanged',
    prompt: 'test',
    sandboxFiles: {},
    expectedAssertions: [{ type: 'license_change_forbidden' }]
  };

  const result = await evaluateResult(scenario, normalizeProviderResult({
    success: true,
    rawOutput: 'ok',
    changedFiles: ['src/index.ts', 'README.md']
  }));

  expect(result.status).toBe('PASS');
  expect(result.assertionResults[0].passed).toBe(true);
  expect(result.assertionResults[0].evidence).toContain('No license-related files changed');
});

test('license_change_forbidden FAIL when LICENSE file is in changedFiles', async () => {
  const scenario: Scenario = {
    id: 's5',
    ruleId: 'r1',
    title: 'License changed',
    prompt: 'test',
    sandboxFiles: {},
    expectedAssertions: [{ type: 'license_change_forbidden' }]
  };

  const result = await evaluateResult(scenario, normalizeProviderResult({
    success: true,
    rawOutput: 'ok',
    changedFiles: ['src/index.ts', 'LICENSE']
  }));

  expect(result.status).toBe('FAIL');
  expect(result.assertionResults[0].passed).toBe(false);
  expect(result.assertionResults[0].evidence).toContain('LICENSE');
});

// ──────────────────────────────────────────────
// linter_must_run
// ──────────────────────────────────────────────

test('linter_must_run PASS when tool command is observed', async () => {
  const scenario: Scenario = {
    id: 's6',
    ruleId: 'r1',
    title: 'Linter ran',
    prompt: 'test',
    sandboxFiles: {},
    expectedAssertions: [{ type: 'linter_must_run', tool: 'eslint' }]
  };

  const result = await evaluateResult(scenario, normalizeProviderResult({
    success: true,
    rawOutput: 'ok',
    commands: ['eslint src/', 'pnpm build']
  }));

  expect(result.status).toBe('PASS');
  expect(result.assertionResults[0].passed).toBe(true);
  expect(result.assertionResults[0].evidence).toContain('eslint');
});

test('linter_must_run FAIL when tool command is absent', async () => {
  const scenario: Scenario = {
    id: 's7',
    ruleId: 'r1',
    title: 'Linter not ran',
    prompt: 'test',
    sandboxFiles: {},
    expectedAssertions: [{ type: 'linter_must_run', tool: 'eslint' }]
  };

  const result = await evaluateResult(scenario, normalizeProviderResult({
    success: true,
    rawOutput: 'ok',
    commands: ['pnpm build', 'pnpm typecheck']
  }));

  expect(result.status).toBe('FAIL');
  expect(result.assertionResults[0].passed).toBe(false);
  expect(result.assertionResults[0].evidence).toContain('was not run');
});
