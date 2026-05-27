import { test, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs-extra';
import os from 'os';
import { scanRepo } from '../src/advisor/repoScan.js';
import { mineHistory } from '../src/advisor/historyMiner.js';
import { suggestRules } from '../src/advisor/suggest.js';
import type { RepoScanResult, HistoryInsight } from '../src/advisor/types.js';
import type { Rule } from '../src/types/index.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rp-advisor-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ── scanRepo tests ────────────────────────────────────────────────────────────

test('scanRepo detects pnpm from pnpm-lock.yaml', async () => {
  await fs.writeFile(path.join(tmpDir, 'pnpm-lock.yaml'), 'lockfileVersion: "6.0"\n');
  const result = await scanRepo(tmpDir);
  expect(result.packageManager).toBe('pnpm');
  expect(result.hasLockfile).toBe(true);
});

test('scanRepo detects npm from package-lock.json', async () => {
  await fs.writeFile(path.join(tmpDir, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3 }));
  const result = await scanRepo(tmpDir);
  expect(result.packageManager).toBe('npm');
  expect(result.hasLockfile).toBe(true);
});

test('scanRepo detects yarn from yarn.lock', async () => {
  await fs.writeFile(path.join(tmpDir, 'yarn.lock'), '# yarn lockfile v1\n');
  const result = await scanRepo(tmpDir);
  expect(result.packageManager).toBe('yarn');
  expect(result.hasLockfile).toBe(true);
});

test('scanRepo returns hasLockfile false when no lockfile present', async () => {
  const result = await scanRepo(tmpDir);
  expect(result.hasLockfile).toBe(false);
  expect(result.packageManager).toBeNull();
});

test('scanRepo returns linters from package.json devDependencies', async () => {
  const pkgJson = {
    name: 'test-pkg',
    version: '1.0.0',
    devDependencies: {
      eslint: '^8.0.0',
      prettier: '^3.0.0',
    },
  };
  await fs.writeJson(path.join(tmpDir, 'package.json'), pkgJson);
  const result = await scanRepo(tmpDir);
  expect(result.linters).toContain('eslint');
  expect(result.linters).toContain('prettier');
});

test('scanRepo detects vitest test runner from devDependencies', async () => {
  const pkgJson = {
    name: 'test-pkg',
    version: '1.0.0',
    devDependencies: {
      vitest: '^2.0.0',
    },
    scripts: {
      test: 'vitest run',
    },
  };
  await fs.writeJson(path.join(tmpDir, 'package.json'), pkgJson);
  const result = await scanRepo(tmpDir);
  expect(result.testRunner).toBe('vitest');
});

test('scanRepo detects jest test runner from scripts', async () => {
  const pkgJson = {
    name: 'test-pkg',
    version: '1.0.0',
    devDependencies: {
      jest: '^29.0.0',
    },
    scripts: {
      test: 'jest',
    },
  };
  await fs.writeJson(path.join(tmpDir, 'package.json'), pkgJson);
  const result = await scanRepo(tmpDir);
  expect(result.testRunner).toBe('jest');
});

test('scanRepo returns null testRunner when no runner detected', async () => {
  const result = await scanRepo(tmpDir);
  expect(result.testRunner).toBeNull();
});

// ── mineHistory tests ─────────────────────────────────────────────────────────

test('mineHistory returns stable trend when no history.json exists (graceful)', async () => {
  const result = await mineHistory(tmpDir);
  expect(result.trend).toBe('stable');
  expect(result.totalRuns).toBe(0);
  expect(result.failureRate).toBe(0);
});

test('mineHistory handles malformed history.json gracefully', async () => {
  await fs.writeFile(path.join(tmpDir, 'history.json'), 'NOT JSON {{{{', 'utf-8');
  const result = await mineHistory(tmpDir);
  expect(result.trend).toBe('stable');
  expect(result.totalRuns).toBe(0);
});

test('mineHistory computes improving trend when recent scores higher', async () => {
  const history = [
    { timestamp: '2024-01-01T00:00:00Z', score: 50, weightedScore: 50, provider: 'mock', extractor: 'deterministic', totalRules: 5, passed: 2, partial: 1, failed: 2, skipped: 0 },
    { timestamp: '2024-01-02T00:00:00Z', score: 55, weightedScore: 55, provider: 'mock', extractor: 'deterministic', totalRules: 5, passed: 3, partial: 1, failed: 1, skipped: 0 },
    { timestamp: '2024-01-03T00:00:00Z', score: 80, weightedScore: 80, provider: 'mock', extractor: 'deterministic', totalRules: 5, passed: 4, partial: 1, failed: 0, skipped: 0 },
    { timestamp: '2024-01-04T00:00:00Z', score: 85, weightedScore: 85, provider: 'mock', extractor: 'deterministic', totalRules: 5, passed: 5, partial: 0, failed: 0, skipped: 0 },
  ];
  await fs.writeJson(path.join(tmpDir, 'history.json'), history);
  const result = await mineHistory(tmpDir);
  expect(result.trend).toBe('improving');
  expect(result.totalRuns).toBe(4);
});

