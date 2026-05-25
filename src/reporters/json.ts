import { EvaluationResult, Config } from '../types/index.js';
import fs from 'fs-extra';
import path from 'path';
import { buildReportProofModel, getChangedSnippets, resultLimitationMessages } from './proof.js';
import { BaselineDelta } from '../baseline/compare.js';

export async function writeJsonReport(results: EvaluationResult[], config: Config, delta?: BaselineDelta, weights?: Record<string, number>) {
  const proof = buildReportProofModel(results, config, weights);

  const totalCount = results.length;
  const skippedCount = results.filter(r => r.status === 'SKIPPED').length;
  const evaluatedCount = totalCount - skippedCount;
  const coveragePct = totalCount > 0 ? Math.round((evaluatedCount / totalCount) * 100) : 0;

  const report: Record<string, unknown> = {
    overview: {
      totalRules: results.length,
      passed: results.filter(r => r.status === 'PASS').length,
      partial: results.filter(r => r.status === 'PARTIAL').length,
      failed: results.filter(r => r.status === 'FAIL').length,
      skipped: results.filter(r => r.status === 'SKIPPED').length,
      overallScore: proof.finalScore,
      weightedScore: proof.weightedScore,
      simulated: config.provider === 'mock'
    },
    coverage: {
      evaluated: evaluatedCount,
      total: totalCount,
      skipped: skippedCount,
      pct: coveragePct
    },
    scoreBreakdown: proof.scoreBreakdown,
    crossTab: proof.crossTab,
    shareBlock: proof.shareBlock,
    knownLimitations: proof.knownLimitations,
    failureGroups: proof.failureGroups.map(group => ({
      category: group.category,
      severity: group.severity,
      count: group.results.length,
      scenarioIds: group.results.map(result => result.scenarioId)
    })),
    results: results.map(result => ({
      ...result,
      resultLimitations: resultLimitationMessages(result),
      changedSnippets: getChangedSnippets(result)
    }))
  };

  if (delta) {
    report.baselineDelta = {
      newPasses: delta.newPasses.length,
      improvements: delta.improvements.length,
      unchanged: delta.unchanged.length,
      regressions: delta.regressions.length,
      regressionDetails: delta.regressions.map(r => ({
        scenarioId: r.scenarioId,
        title: r.scenario.title,
        status: r.status,
        score: r.score
      }))
    };
  }

  await fs.ensureDir(config.reportDir);
  await fs.writeFile(path.join(config.reportDir, 'report.json'), JSON.stringify(report, null, 2), 'utf-8');
}
