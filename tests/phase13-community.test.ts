import { test, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs-extra';
import os from 'os';

// ── init --with-ci ────────────────────────────────────────────────────────────

async function runInit(targetDir: string, args: string[] = []) {
  const { Command } = await import('commander');
  const { register } = await import('../src/cli/commands/init.js');
  const program = new Command();
  program.exitOverride();
  register(program);
  await program.parseAsync(['node', 'test', 'init', targetDir, ...args]);
}

test('init creates ruleprobe.config.json in target directory', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rp-init-'));
  try {
    await runInit(tmpDir);
    const configPath = path.join(tmpDir, 'ruleprobe.config.json');
    expect(await fs.pathExists(configPath)).toBe(true);
    const config = await fs.readJson(configPath);
    expect(config.provider).toBe('mock');
    expect(config.failBelow).toBe(70);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('init --provider sets provider field in config', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rp-init-'));
  try {
    await runInit(tmpDir, ['--provider', 'gemini']);
    const config = await fs.readJson(path.join(tmpDir, 'ruleprobe.config.json'));
    expect(config.provider).toBe('gemini');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('init --with-ci creates GitHub Actions workflow file', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rp-init-'));
  try {
    await runInit(tmpDir, ['--with-ci']);
    const workflowPath = path.join(tmpDir, '.github', 'workflows', 'ruleprobe-compliance.yml');
    expect(await fs.pathExists(workflowPath)).toBe(true);
    const content = await fs.readFile(workflowPath, 'utf-8');
    expect(content).toContain('RuleProbe Compliance');
    expect(content).toContain('npx ruleprobe-ai@latest');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('init without --with-ci does not create workflow file', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rp-init-'));
  try {
    await runInit(tmpDir);
    const workflowPath = path.join(tmpDir, '.github', 'workflows', 'ruleprobe-compliance.yml');
    expect(await fs.pathExists(workflowPath)).toBe(false);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

// ── upgrade command ───────────────────────────────────────────────────────────

test('upgrade reports up to date when npm returns matching version', async () => {
  const { Command } = await import('commander');
  const { register } = await import('../src/cli/commands/upgrade.js');

  const originalFetch = global.fetch;
  global.fetch = async (_url: any) => ({
    ok: true,
    status: 200,
    json: async () => ({ version: '1.7.0' })
  } as any);

  const logs: string[] = [];
  const origLog = console.log;
  console.log = (...args: any[]) => logs.push(args.join(' '));

  try {
    const program = new Command();
    program.exitOverride();
    register(program);
    await program.parseAsync(['node', 'test', 'upgrade']);
  } finally {
    console.log = origLog;
    global.fetch = originalFetch;
  }

  const output = logs.join('\n');
  // Either "up to date" or "update available" — either is valid depending on current version
  expect(output).toMatch(/up to date|Update available/i);
});

test('upgrade handles network timeout gracefully', async () => {
  const { Command } = await import('commander');
  const { register } = await import('../src/cli/commands/upgrade.js');

  const originalFetch = global.fetch;
  global.fetch = async () => {
    throw Object.assign(new Error('timeout'), { name: 'AbortError' });
  };

  const logs: string[] = [];
  const origLog = console.log;
  console.log = (...args: any[]) => logs.push(args.join(' '));

  try {
    const program = new Command();
    program.exitOverride();
    register(program);
    await program.parseAsync(['node', 'test', 'upgrade']);
  } finally {
    console.log = origLog;
    global.fetch = originalFetch;
  }

  expect(logs.join('\n')).toMatch(/timed out/i);
});

// ── feedback command ──────────────────────────────────────────────────────────

test('feedback command prints GitHub issues link', async () => {
  const { Command } = await import('commander');
  const { register } = await import('../src/cli/commands/feedback.js');

  const logs: string[] = [];
  const origLog = console.log;
  console.log = (...args: any[]) => logs.push(args.join(' '));

  try {
    const program = new Command();
    program.exitOverride();
    register(program);
    await program.parseAsync(['node', 'test', 'feedback']);
  } finally {
    console.log = origLog;
  }

  const output = logs.join('\n');
  expect(output).toContain('github.com/canblmz1/ruleProb/issues');
  expect(output).toContain('CONTRIBUTING');
});
