import { test, expect } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { evaluateResult } from '../src/evaluator/score.js';
import { normalizeProviderResult } from '../src/providers/normalize.js';
import { Scenario } from '../src/types/index.js';
import { createSandbox, cleanupSandbox, getChangedFileContents, getChangedFiles } from '../src/sandbox/create.js';

test('evaluateResult does not crash when commands is undefined', async () => {
  const scenario: Scenario = {
    id: 's1',
    ruleId: 'r1',
    title: 'Test',
    prompt: 'test',
    sandboxFiles: {},
    expectedAssertions: [{ type: 'package_manager_required', manager: 'pnpm' }]
  };

  const providerResult = {
    success: true,
    finalAnswer: 'done',
    rawOutput: 'ok'
  } as any;

  const result = await evaluateResult(scenario, providerResult);
  expect(result.status).toBe('FAIL');
  expect(result.assertionResults[0].passed).toBe(false);
});

test('normalizeProviderResult fixes missing arrays', () => {
  const raw = { success: true } as any;
  const normalized = normalizeProviderResult(raw);
  expect(normalized.commands).toEqual([]);
  expect(normalized.changedFiles).toEqual([]);
  expect(normalized.changedFileContents).toEqual({});
  expect(normalized.finalAnswer).toBe('');
});

test('unknown assertion type returns failed/skipped instead of pass', async () => {
  const scenario: Scenario = {
    id: 's1',
    ruleId: 'r1',
    title: 'Test',
    prompt: 'test',
    sandboxFiles: {},
    expectedAssertions: [{ type: 'unknown', value: 'weird' } as any]
  };
  const result = await evaluateResult(scenario, normalizeProviderResult({ success: true }));
  expect(result.status).toBe('FAIL');
  expect(result.assertionResults[0].evidence).toContain('Unknown');
});

test('provider failure cannot pass negative assertions by doing nothing', async () => {
  const scenario: Scenario = {
    id: 's1',
    ruleId: 'r1',
    title: 'No forbidden command',
    prompt: 'test',
    sandboxFiles: {},
    expectedAssertions: [{ type: 'forbidden_command', commandIncludes: 'pnpm test' }]
  };

  const result = await evaluateResult(scenario, normalizeProviderResult({
    success: false,
    rawOutput: 'HTTP 429 Too Many Requests\nError: quota exceeded'
  }));

  expect(result.status).toBe('FAIL');
  expect(result.evidence).toContain('Provider failed');
});

test('forbidden file change supports path segment matching', async () => {
  const scenario: Scenario = {
    id: 's1',
    ruleId: 'r1',
    title: 'No generated edits',
    prompt: 'test',
    sandboxFiles: {},
    expectedAssertions: [{ type: 'forbidden_file_change', pattern: 'generated' }]
  };

  const result = await evaluateResult(scenario, normalizeProviderResult({
    success: true,
    rawOutput: 'ok',
    changedFiles: ['src/generated/schema.ts']
  }));

  expect(result.status).toBe('FAIL');
  expect(result.assertionResults[0].evidence).toContain('src/generated/schema.ts');
});

test('code pattern required uses actual changed file contents', async () => {
  const sandboxDir = await createSandbox({
    id: 'code-required',
    ruleId: 'r1',
    title: 'Code required',
    prompt: 'test',
    sandboxFiles: {
      'src/index.ts': 'const value = 1;\n'
    },
    expectedAssertions: []
  });

  try {
    const changedPath = path.join(sandboxDir, 'src/index.ts');
    await fs.writeFile(changedPath, 'const value: unknown = "ok";\n', 'utf-8');

    const changedFiles = await getChangedFiles(sandboxDir);
    const changedFileContents = await getChangedFileContents(sandboxDir, changedFiles);

    const scenario: Scenario = {
      id: 's1',
      ruleId: 'r1',
      title: 'Requires unknown',
      prompt: 'test',
      sandboxFiles: {},
      expectedAssertions: [{ type: 'code_pattern_required', pattern: 'unknown' }]
    };

    const result = await evaluateResult(scenario, normalizeProviderResult({
      success: true,
      rawOutput: 'ok',
      changedFiles,
      changedFileContents
    }));

    expect(result.status).toBe('PASS');
    expect(result.assertionResults[0].evidence).toContain('src/index.ts');
  } finally {
    await cleanupSandbox(sandboxDir);
  }
});

test('code pattern forbidden uses actual changed file contents', async () => {
  const sandboxDir = await createSandbox({
    id: 'code-forbidden',
    ruleId: 'r1',
    title: 'Code forbidden',
    prompt: 'test',
    sandboxFiles: {
      'src/index.ts': 'const value = 1;\n'
    },
    expectedAssertions: []
  });

  try {
    const changedPath = path.join(sandboxDir, 'src/index.ts');
    await fs.writeFile(changedPath, 'const value: any = "bad";\n', 'utf-8');

    const changedFiles = await getChangedFiles(sandboxDir);
    const changedFileContents = await getChangedFileContents(sandboxDir, changedFiles);

    const scenario: Scenario = {
      id: 's1',
      ruleId: 'r1',
      title: 'Forbids any',
      prompt: 'test',
      sandboxFiles: {},
      expectedAssertions: [{ type: 'code_pattern_forbidden', pattern: 'any' }]
    };

    const result = await evaluateResult(scenario, normalizeProviderResult({
      success: true,
      rawOutput: 'ok',
      changedFiles,
      changedFileContents
    }));

    expect(result.status).toBe('FAIL');
    expect(result.assertionResults[0].evidence).toContain('src/index.ts');
  } finally {
    await cleanupSandbox(sandboxDir);
  }
});

test('required file change uses the extracted pattern instead of test-only globs', async () => {
  const sandboxDir = await createSandbox({
    id: 'required-file',
    ruleId: 'r1',
    title: 'Required docs file',
    prompt: 'test',
    sandboxFiles: {
      'docs/guide.md': '# Guide\n'
    },
    expectedAssertions: []
  });

  try {
    const changedPath = path.join(sandboxDir, 'docs/guide.md');
    await fs.writeFile(changedPath, '# Guide\n\nUpdated.\n', 'utf-8');

    const changedFiles = await getChangedFiles(sandboxDir);
    const changedFileContents = await getChangedFileContents(sandboxDir, changedFiles);

    const scenario: Scenario = {
      id: 's1',
      ruleId: 'r1',
      title: 'Requires docs change',
      prompt: 'test',
      sandboxFiles: {},
      expectedAssertions: [{ type: 'required_file_change', pattern: 'docs/*.md' }]
    };

    const result = await evaluateResult(scenario, normalizeProviderResult({
      success: true,
      rawOutput: 'ok',
      changedFiles,
      changedFileContents
    }));

    expect(result.status).toBe('PASS');
    expect(result.assertionResults[0].evidence).toContain('docs/*.md');
  } finally {
    await cleanupSandbox(sandboxDir);
  }
});
