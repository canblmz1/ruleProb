import path from 'path';
import { Config, EvaluationResult } from '../types/index.js';
import { collectLimitationNotes, collectResultLimitationNotes, LimitationNote } from './limitations.js';

export interface ChangedSnippet {
  file: string;
  snippet: string;
}

export interface FailureGroup {
  key: string;
  category: string;
  severity: string;
  results: EvaluationResult[];
}

export interface CrossTabCell {
  pass: number;
  partial: number;
  fail: number;
  skipped: number;
  weighted: number;
}

export interface CrossTabRow {
  category: string;
  cells: Record<string, CrossTabCell>;
}

export interface CrossTab {
  severities: string[];
  rows: CrossTabRow[];
  totals: Record<string, CrossTabCell>;
}

export interface ScoreBreakdown {
  unweighted: number;
  weighted: number;
  totalWeight: number;
  weightedSum: number;
  weights: Record<string, number>;
}

export interface ProofFriendlyShareBlock {
  text: string;
  markdown: string;
}

export interface ReportProofModel {
  finalScore: number;
  weightedScore: number;
  scoreBreakdown: ScoreBreakdown;
  knownLimitations: LimitationNote[];
  failureGroups: FailureGroup[];
  crossTab: CrossTab;
  shareBlock: ProofFriendlyShareBlock;
}

const SEVERITY_WEIGHTS: Record<string, number> = { high: 3, medium: 2, low: 1 };

export function buildReportProofModel(results: EvaluationResult[], config: Config): ReportProofModel {
  const overallScore = Math.round(results.reduce((acc, result) => acc + result.score, 0) / (results.length || 1));
  const finalScore = isNaN(overallScore) ? 0 : overallScore;

  const scoreBreakdown = computeWeightedScore(results);
  const failureGroups = groupFailures(results);
  const crossTab = buildCrossTab(results);
  const knownLimitations = collectLimitationNotes(results, config);
  const shareBlock = buildShareBlock(results, finalScore, scoreBreakdown, knownLimitations, config);

  return {
    finalScore,
    weightedScore: scoreBreakdown.weighted,
    scoreBreakdown,
    knownLimitations,
    failureGroups,
    crossTab,
    shareBlock
  };
}

function computeWeightedScore(results: EvaluationResult[]): ScoreBreakdown {
  let weightedSum = 0;
  let totalWeight = 0;
  for (const result of results) {
    const weight = SEVERITY_WEIGHTS[result.severity] ?? SEVERITY_WEIGHTS.medium;
    weightedSum += result.score * weight;
    totalWeight += weight;
  }
  const unweighted = Math.round(results.reduce((acc, r) => acc + r.score, 0) / (results.length || 1)) || 0;
  const weighted = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
  return {
    unweighted: isNaN(unweighted) ? 0 : unweighted,
    weighted,
    totalWeight,
    weightedSum,
    weights: { ...SEVERITY_WEIGHTS }
  };
}

export function groupFailures(results: EvaluationResult[]): FailureGroup[] {
  const groups = new Map<string, FailureGroup>();

  for (const result of results) {
    if (result.status !== 'FAIL' && result.status !== 'PARTIAL') continue;

    const category = result.category || 'unknown';
    const severity = result.severity || 'medium';
    const key = `${category}|${severity}`;
    const existing = groups.get(key) || { key, category, severity, results: [] };
    existing.results.push(result);
    groups.set(key, existing);
  }

  return Array.from(groups.values()).sort((left, right) => {
    const severityDelta = severityRank(right.severity) - severityRank(left.severity);
    if (severityDelta !== 0) return severityDelta;
    return left.category.localeCompare(right.category);
  });
}

function emptyCell(): CrossTabCell {
  return { pass: 0, partial: 0, fail: 0, skipped: 0, weighted: 0 };
}

function buildCrossTab(results: EvaluationResult[]): CrossTab {
  const severities = ['high', 'medium', 'low'];
  const rowMap = new Map<string, CrossTabRow>();
  const totals: Record<string, CrossTabCell> = {};
  for (const sev of severities) totals[sev] = emptyCell();

  for (const result of results) {
    const category = result.category || 'unknown';
    const severity = severities.includes(result.severity) ? result.severity : 'medium';
    let row = rowMap.get(category);
    if (!row) {
      row = { category, cells: {} };
      for (const sev of severities) row.cells[sev] = emptyCell();
      rowMap.set(category, row);
    }
    const cell = row.cells[severity];
    const totalCell = totals[severity];
    if (result.status === 'PASS') { cell.pass++; totalCell.pass++; }
    else if (result.status === 'PARTIAL') { cell.partial++; totalCell.partial++; }
    else if (result.status === 'FAIL') { cell.fail++; totalCell.fail++; }
    else if (result.status === 'SKIPPED') { cell.skipped++; totalCell.skipped++; }
    const weight = SEVERITY_WEIGHTS[severity] ?? SEVERITY_WEIGHTS.medium;
    cell.weighted += result.score * weight;
    totalCell.weighted += result.score * weight;
  }

  const rows = Array.from(rowMap.values()).sort((a, b) => a.category.localeCompare(b.category));
  return { severities, rows, totals };
}

