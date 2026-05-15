import { test, expect, describe } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { readBaseline, writeBaseline, computeBaselineDelta, toBaselineEntry, BaselineData } from '../src/baseline/compare.js';
import { EvaluationResult } from '../src/types/index.js';

function makeResult(overrides: Partial<EvaluationResult> = {}): EvaluationResult {
  return {
    scenario: {
      id: 's1',
      ruleId: 'r1',
      title: 'Test scenario',
      prompt: 'test',
      sandboxFiles: {},
      expectedAssertions: []
    },
    providerResult: {
      finalAnswer: '',
      changedFiles: [],
      changedFileContents: {},
      commands: [],
      rawOutput: '',
      success: true
    },
    assertionResults: [],
    status: 'PASS',
    score: 100,
    ruleId: 'r1',
    scenarioId: 's1',
    expected: '',
    actual: '',
    evidence: '',
    severity: 'medium',
    category: 'code_pattern_required',
    ...overrides
  } as EvaluationResult;
}

describe('baseline', () => {
  test('readBaseline returns null when file does not exist', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ruleprobe-baseline-'));
    const result = await readBaseline({ reportDir: dir } as any);
    expect(result).toBeNull();
  });

  test('writeBaseline and readBaseline round-trip', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ruleprobe-baseline-'));
    const results = [makeResult({ status: 'PASS', score: 100, scenarioId: 's1' })];
    await writeBaseline(results, { reportDir: dir } as any);
    const baseline = await readBaseline({ reportDir: dir } as any);
    expect(baseline).not.toBeNull();
    expect(baseline!.version).toBe(1);
    expect(baseline!.results).toHaveLength(1);
    expect(baseline!.results[0].scenarioId).toBe('s1');
    expect(baseline!.results[0].status).toBe('PASS');
    expect(baseline!.results[0].score).toBe(100);
  });

  test('computeBaselineDelta with null baseline returns empty delta', () => {
    const results = [makeResult()];
    const delta = computeBaselineDelta(results, null);
    expect(delta.newPasses).toHaveLength(0);
    expect(delta.improvements).toHaveLength(0);
    expect(delta.unchanged).toHaveLength(0);
    expect(delta.regressions).toHaveLength(0);
  });

  test('computeBaselineDelta detects unchanged results', () => {
    const baseline: BaselineData = {
      version: 1,
      createdAt: new Date().toISOString(),
      results: [toBaselineEntry(makeResult({ status: 'PASS', score: 100 }))]
    };
    const current = [makeResult({ status: 'PASS', score: 100 })];
    const delta = computeBaselineDelta(current, baseline);
    expect(delta.unchanged).toHaveLength(1);
    expect(delta.regressions).toHaveLength(0);
    expect(delta.improvements).toHaveLength(0);
    expect(delta.newPasses).toHaveLength(0);
  });

  test('computeBaselineDelta detects regressions', () => {
    const baseline: BaselineData = {
      version: 1,
      createdAt: new Date().toISOString(),
      results: [toBaselineEntry(makeResult({ status: 'PASS', score: 100 }))]
    };
    const current = [makeResult({ status: 'FAIL', score: 0 })];
    const delta = computeBaselineDelta(current, baseline);
    expect(delta.regressions).toHaveLength(1);
    expect(delta.unchanged).toHaveLength(0);
  });

  test('computeBaselineDelta detects improvements', () => {
    const baseline: BaselineData = {
      version: 1,
      createdAt: new Date().toISOString(),
      results: [toBaselineEntry(makeResult({ status: 'FAIL', score: 0 }))]
    };
    const current = [makeResult({ status: 'PASS', score: 100 })];
    const delta = computeBaselineDelta(current, baseline);
    expect(delta.improvements).toHaveLength(1);
    expect(delta.regressions).toHaveLength(0);
  });

  test('computeBaselineDelta detects new passes for unknown scenarios', () => {
    const baseline: BaselineData = {
      version: 1,
      createdAt: new Date().toISOString(),
      results: [toBaselineEntry(makeResult({ scenarioId: 's1', status: 'PASS' }))]
    };
    const current = [
      makeResult({ scenarioId: 's1', status: 'PASS' }),
      makeResult({ scenarioId: 's2', status: 'PASS' })
    ];
    const delta = computeBaselineDelta(current, baseline);
    expect(delta.newPasses).toHaveLength(1);
    expect(delta.newPasses[0].scenarioId).toBe('s2');
  });

  test('computeBaselineDelta treats unknown failing scenarios as regressions', () => {
    const baseline: BaselineData = {
      version: 1,
      createdAt: new Date().toISOString(),
      results: [toBaselineEntry(makeResult({ scenarioId: 's1', status: 'PASS' }))]
    };
    const current = [
      makeResult({ scenarioId: 's1', status: 'PASS' }),
      makeResult({ scenarioId: 's2', status: 'FAIL' })
    ];
    const delta = computeBaselineDelta(current, baseline);
    expect(delta.regressions).toHaveLength(1);
    expect(delta.regressions[0].scenarioId).toBe('s2');
  });

  test('computeBaselineDelta handles PARTIAL score changes', () => {
    const baseline: BaselineData = {
      version: 1,
      createdAt: new Date().toISOString(),
      results: [toBaselineEntry(makeResult({ status: 'PARTIAL', score: 50 }))]
    };
    const current = [makeResult({ status: 'PARTIAL', score: 75 })];
    const delta = computeBaselineDelta(current, baseline);
    expect(delta.improvements).toHaveLength(1);
  });

  test('toBaselineEntry strips unneeded fields', () => {
    const result = makeResult({
      scenario: {
        id: 's1',
        ruleId: 'r1',
        title: 'Test',
        prompt: 'test',
        sandboxFiles: {},
        expectedAssertions: []
      },
      providerResult: {
        finalAnswer: 'secret',
        changedFiles: ['a.ts'],
        changedFileContents: { 'a.ts': 'content' },
        commands: ['pnpm test'],
        rawOutput: 'output',
        success: true
      },
      assertionResults: [{ assertion: { type: 'unknown', value: 'x' }, passed: false, evidence: 'e' }]
    });
    const entry = toBaselineEntry(result);
    expect(entry.scenarioId).toBe('s1');
    expect(entry.status).toBe('PASS');
    expect(entry.score).toBe(100);
    expect((entry as any).providerResult).toBeUndefined();
    expect((entry as any).assertionResults).toBeUndefined();
    expect((entry as any).scenario).toBeUndefined();
  });
});
