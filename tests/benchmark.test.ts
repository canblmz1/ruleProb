import { test, expect } from 'vitest';
import { runDeterministicExtraction } from '../src/extractors/deterministic.js';
import { runBenchmark } from '../src/benchmark/run.js';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

test('extractRules on better-auth fixture', async () => {
  const content = await fs.readFile(path.resolve('benchmarks/fixtures/better-auth.CLAUDE.md'), 'utf-8');
  const rules = runDeterministicExtraction([{ path: 'better-auth.CLAUDE.md', content }]);

  expect(rules.length).toBeGreaterThanOrEqual(10);

  const categories = rules.map(rule => rule.category);
  expect(categories).toContain('package_manager');
  expect(categories).toContain('forbidden_command');
  expect(categories).toContain('required_command');

  const pkgManager = rules.find(rule => rule.category === 'package_manager');
  expect(pkgManager?.assertions[0].manager).toBe('pnpm');

  const forbidPnpmTest = rules.find(rule => rule.text.includes('pnpm test') && rule.category === 'forbidden_command');
  expect(forbidPnpmTest).toBeDefined();

  const reqVitest = rules.find(rule => rule.text.includes('vitest') && rule.category === 'required_command');
  expect(reqVitest).toBeDefined();

  const noAny = rules.find(rule => rule.category === 'code_pattern_forbidden' && rule.text.includes('any'));
  expect(noAny).toBeDefined();
});

test('extractRules on formatjs fixture', async () => {
  const content = await fs.readFile(path.resolve('benchmarks/fixtures/formatjs.CLAUDE.md'), 'utf-8');
  const rules = runDeterministicExtraction([{ path: 'format.md', content }]);

  const forbidClean = rules.find(rule => rule.category === 'forbidden_command' && rule.text.includes('bazel clean'));
  expect(forbidClean).toBeDefined();

  const reqBuild = rules.find(rule => rule.category === 'required_command' && rule.text.includes('bazel build'));
  expect(reqBuild).toBeDefined();
});

test('extractRules assigns sourceFile and lineNumber correctly', async () => {
  const content = '1\n2\n- ALWAYS use pnpm\n';
  const rules = runDeterministicExtraction([{ path: '/src/test.md', content }]);

  expect(rules[0].sourceFile).toBe('/src/test.md');
  expect(rules[0].lineNumber).toBe(3);
  expect(rules[0].rawLine).toBe('- ALWAYS use pnpm');
});

import { isCommandLike, validateCandidate } from '../src/extractors/validateCandidate.js';

test('isCommandLike evaluates shell boundaries properly', () => {
  expect(isCommandLike('pnpm test')).toBe(true);
  expect(isCommandLike('vitest foo')).toBe(true);
  expect(isCommandLike('git commit')).toBe(true);
  expect(isCommandLike('docker compose up')).toBe(true);

  expect(isCommandLike('Uint8Array')).toBe(false);
  expect(isCommandLike('import type')).toBe(false);
  expect(isCommandLike('node:crypto')).toBe(false);
  expect(isCommandLike('feat(scope):')).toBe(false);
});

test('validateCandidate rejects noisy non-command candidates', () => {
  const rejected = validateCandidate({
    id: '1', text: 'use Uint8Array', category: 'required_command', testable: true,
    sourceFile: 'f', lineNumber: 1, assertions: [{ type: 'required_command', commandIncludes: 'Uint8Array' }]
  } as any);
  expect(rejected.valid).toBe(false);

  const accepted = validateCandidate({
    id: '1', text: 'run typecheck', category: 'required_command', testable: true,
    sourceFile: 'f', lineNumber: 1, assertions: [{ type: 'required_command', commandIncludes: 'pnpm typecheck' }]
  } as any);
  expect(accepted.valid).toBe(true);

  const gitCommitAllowed = validateCandidate({
    id: '1', text: 'do not commit', category: 'forbidden_command', testable: true,
    sourceFile: 'f', lineNumber: 1, assertions: [{ type: 'forbidden_command', commandIncludes: 'git commit' }]
  } as any);
  expect(gitCommitAllowed.valid).toBe(true);

  const informationalRejectedWhenTestableTrue = validateCandidate({
    id: '1', text: 'docs:', category: 'informational', testable: true,
    sourceFile: 'f', lineNumber: 1, assertions: []
  } as any);
  expect(informationalRejectedWhenTestableTrue.valid).toBe(false);
});

import { routeExtraction } from '../src/extractors/merge.js';
import { compareDeterministicToHybrid, formatRuleComparison } from '../src/compare/extraction.js';

