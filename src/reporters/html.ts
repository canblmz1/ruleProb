import { EvaluationResult, Config } from '../types/index.js';
import fs from 'fs-extra';
import path from 'path';
import { buildReportProofModel, formatSource, getChangedSnippets, resultLimitationMessages, CrossTab } from './proof.js';

export async function writeHtmlReport(results: EvaluationResult[], config: Config) {
  const proof = buildReportProofModel(results, config);

  let html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>RuleProbe Report</title>
  <style>
    body { font-family: system-ui, sans-serif; padding: 2rem; max-width: 960px; margin: auto; line-height: 1.5; }
    .pass { color: #167c2b; }
    .fail { color: #b42318; }
    .partial { color: #b54708; }
    .skipped { color: #667085; }
    .card { border: 1px solid #d0d5dd; padding: 1rem; margin-bottom: 1rem; border-radius: 8px; }
    .meta { color: #475467; }
    pre { background: #f8fafc; padding: 0.75rem; border-radius: 6px; overflow-x: auto; white-space: pre-wrap; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    .failure-groups { border-left: 4px solid #b42318; padding-left: 1rem; }
    .result-limitations { background: #fff8e6; border: 1px solid #fedf89; padding: 0.75rem; border-radius: 6px; }
    .share-block { background: #f0f9ff; border: 1px solid #b6e0fe; padding: 0.75rem; border-radius: 6px; }
    table.crosstab { border-collapse: collapse; width: 100%; }
    table.crosstab th, table.crosstab td { border: 1px solid #d0d5dd; padding: 0.4rem 0.6rem; text-align: left; }
    table.crosstab th { background: #f2f4f7; }
  </style>
</head>
<body>
  <h1>RuleProbe Report</h1>
  <h2>Overall Score: ${proof.finalScore}/100 <small>(severity-weighted: ${proof.weightedScore}/100)</small></h2>
  <div class="summary">
    <p>Total: ${results.length}</p>
    <p class="pass">PASS: ${results.filter(result => result.status === 'PASS').length}</p>
    <p class="partial">PARTIAL: ${results.filter(result => result.status === 'PARTIAL').length}</p>
    <p class="fail">FAIL: ${results.filter(result => result.status === 'FAIL').length}</p>
    <p class="skipped">SKIPPED: ${results.filter(result => result.status === 'SKIPPED').length}</p>
    <p class="meta">Severity weights: high=${proof.scoreBreakdown.weights.high}, medium=${proof.scoreBreakdown.weights.medium}, low=${proof.scoreBreakdown.weights.low}</p>
  </div>
  <h2>Proof-Friendly Share Block</h2>
  <div class="share-block"><pre>${escapeHtml(proof.shareBlock.text)}</pre></div>
  <h2>Severity x Category Cross-Tab</h2>
  ${renderCrossTab(proof.crossTab)}
  <h2>Known Limitations</h2>
  <ul>
    ${proof.knownLimitations.map(note => `<li>${escapeHtml(note.message)}</li>`).join('\n    ')}
  </ul>
  <h2>Failure Groups</h2>
  <div class="failure-groups">
    ${renderFailureGroups(proof.failureGroups)}
  </div>
  <div class="details">`;

  for (const result of results) {
    const statusClass = result.status.toLowerCase();
    html += `
    <div class="card">
      <h3 class="${statusClass}">${escapeHtml(result.status)} | ${escapeHtml(result.scenario.title)}</h3>
      <p class="meta"><strong>Source:</strong> ${escapeHtml(formatSource(result.sourceFile, result.sourceLine))}</p>
      <p class="meta"><strong>Category:</strong> ${escapeHtml(result.category || 'unknown')}</p>
      <p class="meta"><strong>Severity:</strong> ${escapeHtml(result.severity)}</p>
      <p class="meta"><strong>Rule:</strong> ${escapeHtml(result.ruleText || result.scenario.title)}</p>
      <p class="meta"><strong>Changed Files:</strong> ${escapeHtml(result.providerResult.changedFiles.join(', ') || '(none)')}</p>
      ${renderResultLimitations(result)}
      <h4>Scenario</h4>
      <pre>${escapeHtml(result.scenario.prompt)}</pre>
      <h4>Expected</h4>
      <pre>${escapeHtml(result.expected)}</pre>
      <h4>Actual</h4>
      <pre>${escapeHtml(result.actual)}</pre>
      <h4>Evidence</h4>
      <pre>${escapeHtml(result.evidence)}</pre>
      ${renderChangedSnippets(result)}
    </div>`;
  }

  html += `
  </div>
</body>
</html>`;

  await fs.ensureDir(config.reportDir);
  await fs.writeFile(path.join(config.reportDir, 'report.html'), html, 'utf-8');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderFailureGroups(groups: ReturnType<typeof buildReportProofModel>['failureGroups']): string {
  if (groups.length === 0) return '<p>No failing or partial results.</p>';
  return `<ul>${groups.map(group =>
    `<li>${escapeHtml(group.category)} (${escapeHtml(group.severity)}): ${group.results.length} result(s) needing attention</li>`
  ).join('')}</ul>`;
}

function renderCrossTab(crossTab: CrossTab): string {
  if (crossTab.rows.length === 0) return '<p>(no results to summarize)</p>';
  const head = `<thead><tr><th>Category</th>${crossTab.severities.map(s => `<th>${escapeHtml(s)} (P/Pa/F/S)</th>`).join('')}</tr></thead>`;
  const body = crossTab.rows.map(row => {
    const cells = crossTab.severities.map(severity => {
      const c = row.cells[severity];
      return `<td>${c.pass}/${c.partial}/${c.fail}/${c.skipped}</td>`;
    }).join('');
    return `<tr><td>${escapeHtml(row.category)}</td>${cells}</tr>`;
  }).join('');
  const totalCells = crossTab.severities.map(severity => {
    const c = crossTab.totals[severity];
    return `<td><strong>${c.pass}/${c.partial}/${c.fail}/${c.skipped}</strong></td>`;
  }).join('');
  const totalRow = `<tr><td><strong>TOTAL</strong></td>${totalCells}</tr>`;
  return `<table class="crosstab">${head}<tbody>${body}${totalRow}</tbody></table>`;
}

function renderResultLimitations(result: EvaluationResult): string {
  const limitations = resultLimitationMessages(result);
  if (limitations.length === 0) return '';
  return `<div class="result-limitations"><strong>Result Limitations:</strong><ul>${limitations.map(message => `<li>${escapeHtml(message)}</li>`).join('')}</ul></div>`;
}

function renderChangedSnippets(result: EvaluationResult): string {
  const snippets = getChangedSnippets(result);
  if (snippets.length === 0) return '';
  return `<h4>Changed Content Snippets</h4>${snippets.map(snippet =>
    `<p class="meta"><strong>${escapeHtml(snippet.file)}</strong></p><pre>${escapeHtml(snippet.snippet)}</pre>`
  ).join('')}`;
}
