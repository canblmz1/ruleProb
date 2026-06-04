import fs from 'fs-extra';
import path from 'path';
import type { Matrix } from '../matrix/build.js';

const STATUS_EMOJI: Record<string, string> = {
  PASS: '✓',
  PARTIAL: '~',
  FAIL: '✗',
  SKIPPED: '–',
};

export function renderMatrixMarkdown(m: Matrix): string {
  const lines: string[] = [];
  const now = new Date().toISOString();

  lines.push('# RuleProbe Matrix Report');
  lines.push(`\n_Generated: ${now}_\n`);

  // Overall scores table
  lines.push('## Provider Scores\n');
  lines.push('| Provider | Score |');
  lines.push('|----------|-------|');
  for (const p of m.providers) {
    lines.push(`| ${p} | ${m.providerScores[p]}/100 |`);
  }

  // Rule × Provider grid
  lines.push('\n## Rule × Provider Grid\n');
  const header = ['| Rule', ...m.providers.map(p => ` ${p} `), ''].join('|');
  const sep = ['|------', ...m.providers.map(() => '------'), ''].join('|');
  lines.push(header);
  lines.push(sep);

  for (const row of m.rows) {
    const truncated = row.ruleText.length > 60
      ? row.ruleText.slice(0, 57) + '…'
      : row.ruleText;
    const cells = m.providers.map(p => {
      const cell = row.cells[p];
      const emoji = cell ? (STATUS_EMOJI[cell.status] ?? '?') : '–';
      const score = cell ? ` ${cell.score}` : '';
      return ` ${emoji}${score} `;
    });
    lines.push(`| ${truncated} |${cells.join('|')}|`);
  }

  // Hard rules section
  if (m.hardRules.length > 0) {
    lines.push('\n## Rules Hardest for Cheaper Models\n');
    lines.push('_Rules with the largest score spread across providers — consider rewriting these for clarity._\n');
    lines.push('| Rule | Spread |');
    lines.push('|------|--------|');
    for (const h of m.hardRules) {
      const truncated = h.ruleText.length > 70 ? h.ruleText.slice(0, 67) + '…' : h.ruleText;
      lines.push(`| ${truncated} | ${h.spread}pts |`);
    }
  }

  return lines.join('\n') + '\n';
}

export async function writeMatrixReports(
  m: Matrix,
  reportDir: string,
  runId: number | string
): Promise<void> {
  await fs.ensureDir(reportDir);

  const mdPath = path.join(reportDir, `matrix-${runId}.md`);
  const jsonPath = path.join(reportDir, `matrix-${runId}.json`);

  await fs.writeFile(mdPath, renderMatrixMarkdown(m), 'utf-8');
  await fs.writeJson(jsonPath, m, { spaces: 2 });

  console.log(`Matrix report: ${mdPath}`);
}
