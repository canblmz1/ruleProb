import type { RuleHistory } from '../history/ruleHistory.js';

export interface StrugglingRule {
  history: RuleHistory;
  failRate: number;
  runs: number;
}

export function detectStruggling(
  hist: RuleHistory[],
  minRuns = 3,
  threshold = 0.4
): StrugglingRule[] {
  return hist
    .map(h => {
      const runs = h.runs.length;
      const fails = h.runs.filter(r => r.status === 'FAIL' || r.status === 'PARTIAL').length;
      return { history: h, failRate: runs ? fails / runs : 0, runs };
    })
    .filter(s => s.runs >= minRuns && s.failRate >= threshold)
    .sort((a, b) => b.failRate - a.failRate);
}
