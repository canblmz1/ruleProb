import { EvaluationResult, Config } from '../types/index.js';
import fs from 'fs-extra';
import path from 'path';
import { buildReportProofModel } from './proof.js';
import { BaselineDelta } from '../baseline/compare.js';

export async function writePrCommentReport(
  results: EvaluationResult[],
  config: Config,
  delta?: BaselineDelta
): Promise<string> {
  const proof = buildReportProofModel(results, config);
  const counts = {
    pass: results.filter(r => r.status === 'PASS').length,
    partial: results.filter(r => r.status === 'PARTIAL').length,
    fail: results.filter(r => r.status === 'FAIL').length,
    skipped: results.filter(r => r.status === 'SKIPPED').length
  };

  const scoreEmoji = proof.finalScore >= 90 ? '🟢' : proof.finalScore >= 70 ? '🟡' : '🔴';

  const lines: string[] = [];
  lines.push('## RuleProbe Compliance Report');
  lines.push('');
  lines.push(`**Score:** ${scoreEmoji} ${proof.finalScore}/100 (weighted: ${proof.weightedScore}/100)`);
  lines.push('');
  lines.push('| Status | Count |');
  lines.push('|--------|-------|');
  lines.push(`| ✅ PASS | ${counts.pass} |`);
  lines.push(`| ⚠️ PARTIAL | ${counts.partial} |`);
  lines.push(`| ❌ FAIL | ${counts.fail} |`);
  lines.push(`| ➖ SKIPPED | ${counts.skipped} |`);
  lines.push('');

  if (delta) {
    lines.push('### Baseline Comparison');
    if (delta.newPasses.length > 0) lines.push(`- ✅ **New passes:** ${delta.newPasses.length}`);
    if (delta.improvements.length > 0) lines.push(`- 📈 **Improvements:** ${delta.improvements.length}`);
    lines.push(`- ➖ **Unchanged:** ${delta.unchanged.length}`);
    if (delta.regressions.length > 0) lines.push(`- 📉 **Regressions:** ${delta.regressions.length}`);
    lines.push('');
  }

  const failures = results
    .filter(r => r.status === 'FAIL' || r.status === 'PARTIAL')
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
    .slice(0, 5);

  if (failures.length > 0) {
    lines.push('### Top Issues');
    for (const f of failures) {
      const emoji = f.status === 'FAIL' ? '❌' : '⚠️';
      lines.push(`- ${emoji} [${f.severity}/${f.category || 'unknown'}] ${f.scenario.title}`);
    }
    lines.push('');
  }

  lines.push(`*[View full report](${config.reportDir}/report.md)*`);

  const outPath = path.join(config.reportDir, 'report.pr-comment.md');
  await fs.ensureDir(config.reportDir);
  await fs.writeFile(outPath, lines.join('\n'), 'utf-8');
  return outPath;
}

function severityRank(severity: string): number {
  if (severity === 'high') return 3;
  if (severity === 'medium') return 2;
  if (severity === 'low') return 1;
  return 0;
}