test('mineHistory computes declining trend when recent scores lower', async () => {
  const history = [
    { timestamp: '2024-01-01T00:00:00Z', score: 90, weightedScore: 90, provider: 'mock', extractor: 'deterministic', totalRules: 5, passed: 5, partial: 0, failed: 0, skipped: 0 },
    { timestamp: '2024-01-02T00:00:00Z', score: 85, weightedScore: 85, provider: 'mock', extractor: 'deterministic', totalRules: 5, passed: 4, partial: 0, failed: 1, skipped: 0 },
    { timestamp: '2024-01-03T00:00:00Z', score: 70, weightedScore: 70, provider: 'mock', extractor: 'deterministic', totalRules: 5, passed: 3, partial: 0, failed: 2, skipped: 0 },
    { timestamp: '2024-01-04T00:00:00Z', score: 60, weightedScore: 60, provider: 'mock', extractor: 'deterministic', totalRules: 5, passed: 2, partial: 0, failed: 3, skipped: 0 },
  ];
  await fs.writeJson(path.join(tmpDir, 'history.json'), history);
  const result = await mineHistory(tmpDir);
  expect(result.trend).toBe('declining');
});

// ── suggestRules tests ────────────────────────────────────────────────────────

const defaultHistory: HistoryInsight = { failureRate: 0, trend: 'stable', totalRuns: 0 };

test('suggestRules suggests package_manager rule when lockfile present but no pm rule', () => {
  const scan: RepoScanResult = {
    packageManager: 'pnpm',
    testRunner: null,
    linters: [],
    frequentDirs: [],
    hasLockfile: true,
  };
  const suggestions = suggestRules(scan, defaultHistory, []);
  expect(suggestions.some(s => s.category === 'package_manager')).toBe(true);
  expect(suggestions.find(s => s.category === 'package_manager')?.severity).toBe('high');
  expect(suggestions.find(s => s.category === 'package_manager')?.text).toContain('pnpm');
});

test('suggestRules does NOT suggest package_manager rule when pm rule already exists', () => {
  const scan: RepoScanResult = {
    packageManager: 'pnpm',
    testRunner: null,
    linters: [],
    frequentDirs: [],
    hasLockfile: true,
  };
  const existingRules: Rule[] = [
    {
      id: 'r1',
      sourceFile: 'CLAUDE.md',
      text: 'Always use pnpm',
      category: 'package_manager',
      severity: 'high',
      testable: true,
      assertions: [{ type: 'package_manager_required', manager: 'pnpm' }],
    },
  ];
  const suggestions = suggestRules(scan, defaultHistory, existingRules);
  expect(suggestions.some(s => s.category === 'package_manager' && s.text.includes('pnpm') && !s.text.startsWith('Conflicting'))).toBe(false);
});

test('suggestRules suggests linter rule when eslint in linters but no linter rule exists', () => {
  const scan: RepoScanResult = {
    packageManager: null,
    testRunner: null,
    linters: ['eslint'],
    frequentDirs: [],
    hasLockfile: false,
  };
  const suggestions = suggestRules(scan, defaultHistory, []);
  expect(suggestions.some(s => s.category === 'linter_must_run')).toBe(true);
});

test('suggestRules does NOT suggest linter rule when linter_must_run rule already exists', () => {
  const scan: RepoScanResult = {
    packageManager: null,
    testRunner: null,
    linters: ['eslint'],
    frequentDirs: [],
    hasLockfile: false,
  };
  const existingRules: Rule[] = [
    {
      id: 'r2',
      sourceFile: 'CLAUDE.md',
      text: 'Run eslint before committing',
      category: 'linter_must_run',
      severity: 'medium',
      testable: true,
      assertions: [{ type: 'linter_must_run', tool: 'eslint' }],
    },
  ];
  const suggestions = suggestRules(scan, defaultHistory, existingRules);
  expect(suggestions.some(s => s.category === 'linter_must_run')).toBe(false);
});

test('suggestRules returns empty when no gaps found', () => {
  const scan: RepoScanResult = {
    packageManager: null,
    testRunner: null,
    linters: [],
    frequentDirs: [],
    hasLockfile: false,
  };
  const suggestions = suggestRules(scan, defaultHistory, []);
  expect(suggestions).toHaveLength(0);
});