test('hybrid routing strips deterministic noise like Uint8Array and Buffer commands', async () => {
  const config = { extractor: 'hybrid', provider: 'openrouter', providerTimeoutMs: 100 };
  const originalKey = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY;

  try {
    const content = await fs.readFile(path.resolve('benchmarks/fixtures/better-auth.CLAUDE.md'), 'utf-8');
    const rules = await routeExtraction([{ path: 'better-auth.CLAUDE.md', content }], config);

    const hasUintCommand = rules.find(rule => rule.category === 'required_command' && rule.text.includes('Uint8Array'));
    expect(hasUintCommand).toBeUndefined();

    const hasBufferCommand = rules.find(rule => rule.category === 'required_command' && rule.text.includes('Buffer'));
    expect(hasBufferCommand).toBeUndefined();

    const validCommand = rules.find(rule => rule.category === 'required_command' && rule.text.includes('vitest'));
    expect(validCommand).toBeDefined();

    const validPackage = rules.find(rule => rule.category === 'package_manager' && rule.text.toLowerCase().includes('pnpm'));
    expect(validPackage).toBeDefined();
  } finally {
    if (originalKey) process.env.OPENROUTER_API_KEY = originalKey;
  }
});

test('hybrid extraction repairs deterministic errors and deduplicates output', async () => {
  const config = { extractor: 'hybrid', provider: 'openrouter', providerTimeoutMs: 100, showInformational: false };
  const originalKey = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY;

  try {
    const content = `- ALWAYS use \`pnpm\`. Never use npm or yarn.
- DO NOT COMMIT unless the user explicitly asks.
- Conventional Commits: feat(scope):
- NEVER run \`pnpm test\`.
- NEVER run \`pnpm test\`.`;
    const rules = await routeExtraction([{ path: 'better-auth.CLAUDE.md', content }], config);

    const pkgRules = rules.filter(rule => rule.category === 'package_manager');
    expect(pkgRules.length).toBeGreaterThan(0);

    const commitRules = rules.filter(rule => rule.category === 'forbidden_command' && rule.text.includes('COMMIT'));
    expect(commitRules.length).toBeGreaterThan(0);

    const duplicatePnpmTest = rules.filter(rule => rule.text.includes('NEVER run `pnpm test`'));
    expect(duplicatePnpmTest.length).toBe(1);
  } finally {
    if (originalKey) process.env.OPENROUTER_API_KEY = originalKey;
  }
});

test('comparison mode reports deterministic and hybrid deltas with cleaned noise', async () => {
  const originalKey = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY;

  try {
    const content = `- ALWAYS use \`pnpm\`. Never use npm or yarn.
- Conventional Commits: feat(scope):
- NEVER run \`pnpm test\`.
- Use \`Uint8Array\` for binary data.`;

    const comparison = await compareDeterministicToHybrid(
      [{ path: 'CLAUDE.md', content }],
      { provider: 'openrouter', extractor: 'hybrid', reportDir: '', instructionFiles: [], failBelow: 0, keepSandbox: false }
    );
    const text = formatRuleComparison(comparison);

    expect(text).toContain('Rules extracted: deterministic=');
    expect(text).toContain('Category deltas:');
    expect(text).toContain('Rules only in deterministic:');
    expect(text).toContain('Rules only in hybrid:');
    expect(text).toContain('Notable cleaned noise / repaired categories:');
  } finally {
    if (originalKey) process.env.OPENROUTER_API_KEY = originalKey;
  }
});

test('deterministic extraction does not treat code patterns as commands on fern fixture', async () => {
  const content = await fs.readFile(path.resolve('benchmarks/fixtures/fern.CLAUDE.md'), 'utf-8');
  const rules = runDeterministicExtraction([{ path: 'fern.CLAUDE.md', content }]);

  const importTypeCommand = rules.find(rule => rule.category === 'required_command' && rule.text.includes('import type'));
  const requireCommand = rules.find(rule => rule.category === 'forbidden_command' && rule.text.includes('require()'));

  expect(importTypeCommand).toBeUndefined();
  expect(requireCommand).toBeUndefined();
});

test('runBenchmark fails when any repo fails and counts missing fixtures in totals', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ruleprobe-benchmark-'));

  await fs.ensureDir(path.join(tmpDir, 'benchmarks'));
  await fs.writeJson(path.join(tmpDir, 'benchmarks', 'corpus.json'), {
    repos: [
      {
        name: 'missing-fixture',
        fixture: 'benchmarks/fixtures/missing.md',
        expected: {
          minRules: 1,
          categories: ['required_command'],
          mustContain: []
        }
      }
    ]
  }, { spaces: 2 });

  try {
    await expect(runBenchmark({ fixturesOnly: true, cwd: tmpDir })).rejects.toThrow('Benchmark failed');
    const report = await fs.readJson(path.join(tmpDir, '.ruleprobe', 'benchmark.json'));
    expect(report.tested).toBe(1);
    expect(report.failed).toBe(1);
    expect(report.coverage).toBe(0);
  } finally {
    await fs.remove(tmpDir);
  }
});
