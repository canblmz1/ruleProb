import { Rule } from '../types/index.js';
import { DiscoveredFile } from '../instructions/discover.js';

// Rough approximation: ~4 chars per token (GPT-family heuristic, good enough for estimates)
const CHARS_PER_TOKEN = 4;
const CONTEXT_WARNING_TOKENS = 2000;
const RULE_WARNING_TOKENS = 50;

export interface RuleTokenInfo {
  ruleId: string;
  ruleText: string;
  sourceFile: string;
  estimatedTokens: number;
  category: string;
}

export interface FileTokenInfo {
  filePath: string;
  rawTokens: number;
  ruleCount: number;
  rules: RuleTokenInfo[];
}

export interface TokenReport {
  totalTokens: number;
  files: FileTokenInfo[];
  topRules: RuleTokenInfo[];
  warnings: string[];
  recommendations: string[];
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function analyzeTokens(files: DiscoveredFile[], rules: Rule[]): TokenReport {
  const rulesByFile = new Map<string, Rule[]>();
  for (const rule of rules) {
    const key = rule.sourceFile;
    if (!rulesByFile.has(key)) rulesByFile.set(key, []);
    rulesByFile.get(key)!.push(rule);
  }

  const fileInfos: FileTokenInfo[] = files.map(f => {
    const rawTokens = estimateTokens(f.content);
    const fileRules = rulesByFile.get(f.path) ?? [];
    const ruleInfos: RuleTokenInfo[] = fileRules.map(r => ({
      ruleId: r.id,
      ruleText: r.text,
      sourceFile: f.path,
      estimatedTokens: estimateTokens(r.rawLine ?? r.text),
      category: r.category,
    }));
    return { filePath: f.path, rawTokens, ruleCount: fileRules.length, rules: ruleInfos };
  });

  const totalTokens = fileInfos.reduce((sum, f) => sum + f.rawTokens, 0);

  const allRuleInfos = fileInfos.flatMap(f => f.rules);
  const topRules = [...allRuleInfos].sort((a, b) => b.estimatedTokens - a.estimatedTokens).slice(0, 5);

  const warnings: string[] = [];
  const recommendations: string[] = [];

  for (const fi of fileInfos) {
    if (fi.rawTokens > CONTEXT_WARNING_TOKENS) {
      warnings.push(`${shortPath(fi.filePath)} uses ~${fi.rawTokens} tokens — exceeds recommended 2,000 token limit.`);
      recommendations.push(`Split ${shortPath(fi.filePath)} into path-scoped sections using AGENTS.md globs frontmatter.`);
    }
    for (const r of fi.rules) {
      if (r.estimatedTokens > RULE_WARNING_TOKENS) {
        warnings.push(`Rule "${truncate(r.ruleText, 60)}" uses ~${r.estimatedTokens} tokens. Consider shortening.`);
      }
    }
  }

  if (totalTokens > 4000) {
    recommendations.push('Total instruction context exceeds 4,000 tokens. Consider removing informational notes — they waste context without being testable.');
  }

  const nonTestableCount = rules.filter(r => !r.testable).length;
  if (nonTestableCount > 0) {
    const savedTokens = rules.filter(r => !r.testable).reduce((s, r) => s + estimateTokens(r.rawLine ?? r.text), 0);
    recommendations.push(`${nonTestableCount} non-testable rule(s) found. Removing or converting them could save ~${savedTokens} token(s).`);
  }

  return { totalTokens, files: fileInfos, topRules, warnings, recommendations };
}

export function formatTokenReport(report: TokenReport): string {
  const lines: string[] = [];

  lines.push(`Token Efficiency Report`);
  lines.push(`  Total estimated tokens: ~${report.totalTokens}`);
  lines.push(`  Instruction files: ${report.files.length}\n`);

  lines.push('Per-file breakdown:');
  for (const f of report.files) {
    const bar = '█'.repeat(Math.min(30, Math.ceil(f.rawTokens / 50)));
    lines.push(`  ${shortPath(f.filePath)}`);
    lines.push(`    ~${f.rawTokens} tokens  ${f.ruleCount} rules  ${bar}`);
  }

  if (report.topRules.length > 0) {
    lines.push('\nTop 5 most token-expensive rules:');
    for (const r of report.topRules) {
      lines.push(`  ~${r.estimatedTokens} tokens  [${r.category}]  "${truncate(r.ruleText, 70)}"`);
    }
  }

  if (report.warnings.length > 0) {
    lines.push('\nWarnings:');
    for (const w of report.warnings) lines.push(`  ⚠ ${w}`);
  }

  if (report.recommendations.length > 0) {
    lines.push('\nRecommendations:');
    for (const r of report.recommendations) lines.push(`  → ${r}`);
  }

  if (report.warnings.length === 0 && report.recommendations.length === 0) {
    lines.push('\n✓ Token usage looks efficient.');
  }

  return lines.join('\n');
}

function shortPath(p: string): string {
  return p.replace(/\\/g, '/').split('/').slice(-2).join('/');
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
