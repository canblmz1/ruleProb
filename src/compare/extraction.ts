import { Config, Rule, RuleCategory } from '../types/index.js';
import { runDeterministicExtraction } from '../extractors/deterministic.js';
import { runHybridExtraction } from '../extractors/hybrid.js';

export interface RuleComparison {
  deterministic: Rule[];
  hybrid: Rule[];
  deterministicOnly: Rule[];
  hybridOnly: Rule[];
  categoryDeltas: Array<{
    category: RuleCategory;
    deterministic: number;
    hybrid: number;
    delta: number;
  }>;
  cleanedNoise: Array<{
    rule: Rule;
    reason: string;
  }>;
  repairedCategories: Array<{
    text: string;
    sourceFile: string;
    lineNumber?: number;
    deterministicCategory: RuleCategory;
    hybridCategory: RuleCategory;
  }>;
}

export async function compareDeterministicToHybrid(files: { path: string; content: string }[], config: Config): Promise<RuleComparison> {
  const deterministic = runDeterministicExtraction(files);
  const hybrid = await runHybridExtraction(files, { ...config, extractor: 'hybrid' });
  const deterministicSignatures = countSignatures(deterministic);
  const hybridSignatures = countSignatures(hybrid);

  const deterministicOnly = rulesOnlyInLeft(deterministic, hybridSignatures);
  const hybridOnly = rulesOnlyInLeft(hybrid, deterministicSignatures);
  const categories = new Set<RuleCategory>([
    ...deterministic.map(rule => rule.category),
    ...hybrid.map(rule => rule.category)
  ]);

  const categoryDeltas = Array.from(categories).sort().map(category => {
    const deterministicCount = deterministic.filter(rule => rule.category === category).length;
    const hybridCount = hybrid.filter(rule => rule.category === category).length;
    return {
      category,
      deterministic: deterministicCount,
      hybrid: hybridCount,
      delta: hybridCount - deterministicCount
    };
  });

  const hybridByText = new Map<string, Rule[]>();
  for (const rule of hybrid) {
    const key = textKey(rule);
    hybridByText.set(key, [...(hybridByText.get(key) || []), rule]);
  }

  const repairedCategories = deterministicOnly.flatMap(rule => {
    const repaired = (hybridByText.get(textKey(rule)) || []).find(candidate => candidate.category !== rule.category);
    return repaired ? [{
      text: rule.text,
      sourceFile: rule.sourceFile,
      lineNumber: rule.lineNumber,
      deterministicCategory: rule.category,
      hybridCategory: repaired.category
    }] : [];
  });

  const cleanedNoise = deterministicOnly
    .filter(rule => rule.testable && !repairedCategories.some(repair => repair.text === rule.text && repair.sourceFile === rule.sourceFile))
    .map(rule => ({
      rule,
      reason: inferNoiseReason(rule)
    }));

  return {
    deterministic,
    hybrid,
    deterministicOnly,
    hybridOnly,
    categoryDeltas,
    cleanedNoise,
    repairedCategories
  };
}

export function formatRuleComparison(comparison: RuleComparison): string {
  const lines = [
    'RuleProbe deterministic vs hybrid comparison',
    '',
    `Rules extracted: deterministic=${comparison.deterministic.length}, hybrid=${comparison.hybrid.length}`,
    '',
    'Category deltas:',
    ...comparison.categoryDeltas.map(delta =>
      `- ${delta.category}: deterministic=${delta.deterministic}, hybrid=${delta.hybrid}, delta=${formatDelta(delta.delta)}`
    ),
    '',
    'Rules only in deterministic:',
    ...formatRuleList(comparison.deterministicOnly),
    '',
    'Rules only in hybrid:',
    ...formatRuleList(comparison.hybridOnly),
    '',
    'Notable cleaned noise / repaired categories:',
    ...formatCleanupList(comparison)
  ];

  return lines.join('\n');
}

function formatRuleList(rules: Rule[]): string[] {
  if (rules.length === 0) return ['- (none)'];
  return rules.slice(0, 12).map(rule => `- ${rule.category} | ${sourceLabel(rule)} | ${truncate(rule.text)}`);
}

function formatCleanupList(comparison: RuleComparison): string[] {
  const lines: string[] = [];
  for (const repair of comparison.repairedCategories.slice(0, 8)) {
    lines.push(`- repaired category ${repair.deterministicCategory} -> ${repair.hybridCategory} | ${repair.sourceFile}${repair.lineNumber ? `:${repair.lineNumber}` : ''} | ${truncate(repair.text)}`);
  }
  for (const cleaned of comparison.cleanedNoise.slice(0, 8)) {
    lines.push(`- cleaned ${cleaned.rule.category} | ${sourceLabel(cleaned.rule)} | ${cleaned.reason} | ${truncate(cleaned.rule.text)}`);
  }
  return lines.length > 0 ? lines : ['- (none detected)'];
}

function ruleSignature(rule: Rule): string {
  const firstAssertion = rule.assertions[0] as any;
  const assertionValue = firstAssertion?.commandIncludes || firstAssertion?.pattern || firstAssertion?.manager || firstAssertion?.text || '';
  return [
    rule.sourceFile,
    rule.category,
    String(assertionValue).trim().toLowerCase(),
    rule.testable ? 'testable' : 'informational'
  ].join('|');
}

function countSignatures(rules: Rule[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const rule of rules) {
    const signature = ruleSignature(rule);
    counts.set(signature, (counts.get(signature) || 0) + 1);
  }
  return counts;
}

function rulesOnlyInLeft(leftRules: Rule[], rightCounts: Map<string, number>): Rule[] {
  const seen = new Map<string, number>();
  const only: Rule[] = [];

  for (const rule of leftRules) {
    const signature = ruleSignature(rule);
    const current = (seen.get(signature) || 0) + 1;
    seen.set(signature, current);
    if (current > (rightCounts.get(signature) || 0)) {
      only.push(rule);
    }
  }

  return only;
}

function textKey(rule: Rule): string {
  return `${rule.sourceFile}|${rule.lineNumber || ''}|${rule.text.trim().toLowerCase()}`;
}

function sourceLabel(rule: Rule): string {
  return `${rule.sourceFile}${rule.lineNumber ? `:${rule.lineNumber}` : ''}`;
}

function truncate(text: string): string {
  return text.length > 88 ? `${text.slice(0, 85)}...` : text;
}

function formatDelta(value: number): string {
  if (value > 0) return `+${value}`;
  return String(value);
}

function inferNoiseReason(rule: Rule): string {
  if (rule.category === 'required_command' || rule.category === 'forbidden_command') {
    const command = (rule.assertions[0] as any)?.commandIncludes || '';
    if (command && !/^(pnpm|npm|yarn|bun|npx|node|vitest|playwright|docker|git|bazel|cargo|go|python|pytest|eslint|biome|tsc|turbo|nx)(\s|$)/i.test(command)) {
      return `non-command token "${command}"`;
    }
  }
  if (!rule.assertions.length) return 'no executable assertion';
  return 'deduplicated or filtered by hybrid validation';
}