function buildShareBlock(
  results: EvaluationResult[],
  finalScore: number,
  scoreBreakdown: ScoreBreakdown,
  knownLimitations: LimitationNote[],
  config: Config
): ProofFriendlyShareBlock {
  const counts = {
    pass: results.filter(r => r.status === 'PASS').length,
    partial: results.filter(r => r.status === 'PARTIAL').length,
    fail: results.filter(r => r.status === 'FAIL').length,
    skipped: results.filter(r => r.status === 'SKIPPED').length
  };

  const sources = new Set<string>();
  for (const result of results) {
    if (result.sourceFile) sources.add(path.basename(result.sourceFile));
  }
  const instructionFiles = sources.size > 0
    ? Array.from(sources).join(', ')
    : (config.instructionFiles || []).join(', ');

  const topFailures = results
    .filter(r => r.status === 'FAIL' || r.status === 'PARTIAL')
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
    .slice(0, 3)
    .map(r => `- [${r.status}] (${r.severity}/${r.category || 'unknown'}) ${r.scenario.title}`);

  const topLimitations = knownLimitations.slice(0, 3).map(note => `- ${note.message}`);

  const lines: string[] = [];
  lines.push('RuleProbe Compliance Report');
  lines.push(`Provider: ${config.provider}  Extractor: ${config.extractor || 'deterministic'}`);
  lines.push(`Score: ${finalScore}/100  (severity-weighted: ${scoreBreakdown.weighted}/100)`);
  lines.push(`Rules tested: ${results.length}  PASS=${counts.pass}  PARTIAL=${counts.partial}  FAIL=${counts.fail}  SKIPPED=${counts.skipped}`);
  lines.push(`Instruction files: ${instructionFiles || '(none)'}`);
  if (topFailures.length > 0) {
    lines.push('Top issues:');
    lines.push(...topFailures);
  }
  if (topLimitations.length > 0) {
    lines.push('Known limitations:');
    lines.push(...topLimitations);
  }
  lines.push(`Report: ${config.reportDir}/report.md`);

  const text = lines.join('\n');
  const markdown = '```text\n' + text + '\n```';
  return { text, markdown };
}

export function getChangedSnippets(result: EvaluationResult, limit = 3): ChangedSnippet[] {
  const snippets: ChangedSnippet[] = [];
  const entries = Object.entries(result.providerResult.changedFileContents || {});
  const baseline = (result.providerResult as any).baselineFileContents as Record<string, string | null> | undefined;

  for (const [file, content] of entries) {
    if (snippets.length >= limit) break;
    if (typeof content !== 'string') continue;
    snippets.push({
      file,
      snippet: baseline ? diffSnippet(baseline[file] ?? null, content) : compactSnippet(content)
    });
  }

  return snippets;
}

function diffSnippet(beforeContent: string | null, afterContent: string): string {
  const beforeSet = new Set(
    typeof beforeContent === 'string'
      ? beforeContent.replace(/\r\n/g, '\n').split('\n')
      : []
  );
  const afterLines = afterContent.replace(/\r\n/g, '\n').split('\n');
  const lines: string[] = [];
  for (const line of afterLines) {
    if (lines.length >= 12) {
      lines.push('... (snippet truncated)');
      break;
    }
    lines.push((beforeSet.has(line) ? '  ' : '+ ') + line.trimEnd());
  }
  if (typeof beforeContent === 'string') {
    const afterSet = new Set(afterLines);
    let shownRemoved = 0;
    for (const line of beforeContent.replace(/\r\n/g, '\n').split('\n')) {
      if (shownRemoved >= 4) break;
      if (line && !afterSet.has(line)) {
        lines.push(`- ${line.trimEnd()}`);
        shownRemoved++;
      }
    }
  }
  const joined = lines.join('\n');
  return joined.length > 700 ? `${joined.slice(0, 697)}...` : joined;
}

export function formatSource(sourceFile?: string, sourceLine?: number): string {
  if (!sourceFile) return 'Unknown';
  const relativeSource = path.relative(process.cwd(), sourceFile).replace(/\\/g, '/');
  return sourceLine ? `${relativeSource}:${sourceLine}` : relativeSource;
}

export function formatChangedFiles(changedFiles: string[]): string {
  if (!changedFiles.length) return '(none)';
  return changedFiles.map(file => `\`${file}\``).join(', ');
}

export function resultLimitationMessages(result: EvaluationResult): string[] {
  return collectResultLimitationNotes(result).map(note => note.message);
}

function compactSnippet(content: string): string {
  const lines = content
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line => line.trimEnd())
    .filter(line => line.trim().length > 0)
    .slice(0, 8);

  const snippet = lines.join('\n');
  return snippet.length > 700 ? `${snippet.slice(0, 697)}...` : snippet;
}

function severityRank(severity: string): number {
  if (severity === 'high') return 3;
  if (severity === 'medium') return 2;
  if (severity === 'low') return 1;
  return 0;
}