test('suggestRules detects conflicting package_manager rules', () => {
  const scan: RepoScanResult = {
    packageManager: null,
    testRunner: null,
    linters: [],
    frequentDirs: [],
    hasLockfile: false,
  };
  const existingRules: Rule[] = [
    {
      id: 'r1',
      sourceFile: 'CLAUDE.md',
      text: 'Always use pnpm',
      category: 'package_manager',
      severity: 'high',
      testable: true,
      assertions: [{ type: 'package_manager_required', manager: 'pnpm' }],
    },
    {
      id: 'r2',
      sourceFile: 'AGENTS.md',
      text: 'Always use npm',
      category: 'package_manager',
      severity: 'high',
      testable: true,
      assertions: [{ type: 'package_manager_required', manager: 'npm' }],
    },
  ];
  const suggestions = suggestRules(scan, defaultHistory, existingRules);
  const conflictSuggestion = suggestions.find(s => s.category === 'package_manager' && s.text.includes('Conflicting'));
  expect(conflictSuggestion).toBeDefined();
  expect(conflictSuggestion?.severity).toBe('high');
});

test('suggestRules suggests required_command when test runner detected but no rule exists', () => {
  const scan: RepoScanResult = {
    packageManager: null,
    testRunner: 'vitest',
    linters: [],
    frequentDirs: [],
    hasLockfile: false,
  };
  const suggestions = suggestRules(scan, defaultHistory, []);
  expect(suggestions.some(s => s.category === 'required_command')).toBe(true);
  expect(suggestions.find(s => s.category === 'required_command')?.text).toContain('vitest');
});

test('suggestRules suggests forbidden_file_change for frequently-changed generated dirs', () => {
  const scan: RepoScanResult = {
    packageManager: null,
    testRunner: null,
    linters: [],
    frequentDirs: ['dist', 'src', 'tests'],
    hasLockfile: false,
  };
  const suggestions = suggestRules(scan, defaultHistory, []);
  expect(suggestions.some(s => s.category === 'forbidden_file_change')).toBe(true);
  expect(suggestions.find(s => s.category === 'forbidden_file_change')?.reason).toContain('dist');
});

// ── CLI command integration test ──────────────────────────────────────────────

test('advise command runs without error on empty directory', async () => {
  const { Command } = await import('commander');
  const { register } = await import('../src/cli/commands/advise.js');

  const logs: string[] = [];
  const origLog = console.log;
  console.log = (...args: unknown[]) => logs.push(args.join(' '));

  try {
    const program = new Command();
    program.exitOverride();
    register(program);
    await program.parseAsync(['node', 'test', 'advise', tmpDir]);
  } finally {
    console.log = origLog;
  }

  const output = logs.join('\n');
  expect(output).toContain('RuleProbe Advisor');
});

test('advise command --json outputs valid JSON', async () => {
  const { Command } = await import('commander');
  const { register } = await import('../src/cli/commands/advise.js');

  // Add a lockfile to trigger a suggestion
  await fs.writeFile(path.join(tmpDir, 'pnpm-lock.yaml'), 'lockfileVersion: "6.0"\n');

  const logs: string[] = [];
  const origLog = console.log;
  console.log = (...args: unknown[]) => logs.push(args.join(' '));

  try {
    const program = new Command();
    program.exitOverride();
    register(program);
    await program.parseAsync(['node', 'test', 'advise', tmpDir, '--json']);
  } finally {
    console.log = origLog;
  }

  const jsonOutput = logs.join('\n');
  const parsed = JSON.parse(jsonOutput);
  expect(parsed).toHaveProperty('scan');
  expect(parsed).toHaveProperty('history');
  expect(parsed).toHaveProperty('suggestions');
  expect(Array.isArray(parsed.suggestions)).toBe(true);
});

test('advise command writes suggestions.json and suggestions.md', async () => {
  const { Command } = await import('commander');
  const { register } = await import('../src/cli/commands/advise.js');

  const logs: string[] = [];
  const origLog = console.log;
  console.log = (...args: unknown[]) => logs.push(args.join(' '));

  try {
    const program = new Command();
    program.exitOverride();
    register(program);
    await program.parseAsync(['node', 'test', 'advise', tmpDir, '--report-dir', tmpDir]);
  } finally {
    console.log = origLog;
  }

  expect(await fs.pathExists(path.join(tmpDir, 'suggestions.json'))).toBe(true);
  expect(await fs.pathExists(path.join(tmpDir, 'suggestions.md'))).toBe(true);
});
