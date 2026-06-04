import { describe, it, expect } from 'vitest';
import { detectStruggling } from '../../src/optimize/detect.js';
import type { RuleHistory } from '../../src/history/ruleHistory.js';

function makeHistory(runs: Array<'PASS' | 'FAIL' | 'PARTIAL' | 'SKIPPED'>): RuleHistory {
  return {
    signature: 'forbidden_command::never run pnpm publish::CLAUDE.md',
    ruleText: 'NEVER run pnpm publish',
    sourceFile: 'CLAUDE.md',
    sourceLine: 5,
    runs: runs.map((status, i) => ({
      ts: new Date(Date.now() - i * 1000).toISOString(),
      status,
      score: status === 'PASS' ? 100 : status === 'PARTIAL' ? 50 : 0,
    })),
  };
}

describe('detectStruggling', () => {
  it('flags a rule with 3/5 FAIL runs at default threshold (0.4)', () => {
    const hist = [makeHistory(['FAIL', 'FAIL', 'FAIL', 'PASS', 'PASS'])];
    const result = detectStruggling(hist);
    expect(result).toHaveLength(1);
    expect(result[0].failRate).toBeCloseTo(0.6);
    expect(result[0].runs).toBe(5);
  });

  it('does not flag a rule with only 1/5 FAIL', () => {
    const hist = [makeHistory(['FAIL', 'PASS', 'PASS', 'PASS', 'PASS'])];
    const result = detectStruggling(hist);
    expect(result).toHaveLength(0);
  });

  it('does not flag a rule with fewer than minRuns (default 3)', () => {
    const hist = [makeHistory(['FAIL', 'FAIL'])]; // 2 runs < minRuns=3
    const result = detectStruggling(hist);
    expect(result).toHaveLength(0);
  });

  it('counts PARTIAL as failure for detection', () => {
    const hist = [makeHistory(['PARTIAL', 'PARTIAL', 'PARTIAL', 'PASS', 'PASS'])];
    const result = detectStruggling(hist);
    // 3/5 = 0.6, above 0.4 threshold
    expect(result).toHaveLength(1);
    expect(result[0].failRate).toBeCloseTo(0.6);
  });

  it('sorts by failRate descending', () => {
    const hist = [
      makeHistory(['FAIL', 'FAIL', 'FAIL', 'FAIL', 'FAIL']), // 1.0
      makeHistory(['FAIL', 'FAIL', 'PASS', 'PASS', 'PASS']),  // 0.4
    ];
    hist[1].signature = 'required_command::run pnpm test::CLAUDE.md';
    const result = detectStruggling(hist);
    expect(result[0].failRate).toBeGreaterThan(result[1].failRate);
  });

  it('respects custom threshold', () => {
    const hist = [makeHistory(['FAIL', 'PASS', 'PASS', 'PASS', 'PASS'])]; // 0.2
    expect(detectStruggling(hist, 3, 0.15)).toHaveLength(1);
    expect(detectStruggling(hist, 3, 0.25)).toHaveLength(0);
  });
});
