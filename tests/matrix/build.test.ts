import { describe, it, expect } from 'vitest';
import { buildMatrix } from '../../src/matrix/build.js';
import type { EvaluationResult } from '../../src/types/index.js';

function makeResult(overrides: Partial<EvaluationResult>): EvaluationResult {
  return {
    scenario: {} as any,
    providerResult: {} as any,
    assertionResults: [],
    status: 'PASS',
    score: 100,
    ruleId: 'rule-1',
    scenarioId: 'scenario-1',
    expected: '',
    actual: '',
    evidence: '',
    severity: 'high',
    category: 'required_command',
    ruleText: 'Always run pnpm test',
    sourceFile: 'CLAUDE.md',
    ...overrides,
  };
}

describe('buildMatrix', () => {
  it('produces one row for aligned providers with correct cells, compliance, providerScores, and hardRules', () => {
    const providerA = [makeResult({ status: 'PASS', score: 100, ruleId: 'rule-1', scenarioId: 'scenario-1' })];
    const providerB = [makeResult({ status: 'FAIL', score: 0, ruleId: 'rule-1', scenarioId: 'scenario-1' })];

    const matrix = buildMatrix({ providerA, providerB });

    expect(matrix.providers).toEqual(['providerA', 'providerB']);
    expect(matrix.rows).toHaveLength(1);

    const row = matrix.rows[0];
    expect(row.ruleId).toBe('rule-1');
    expect(row.ruleText).toBe('Always run pnpm test');
    expect(row.cells['providerA']).toEqual({ status: 'PASS', score: 100 });
    expect(row.cells['providerB']).toEqual({ status: 'FAIL', score: 0 });
    expect(row.compliance['providerA']).toBe(100);
    expect(row.compliance['providerB']).toBe(0);

    expect(matrix.providerScores['providerA']).toBe(100);
    expect(matrix.providerScores['providerB']).toBe(0);

    expect(matrix.hardRules).toHaveLength(1);
    expect(matrix.hardRules[0].spread).toBe(100);
    expect(matrix.hardRules[0].ruleId).toBe('rule-1');
  });

  it('fills missing provider cell with SKIPPED/0', () => {
    const providerA = [makeResult({ status: 'PASS', score: 100, scenarioId: 'scenario-1' })];
    const providerB: EvaluationResult[] = []; // no result for scenario-1

    const matrix = buildMatrix({ providerA, providerB });

    expect(matrix.rows).toHaveLength(1);
    expect(matrix.rows[0].cells['providerB']).toEqual({ status: 'SKIPPED', score: 0 });
    expect(matrix.rows[0].compliance['providerB']).toBe(0);
  });

  it('returns empty hardRules when all providers score the same', () => {
    const makePass = (sid: string) => makeResult({ status: 'PASS', score: 100, scenarioId: sid });
    const providerA = [makePass('s1'), makePass('s2')];
    const providerB = [makePass('s1'), makePass('s2')];

    const matrix = buildMatrix({ providerA, providerB });

    expect(matrix.hardRules).toHaveLength(0);
  });
});
