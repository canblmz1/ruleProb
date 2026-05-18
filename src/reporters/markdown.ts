import { EvaluationResult, Config } from '../types/index.js';
import fs from 'fs-extra';
import path from 'path';
import { buildReportProofModel, formatChangedFiles, formatSource, getChangedSnippets, resultLimitationMessages, CrossTab, CoverageModel } from './proof.js';
import { BaselineDelta } from '../baseline/compare.js';

export async function writeMarkdownReport(results: EvaluationResult[], config: Config, delta?: BaselineDelta) {
  const proof = buildReportProofModel(results, config);

  const lines = [
    '# RuleProbe Report',
    '',
    `Overall Score: ${proof.finalScore}/100 (severity-weighted: ${proof.weightedScore}/100)`,
    '',
    '## Summary',
    `- PASS: ${results.filter(result => result.status === 'PASS').length}`,
    `- PARTIAL: ${results.filter(result => result.status === 'PARTIAL').length}`,
    `- FAIL: ${results.filter(result => result.status === 'FAIL').length}`,
    `- SKIPPED: ${results.filter(result => result.status === 'SKIPPED').length}`,
    ''
  ];

  if (delta) {
    lines.push('## Baseline Comparison');
    lines.push(`- New passes: ${delta.newPasses.length}`);
    lines.push(`- Improvements: ${delta.improvements.length}`);
    lines.push(`- Unchanged: ${delta.unchanged.length}`);
    lines.push(`- Regressions: ${delta.regressions.length}`);
    if (delta.regressions.length > 0) {
      lines.push('');
      lines.push('### Regressions');
      for (const r of delta.regressions) {
        lines.push(`- [${r.status}] ${r.scenario.title}`);
      }
    }
    if (delta.newPasses.length > 0) {
      lines.push('');
      lines.push('### New Passes');
      for (const r of delta.newPasses) {
        lines.push(`- [${r.status}] ${r.scenario.title}`);
      }
    }
    if (delta.improvements.length > 0) {
      lines.push('');
      lines.push('### Improvements');
      for (const r of delta.improvements) {
        lines.push(`- [${r.status}] ${r.scenario.title}`);
      }
    }
    lines.push('');
  }

  lines.push(...formatCoverage(proof.coverage), '');

  lines.push(
    `Severity weights: high=${proof.scoreBreakdown.weights.high}, medium=${proof.scoreBreakdown.weights.medium}, low=${proof.scoreBreakdown.weights.low}`,
    '',
    '## Proof-Friendly Share Block',
    '',
    proof.shareBlock.markdown,
    '',
    '## Severity x Category Cross-Tab',
    ...formatCrossTab(proof.crossTab),
    '',
    '## Known Limitations',
    ...proof.knownLimitations.map(note => `- ${note.message}`),
    '',
    '## Failure Groups',
    ...formatFailureGroups(proof.failureGroups),
    '',
    '## Results',
    ''
  );

  for (const result of results) {
    lines.push(`### ${result.status} ${result.scenario.title}`);
    lines.push(`- Source: ${formatSource(result.sourceFile, result.sourceLine)}`);
    lines.push(`- Category: ${result.category || 'unknown'}`);
    lines.push(`- Severity: ${result.severity}`);
    lines.push(`- Rule: ${result.ruleText || result.scenario.title}`);
    lines.push(`- Changed Files: ${formatChangedFiles(result.providerResult.changedFiles)}`);
    if (result.skipReason) {
      lines.push(`- Skip Reason: ${result.skipReason}`);
    }
    const resultLimitations = resultLimitationMessages(result);
    if (resultLimitations.length > 0) {
      lines.push(`- Result Limitations: ${resultLimitations.join(' ')}`);
    }
    lines.push('');
    lines.push('Scenario:');
    lines.push('```text');
    lines.push(result.scenario.prompt);
    lines.push('```');
    lines.push('');
    lines.push('Expected:');
    lines.push('```text');
    lines.push(result.expected);
    lines.push('```');
    lines.push('');
    lines.push('Actual:');
    lines.push('```text');
    lines.push(result.actual);
    lines.push('```');
    lines.push('');
    lines.push('Evidence:');
    lines.push('```text');
    lines.push(result.evidence);
    lines.push('```');
    lines.push('');
    const snippets = getChangedSnippets(result);
    if (snippets.length > 0) {
      lines.push('Changed Content Snippets:');
      for (const snippet of snippets) {
        lines.push(`- ${snippet.file}`);
        lines.push('```text');
        lines.push(snippet.snippet);
        lines.push('```');
      }
      lines.push('');
    }
  }

  await fs.ensureDir(config.reportDir);
  await fs.writeFile(path.join(config.reportDir, 'report.md'), lines.join('\n'), 'utf-8');
}

function formatCoverage(coverage: CoverageModel): string[] {
  return [
    '## Rule Coverage',
    `- Scenarios evaluated: ${coverage.evaluated}/${coverage.totalScenarios} (${coverage.effectivePct}%)`,
    `- Skipped: ${coverage.skipped}`
  ];
}

function formatFailureGroups(groups: ReturnType<typeof buildReportProofModel>['failureGroups']): string[] {
  if (groups.length === 0) return ['- No failing or partial results.'];
  return groups.map(group =>
    `- ${group.category} (${group.severity}): ${group.results.length} result(s) needing attention`
  );
}

function formatCrossTab(crossTab: CrossTab): string[] {
  if (crossTab.rows.length === 0) {
    return ['- (no results to summarize)'];
  }
  const headers = ['Category', ...crossTab.severities.map(s => `${s} (P/Pa/F/S)`)];
  const lines: string[] = [];
  lines.push(`| ${headers.join(' | ')} |`);
  lines.push(`| ${headers.map(() => '---').join(' | ')} |`);
  for (const row of crossTab.rows) {
    const cells = crossTab.severities.map(severity => {
      const c = row.cells[severity];
      return `${c.pass}/${c.partial}/${c.fail}/${c.skipped}`;
    });
    lines.push(`| ${row.category} | ${cells.join(' | ')} |`);
  }
  const totalCells = crossTab.severities.map(severity => {
    const c = crossTab.totals[severity];
    return `${c.pass}/${c.partial}/${c.fail}/${c.skipped}`;
  });
  lines.push(`| **TOTAL** | ${totalCells.join(' | ')} |`);
  return lines;
}
