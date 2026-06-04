import type { EvaluationResult } from '../types/index.js';

export interface MatrixCell {
  status: EvaluationResult['status'];
  score: number;
}

export interface MatrixRow {
  ruleId: string;
  ruleText: string;
  category?: string;
  cells: Record<string, MatrixCell>;
  compliance: Record<string, number>;
}

export interface Matrix {
  providers: string[];
  rows: MatrixRow[];
  providerScores: Record<string, number>;
  hardRules: { ruleId: string; ruleText: string; spread: number }[];
}

export function buildMatrix(results: Record<string, EvaluationResult[]>): Matrix {
  const providers = Object.keys(results);

  const byScenario: Record<string, Record<string, EvaluationResult>> = {};
  for (const p of providers) {
    for (const r of results[p]) {
      (byScenario[r.scenarioId] ??= {})[p] = r;
    }
  }

  const rows: MatrixRow[] = Object.entries(byScenario).map(([_scenarioId, perProvider]) => {
    const sample = Object.values(perProvider)[0];
    const cells: Record<string, MatrixCell> = {};
    const compliance: Record<string, number> = {};

    for (const p of providers) {
      const r = perProvider[p];
      cells[p] = r ? { status: r.status, score: r.score } : { status: 'SKIPPED', score: 0 };
      compliance[p] = r ? r.score : 0;
    }

    return {
      ruleId: sample.ruleId,
      ruleText: sample.ruleText ?? _scenarioId,
      category: sample.category,
      cells,
      compliance,
    };
  });

  const providerScores: Record<string, number> = {};
  for (const p of providers) {
    const rs = results[p];
    providerScores[p] = rs.length > 0
      ? Math.round(rs.reduce((a, r) => a + r.score, 0) / rs.length)
      : 0;
  }

  const hardRules = rows
    .map(row => {
      const vals = providers.map(p => row.compliance[p] ?? 0);
      return {
        ruleId: row.ruleId,
        ruleText: row.ruleText,
        spread: Math.max(...vals) - Math.min(...vals),
      };
    })
    .filter(h => h.spread > 0)
    .sort((a, b) => b.spread - a.spread)
    .slice(0, 10);

  return { providers, rows, providerScores, hardRules };
}
