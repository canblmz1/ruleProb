import { EvaluationResult, Config } from '../types/index.js';
import fs from 'fs-extra';
import path from 'path';
import { buildReportProofModel, formatSource, getChangedSnippets, resultLimitationMessages, CrossTab } from './proof.js';
import { loadHistory, computeTrendSummary } from '../history/track.js';

export async function writeHtmlReport(results: EvaluationResult[], config: Config) {
  const proof = buildReportProofModel(results, config);
  const history = await loadHistory(config);
  const trend = computeTrendSummary(history);

  let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>RuleProbe Report</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
  <style>
    :root {
      --color-pass: #167c2b;
      --color-partial: #b54708;
      --color-fail: #b42318;
      --color-skipped: #667085;
      --color-bg: #f8fafc;
      --color-card: #ffffff;
      --color-border: #d0d5dd;
      --color-text: #101828;
      --color-text-secondary: #475467;
      --color-accent: #4c8bf5;
    }
    * { box-sizing: border-box; }
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      margin: 0;
      padding: 0;
      background: var(--color-bg);
      color: var(--color-text);
      line-height: 1.5;
    }
    .container { max-width: 1200px; margin: 0 auto; padding: 2rem 1rem; }
    header { margin-bottom: 2rem; }
    header h1 { margin: 0 0 0.5rem; font-size: 1.75rem; }
    header p { margin: 0; color: var(--color-text-secondary); }

    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
    .card {
      background: var(--color-card);
      border: 1px solid var(--color-border);
      border-radius: 12px;
      padding: 1.25rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.04);
    }
    .card h2 { margin: 0 0 1rem; font-size: 1rem; color: var(--color-text-secondary); text-transform: uppercase; letter-spacing: 0.04em; }
    .score-big { font-size: 3rem; font-weight: 700; margin: 0; }
    .score-big.pass { color: var(--color-pass); }
    .score-big.partial { color: var(--color-partial); }
    .score-big.fail { color: var(--color-fail); }

    .stats { display: flex; gap: 1.5rem; flex-wrap: wrap; }
    .stat { display: flex; align-items: baseline; gap: 0.5rem; }
    .stat-value { font-size: 1.5rem; font-weight: 600; }
    .stat-label { color: var(--color-text-secondary); font-size: 0.875rem; }

    .chart-container { position: relative; height: 220px; }
    .chart-container.small { height: 180px; }

    .filters { display: flex; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 1rem; }
    .filters input, .filters select {
      padding: 0.5rem 0.75rem;
      border: 1px solid var(--color-border);
      border-radius: 8px;
      font-size: 0.875rem;
      background: var(--color-card);
    }
    .filters input { min-width: 220px; }

    .results-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
    .results-header h2 { margin: 0; font-size: 1.25rem; }
    .badge { display: inline-block; padding: 0.25rem 0.6rem; border-radius: 999px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; }
    .badge.pass { background: #dcfce7; color: #166534; }
    .badge.partial { background: #fef3c7; color: #92400e; }
    .badge.fail { background: #fee2e2; color: #991b1b; }
    .badge.skipped { background: #f3f4f6; color: #4b5563; }

    .result-card {
      background: var(--color-card);
      border: 1px solid var(--color-border);
      border-radius: 10px;
      margin-bottom: 1rem;
      overflow: hidden;
    }
    .result-card.hidden { display: none; }
    .result-header {
      padding: 1rem 1.25rem;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
      transition: background 0.15s;
    }
    .result-header:hover { background: #f9fafb; }
    .result-title { font-weight: 600; flex: 1; }
    .result-meta { color: var(--color-text-secondary); font-size: 0.875rem; white-space: nowrap; }
    .result-body {
      padding: 0 1.25rem 1.25rem;
      border-top: 1px solid var(--color-border);
      display: none;
    }
    .result-body.open { display: block; }
    .result-body pre {
      background: #f8fafc;
      padding: 0.75rem;
      border-radius: 8px;
      overflow-x: auto;
      white-space: pre-wrap;
      font-size: 0.8125rem;
      line-height: 1.5;
      margin: 0.5rem 0 1rem;
    }
    .result-body h4 { margin: 1rem 0 0.25rem; font-size: 0.875rem; color: var(--color-text-secondary); }
    .result-body p { margin: 0.25rem 0; }

    .share-block {
      background: #f0f9ff;
      border: 1px solid #b6e0fe;
      padding: 0.75rem 1rem;
      border-radius: 8px;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 0.8125rem;
      white-space: pre-wrap;
      margin-bottom: 1.5rem;
    }

    .crosstab { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    .crosstab th, .crosstab td { border: 1px solid var(--color-border); padding: 0.5rem 0.75rem; text-align: left; }
    .crosstab th { background: #f2f4f7; }

    .trend-summary { display: flex; gap: 1.5rem; flex-wrap: wrap; font-size: 0.875rem; color: var(--color-text-secondary); }
    .trend-summary strong { color: var(--color-text); }

    .toggle-icon { transition: transform 0.2s; }
    .toggle-icon.open { transform: rotate(90deg); }

    @media (max-width: 640px) {
      .grid { grid-template-columns: 1fr; }
      .result-header { flex-direction: column; align-items: flex-start; }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>RuleProbe Report</h1>
      <p>Generated on ${new Date().toLocaleString()} &middot; Provider: ${config.provider} &middot; Extractor: ${config.extractor || 'deterministic'}</p>
    </header>

    <div class="grid">
      <div class="card">
        <h2>Overall Score</h2>
        <p class="score-big ${scoreClass(proof.finalScore)}">${proof.finalScore}<span style="font-size:1rem;color:var(--color-text-secondary);font-weight:400;">/100</span></p>
        <p style="color:var(--color-text-secondary);font-size:0.875rem;">Weighted: ${proof.weightedScore}/100</p>
      </div>
      <div class="card">
        <h2>Results Breakdown</h2>
        <div class="stats">
          <div class="stat"><span class="stat-value" style="color:var(--color-pass)">${results.filter(r => r.status === 'PASS').length}</span><span class="stat-label">Pass</span></div>
          <div class="stat"><span class="stat-value" style="color:var(--color-partial)">${results.filter(r => r.status === 'PARTIAL').length}</span><span class="stat-label">Partial</span></div>
          <div class="stat"><span class="stat-value" style="color:var(--color-fail)">${results.filter(r => r.status === 'FAIL').length}</span><span class="stat-label">Fail</span></div>
          <div class="stat"><span class="stat-value" style="color:var(--color-skipped)">${results.filter(r => r.status === 'SKIPPED').length}</span><span class="stat-label">Skipped</span></div>
        </div>
      </div>
      <div class="card">
        <h2>Distribution</h2>
        <div class="chart-container small">
          <canvas id="pieChart"></canvas>
        </div>
      </div>
      <div class="card">
        <h2>Category Breakdown</h2>
        <div class="chart-container">
          <canvas id="barChart"></canvas>
        </div>
      </div>
    </div>

    ${history.length > 1 ? renderTrendSection(history, trend) : ''}

    <div class="card" style="margin-bottom:2rem;">
      <h2>Share Block</h2>
      <div class="share-block">${escapeHtml(proof.shareBlock.text)}</div>
    </div>

    <div class="card" style="margin-bottom:2rem;">
      <h2>Known Limitations</h2>
      <ul>
        ${proof.knownLimitations.map(note => `<li>${escapeHtml(note.message)}</li>`).join('\n        ')}
      </ul>
    </div>

    <div class="card" style="margin-bottom:2rem;">
      <h2>Failure Groups</h2>
      ${renderFailureGroupsHtml(proof.failureGroups)}
    </div>

    <div class="card" style="margin-bottom:2rem;">
      <h2>Severity x Category Cross-Tab</h2>
      <table class="crosstab">
        ${renderCrossTabHtml(proof.crossTab)}
      </table>
    </div>

    <div style="margin-bottom:2rem;">
      <div class="results-header">
        <h2>Detailed Results (${results.length})</h2>
      </div>
      <div class="filters">
        <input type="text" id="searchInput" placeholder="Search by title, rule, or category..." />
        <select id="statusFilter">
          <option value="">All statuses</option>
          <option value="PASS">Pass</option>
          <option value="PARTIAL">Partial</option>
          <option value="FAIL">Fail</option>
          <option value="SKIPPED">Skipped</option>
        </select>
        <select id="severityFilter">
          <option value="">All severities</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <button onclick="document.querySelectorAll('.result-body').forEach(b=>b.classList.add('open'));document.querySelectorAll('.toggle-icon').forEach(i=>i.classList.add('open'))" style="padding:0.5rem 0.75rem;border:1px solid var(--color-border);border-radius:8px;background:var(--color-card);cursor:pointer;font-size:0.875rem;">Expand All</button>
        <button onclick="document.querySelectorAll('.result-body').forEach(b=>b.classList.remove('open'));document.querySelectorAll('.toggle-icon').forEach(i=>i.classList.remove('open'))" style="padding:0.5rem 0.75rem;border:1px solid var(--color-border);border-radius:8px;background:var(--color-card);cursor:pointer;font-size:0.875rem;">Collapse All</button>
      </div>
      <div id="resultsList">
        ${results.map((result, idx) => renderResultCard(result, idx)).join('')}
      </div>
    </div>
  </div>

  <script>
    (function() {
      const statusCounts = ${JSON.stringify({
        PASS: results.filter(r => r.status === 'PASS').length,
        PARTIAL: results.filter(r => r.status === 'PARTIAL').length,
        FAIL: results.filter(r => r.status === 'FAIL').length,
        SKIPPED: results.filter(r => r.status === 'SKIPPED').length
      })};
      const statuses = ['PASS','PARTIAL','FAIL','SKIPPED'];
      const counts = statuses.map(s => statusCounts[s] || 0);
      new Chart(document.getElementById('pieChart'), {
        type: 'doughnut',
        data: {
          labels: statuses,
          datasets: [{
            data: counts,
            backgroundColor: ['#167c2b','#b54708','#b42318','#667085'],
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'right', labels: { boxWidth: 12, font: { size: 11 } } } }
        }
      });

      const categoryData = ${JSON.stringify(
        [...new Set(results.map(r => r.category || 'unknown'))].sort().map(c => ({
          category: c,
          pass: results.filter(r => (r.category || 'unknown') === c && r.status === 'PASS').length,
          partial: results.filter(r => (r.category || 'unknown') === c && r.status === 'PARTIAL').length,
          fail: results.filter(r => (r.category || 'unknown') === c && r.status === 'FAIL').length
        }))
      )};
      const categories = categoryData.map(d => d.category);
      const categoryPass = categoryData.map(d => d.pass);
      const categoryPartial = categoryData.map(d => d.partial);
      const categoryFail = categoryData.map(d => d.fail);
      new Chart(document.getElementById('barChart'), {
        type: 'bar',
        data: {
          labels: categories,
          datasets: [
            { label: 'Pass', data: categoryPass, backgroundColor: '#167c2b' },
            { label: 'Partial', data: categoryPartial, backgroundColor: '#b54708' },
            { label: 'Fail', data: categoryFail, backgroundColor: '#b42318' }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { stepSize: 1 } } },
          plugins: { legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11 } } } }
        }
      });

      ${history.length > 1 ? renderTrendChartScript(history) : ''}

      function filterResults() {
        const q = document.getElementById('searchInput').value.toLowerCase();
        const status = document.getElementById('statusFilter').value;
        const severity = document.getElementById('severityFilter').value;
        document.querySelectorAll('.result-card').forEach(card => {
          const title = (card.dataset.title || '').toLowerCase();
          const rule = (card.dataset.rule || '').toLowerCase();
          const cat = (card.dataset.category || '').toLowerCase();
          const st = card.dataset.status || '';
          const sev = card.dataset.severity || '';
          const matchText = !q || title.includes(q) || rule.includes(q) || cat.includes(q);
          const matchStatus = !status || st === status;
          const matchSeverity = !severity || sev === severity;
          card.classList.toggle('hidden', !(matchText && matchStatus && matchSeverity));
        });
      }
      document.getElementById('searchInput').addEventListener('input', filterResults);
      document.getElementById('statusFilter').addEventListener('change', filterResults);
      document.getElementById('severityFilter').addEventListener('change', filterResults);

      document.querySelectorAll('.result-header').forEach(header => {
        header.addEventListener('click', () => {
          const body = header.nextElementSibling;
          const icon = header.querySelector('.toggle-icon');
          body.classList.toggle('open');
          icon.classList.toggle('open');
        });
      });
    })();
  </script>
</body>
</html>`;

  await fs.ensureDir(config.reportDir);
  await fs.writeFile(path.join(config.reportDir, 'report.html'), html, 'utf-8');
}

function scoreClass(score: number): string {
  if (score >= 80) return 'pass';
  if (score >= 50) return 'partial';
  return 'fail';
}

function renderFailureGroupsHtml(groups: ReturnType<typeof buildReportProofModel>['failureGroups']): string {
  if (groups.length === 0) return '<p>No failing or partial results.</p>';
  return `<ul>${groups.map(group =>
    `<li>${escapeHtml(group.category)} (${escapeHtml(group.severity)}): ${group.results.length} result(s) needing attention</li>`
  ).join('')}</ul>`;
}

function renderTrendSection(history: import('../history/track.js').HistoryEntry[], trend: import('../history/track.js').TrendSummary): string {
  return `
    <div class="grid">
      <div class="card">
        <h2>Score Trend</h2>
        <div class="chart-container">
          <canvas id="trendChart"></canvas>
        </div>
      </div>
      <div class="card">
        <h2>Trend Summary</h2>
        <div class="trend-summary">
          <div><strong>${trend.runs}</strong> runs tracked</div>
          <div><strong style="color:var(--color-pass)">${trend.bestScore}</strong> best</div>
          <div><strong style="color:var(--color-fail)">${trend.worstScore}</strong> worst</div>
          <div><strong>${trend.averageScore}</strong> avg</div>
          <div>${trend.streak.count} ${trend.streak.type} streak</div>
        </div>
      </div>
    </div>`;
}

function renderTrendChartScript(history: import('../history/track.js').HistoryEntry[]): string {
  const labels = history.map((h, i) => `#${i + 1}`);
  const scores = history.map(h => h.score);
  const weighted = history.map(h => h.weightedScore);
  return `
      new Chart(document.getElementById('trendChart'), {
        type: 'line',
        data: {
          labels: ${JSON.stringify(labels)},
          datasets: [
            { label: 'Score', data: ${JSON.stringify(scores)}, borderColor: '#4c8bf5', backgroundColor: 'rgba(76,139,245,0.1)', fill: true, tension: 0.3 },
            { label: 'Weighted', data: ${JSON.stringify(weighted)}, borderColor: '#b54708', backgroundColor: 'rgba(181,71,8,0.1)', fill: true, tension: 0.3 }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: { y: { min: 0, max: 100 } },
          plugins: { legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11 } } } }
        }
      });`;
}

function renderResultCard(result: EvaluationResult, idx: number): string {
  const status = result.status;
  const statusClass = status.toLowerCase();
  const snippets = getChangedSnippets(result);
  const limitations = resultLimitationMessages(result);

  return `
    <div class="result-card" data-status="${status}" data-severity="${result.severity}" data-category="${escapeHtml(result.category || 'unknown')}" data-title="${escapeHtml(result.scenario.title)}" data-rule="${escapeHtml(result.ruleText || '')}">
      <div class="result-header">
        <span class="badge ${statusClass}">${status}</span>
        <span class="result-title">${escapeHtml(result.scenario.title)}</span>
        <span class="result-meta">${escapeHtml(result.category || 'unknown')} &middot; ${result.severity}</span>
        <span class="toggle-icon">&#9654;</span>
      </div>
      <div class="result-body">
        <p class="meta"><strong>Source:</strong> ${escapeHtml(formatSource(result.sourceFile, result.sourceLine))}</p>
        <p class="meta"><strong>Rule:</strong> ${escapeHtml(result.ruleText || result.scenario.title)}</p>
        <p class="meta"><strong>Changed Files:</strong> ${escapeHtml(result.providerResult.changedFiles.join(', ') || '(none)')}</p>
        ${limitations.length > 0 ? `<p class="meta" style="color:var(--color-partial)"><strong>Limitations:</strong> ${limitations.map(escapeHtml).join('; ')}</p>` : ''}
        <h4>Scenario</h4>
        <pre>${escapeHtml(result.scenario.prompt)}</pre>
        <h4>Expected</h4>
        <pre>${escapeHtml(result.expected)}</pre>
        <h4>Actual</h4>
        <pre>${escapeHtml(result.actual)}</pre>
        <h4>Evidence</h4>
        <pre>${escapeHtml(result.evidence)}</pre>
        ${snippets.length > 0 ? `<h4>Changed Content Snippets</h4>` + snippets.map(s => `<p class="meta"><strong>${escapeHtml(s.file)}</strong></p><pre>${escapeHtml(s.snippet)}</pre>`).join('') : ''}
      </div>
    </div>`;
}

function renderCrossTabHtml(crossTab: CrossTab): string {
  if (crossTab.rows.length === 0) {
    return '<tr><td>(no results to summarize)</td></tr>';
  }
  const headers = ['Category', ...crossTab.severities.map(s => `${s} (P/Pa/F/S)`)];
  let html = `<thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>`;
  for (const row of crossTab.rows) {
    const cells = crossTab.severities.map(severity => {
      const c = row.cells[severity];
      return `<td>${c.pass}/${c.partial}/${c.fail}/${c.skipped}</td>`;
    }).join('');
    html += `<tr><td>${escapeHtml(row.category)}</td>${cells}</tr>`;
  }
  const totalCells = crossTab.severities.map(severity => {
    const c = crossTab.totals[severity];
    return `<td><strong>${c.pass}/${c.partial}/${c.fail}/${c.skipped}</strong></td>`;
  }).join('');
  html += `<tr><td><strong>TOTAL</strong></td>${totalCells}</tr></tbody>`;
  return html;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
