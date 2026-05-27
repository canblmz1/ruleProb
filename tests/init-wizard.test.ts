import { test, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs-extra';
import os from 'os';
import jsYaml from 'js-yaml';
import { runInitWizard, buildSeedYaml } from '../src/cli/commands/init.js';
import type { ClackAdapter, SeedRule } from '../src/cli/commands/init.js';

// ── fixtures / helpers ────────────────────────────────────────────────────────

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rp-wizard-'));
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

/** Build a ClackAdapter where confirm always returns the given value. */
function makeClack(confirmAnswer: boolean): ClackAdapter {
  return {
    intro: vi.fn(),
    outro: vi.fn(),
    confirm: vi.fn().mockResolvedValue(confirmAnswer),
    isCancel: vi.fn().mockReturnValue(false),
    cancel: vi.fn(),
  };
}

/** Minimal scanRepo stub — every field configurable. */
function makeScan(overrides: Partial<{
  packageManager: string | null;
  testRunner: string | null;
  linters: string[];
  frequentDirs: string[];
  hasLockfile: boolean;
}> = {}) {
  return async (_dir: string) => ({
    packageManager: overrides.packageManager ?? null,
    testRunner: overrides.testRunner ?? null,
    linters: overrides.linters ?? [],
    frequentDirs: overrides.frequentDirs ?? [],
    hasLockfile: overrides.hasLockfile ?? false,
  });
}

// ── Test 1: with detected package manager, seed-rules.yaml contains pm rule ──

test('--interactive with detected package manager writes seed-rules.yaml with pm rule', async () => {
  const clack = makeClack(true); // user says yes to all
  const scan = makeScan({ packageManager: 'pnpm', hasLockfile: true });

  const rules = await runInitWizard(tmpDir, clack, scan);

  // Write the YAML to disk (as the CLI action would do)
  const rpDir = path.join(tmpDir, '.ruleprobe');
  await fs.ensureDir(rpDir);
  const seedPath = path.join(rpDir, 'seed-rules.yaml');
  await fs.writeFile(seedPath, buildSeedYaml(rules), 'utf-8');

  expect(await fs.pathExists(seedPath)).toBe(true);

  const content = await fs.readFile(seedPath, 'utf-8');
  const parsed = jsYaml.load(content) as { rules: Array<{ text: string; category: string; severity: string }> };

  expect(Array.isArray(parsed.rules)).toBe(true);

  const pmRule = parsed.rules.find(r => r.category === 'package_manager');
  expect(pmRule).toBeDefined();
  expect(pmRule?.text).toContain('pnpm');
  expect(pmRule?.severity).toBe('high');
});

// ── Test 2: with no detected pm, no pm rule is generated ─────────────────────

test('--interactive with no package manager detected does not add pm rule', async () => {
  const clack = makeClack(true);
  const scan = makeScan({ packageManager: null }); // no pm detected

  const rules = await runInitWizard(tmpDir, clack, scan);

  const pmRule = rules.find(r => r.category === 'package_manager');
  expect(pmRule).toBeUndefined();
});

// ── Test 3: user confirms protection → forbidden_file_change rules added ──────

test('--interactive generates forbidden_file_change rules when user confirms protection', async () => {
  const clack = makeClack(true); // user says yes to protect dirs
  const scan = makeScan({});

  const rules = await runInitWizard(tmpDir, clack, scan);

  const forbiddenRules = rules.filter(r => r.category === 'forbidden_file_change');
  expect(forbiddenRules.length).toBeGreaterThanOrEqual(1);

  const texts = forbiddenRules.map(r => r.text);
  expect(texts.some(t => t.includes('dist/'))).toBe(true);
  expect(texts.some(t => t.includes('build/'))).toBe(true);
  expect(texts.some(t => t.includes('.next/'))).toBe(true);
});

// ── Test 4: seed-rules.yaml is valid YAML ─────────────────────────────────────

test('--interactive seed-rules.yaml is valid YAML that can be parsed', async () => {
  const clack = makeClack(true);
  const scan = makeScan({
    packageManager: 'pnpm',
    hasLockfile: true,
    linters: ['eslint'],
    testRunner: 'vitest',
  });

  const rules = await runInitWizard(tmpDir, clack, scan);
  const yaml = buildSeedYaml(rules);

  // Must be parseable YAML without throwing
  let parsed: unknown;
  expect(() => { parsed = jsYaml.load(yaml); }).not.toThrow();

  const doc = parsed as { rules: unknown[] };
  expect(Array.isArray(doc.rules)).toBe(true);
  expect(doc.rules.length).toBeGreaterThan(0);

  // Every rule must have text, category, severity
  for (const rule of doc.rules as Array<Record<string, unknown>>) {
    expect(typeof rule['text']).toBe('string');
    expect(typeof rule['category']).toBe('string');
    expect(['low', 'medium', 'high']).toContain(rule['severity']);
  }
});

// ── Test 5: non-interactive mode still creates ruleprobe.config.json ──────────

test('non-interactive mode (no --interactive flag) still creates ruleprobe.config.json', async () => {
  const { Command } = await import('commander');
  const { register } = await import('../src/cli/commands/init.js');
  const program = new Command();
  program.exitOverride();
  register(program);
  await program.parseAsync(['node', 'test', 'init', tmpDir]);

  const configPath = path.join(tmpDir, 'ruleprobe.config.json');
  expect(await fs.pathExists(configPath)).toBe(true);

  const config = await fs.readJson(configPath);
  expect(config.provider).toBe('mock');
  expect(config.failBelow).toBe(70);
  expect(Array.isArray(config.instructionFiles)).toBe(true);

  // Must NOT create seed-rules.yaml in non-interactive mode
  const seedPath = path.join(tmpDir, '.ruleprobe', 'seed-rules.yaml');
  expect(await fs.pathExists(seedPath)).toBe(false);
});

// ── Test 6: linter detected → linter_must_run rule added ─────────────────────

test('--interactive with linter detected adds linter_must_run rule', async () => {
  const clack = makeClack(true);
  const scan = makeScan({ linters: ['eslint'] });

  const rules = await runInitWizard(tmpDir, clack, scan);

  const linterRule = rules.find(r => r.category === 'linter_must_run');
  expect(linterRule).toBeDefined();
  expect(linterRule?.text).toContain('eslint');
});

// ── Test 7: user declines all → empty rules array ─────────────────────────────

test('--interactive with user declining all questions writes empty rules array', async () => {
  const clack = makeClack(false); // user says no to everything
  const scan = makeScan({ packageManager: 'pnpm', hasLockfile: true });

  const rules = await runInitWizard(tmpDir, clack, scan);

  expect(rules).toHaveLength(0);

  // buildSeedYaml should still produce valid YAML with an empty rules array
  const yaml = buildSeedYaml(rules);
  const parsed = jsYaml.load(yaml) as { rules: unknown };
  // js-yaml may represent empty array as null or []
  const rulesArr = parsed?.rules ?? [];
  expect(Array.isArray(rulesArr) ? rulesArr.length : 0).toBe(0);
});

// ── Test 8: test runner detected → required_command rule added ────────────────

test('--interactive with test runner detected adds required_command rule', async () => {
  const clack = makeClack(true);
  const scan = makeScan({ testRunner: 'vitest' });

  const rules = await runInitWizard(tmpDir, clack, scan);

  const testRule = rules.find(r => r.category === 'required_command');
  expect(testRule).toBeDefined();
  expect(testRule?.text).toContain('vitest');
  expect(testRule?.severity).toBe('high');
});
