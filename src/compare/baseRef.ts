import { execa } from 'execa';
import path from 'path';
import { Config, Rule } from '../types/index.js';
import { runHybridExtraction } from '../extractors/hybrid.js';
import { runDeterministicExtraction } from '../extractors/deterministic.js';
import { runAIAssistedExtractionCached } from '../extractors/cache.js';

export interface BaseRefComparison {
  base: string;
  baseSha: string | null;
  baseRules: Rule[];
  branchRules: Rule[];
  added: Rule[];
  removed: Rule[];
  changedCategoryRules: Array<{ text: string; sourceFile: string; baseCategory: string; branchCategory: string }>;
  notes: string[];
}

// Compare extraction output for the same instruction files between the
// current working tree and a git base ref. Used by `compare --base <ref>`.
export async function compareWithBaseRef(
  files: { path: string; content: string }[],
  config: Config,
  baseRef: string,
  cwd: string
): Promise<BaseRefComparison> {
  const notes: string[] = [];
  const branchRules = await runByMode(files, config);

  let baseSha: string | null = null;
  try {
    const sha = await execa('git', ['rev-parse', baseRef], { cwd, reject: false });
    if (sha.exitCode === 0) baseSha = sha.stdout.trim();
  } catch {
    // git not available
  }

  if (!baseSha) {
    notes.push(`Base ref "${baseRef}" not resolvable; falling back to branch-only extraction.`);
    return {
      base: baseRef,
      baseSha: null,
      baseRules: [],
      branchRules,
      added: branchRules,
      removed: [],
      changedCategoryRules: [],
      notes
    };
  }

  const baseFiles: { path: string; content: string }[] = [];
  for (const file of files) {
    const rel = path.relative(cwd, file.path).replace(/\\/g, '/');
    try {
      const show = await execa('git', ['show', `${baseSha}:${rel}`], { cwd, reject: false });
      if (show.exitCode === 0) {
        baseFiles.push({ path: file.path, content: show.stdout });
      } else {
        notes.push(`File not present at base ${baseRef}: ${rel}`);
      }
    } catch (e: any) {
      notes.push(`Could not read ${rel} at ${baseRef}: ${e?.message || 'unknown error'}`);
    }
  }

  const baseRules = baseFiles.length > 0 ? await runByMode(baseFiles, config) : [];
  const baseSignatures = new Map<string, Rule>();
  for (const rule of baseRules) baseSignatures.set(signature(rule), rule);
  const branchSignatures = new Map<string, Rule>();
  for (const rule of branchRules) branchSignatures.set(signature(rule), rule);

  const added = branchRules.filter(rule => !baseSignatures.has(signature(rule)));
  const removed = baseRules.filter(rule => !branchSignatures.has(signature(rule)));

  const changedCategoryRules: BaseRefComparison['changedCategoryRules'] = [];
  for (const branchRule of branchRules) {
    const candidate = baseRules.find(other =>
      other.sourceFile === branchRule.sourceFile && other.text.trim() === branchRule.text.trim()
    );
    if (candidate && candidate.category !== branchRule.category) {
      changedCategoryRules.push({
        text: branchRule.text,
        sourceFile: branchRule.sourceFile,
        baseCategory: candidate.category,
        branchCategory: branchRule.category
      });
    }
  }

  return {
    base: baseRef,
    baseSha,
    baseRules,
    branchRules,
    added,
    removed,
    changedCategoryRules,
    notes
  };
}

export function formatBaseRefComparison(result: BaseRefComparison): string {
  const lines: string[] = [];
  lines.push(`RuleProbe base-ref comparison`);
  lines.push(`Base: ${result.base}${result.baseSha ? ` (${result.baseSha.slice(0, 8)})` : ' (unresolved)'}`);
  lines.push(`Branch rules: ${result.branchRules.length}`);
  lines.push(`Base rules: ${result.baseRules.length}`);
  lines.push('');
  lines.push(`Added vs base (${result.added.length}):`);
  for (const rule of result.added.slice(0, 10)) {
    lines.push(`+ ${rule.category} | ${rule.sourceFile}${rule.lineNumber ? `:${rule.lineNumber}` : ''} | ${truncate(rule.text)}`);
  }
  if (result.added.length === 0) lines.push('- (none)');
  lines.push('');
  lines.push(`Removed vs base (${result.removed.length}):`);
  for (const rule of result.removed.slice(0, 10)) {
    lines.push(`- ${rule.category} | ${rule.sourceFile}${rule.lineNumber ? `:${rule.lineNumber}` : ''} | ${truncate(rule.text)}`);
  }
  if (result.removed.length === 0) lines.push('- (none)');
  lines.push('');
  lines.push(`Category drift (${result.changedCategoryRules.length}):`);
  for (const change of result.changedCategoryRules.slice(0, 10)) {
    lines.push(`* ${change.baseCategory} -> ${change.branchCategory} | ${change.sourceFile} | ${truncate(change.text)}`);
  }
  if (result.changedCategoryRules.length === 0) lines.push('- (none)');
  if (result.notes.length > 0) {
    lines.push('');
    lines.push('Notes:');
    for (const note of result.notes) lines.push(`- ${note}`);
  }
  return lines.join('\n');
}

async function runByMode(files: { path: string; content: string }[], config: Config): Promise<Rule[]> {
  const mode = config.extractor || 'deterministic';
  if (mode === 'hybrid') return runHybridExtraction(files, { ...config, extractor: 'hybrid' });
  if (mode === 'ai-assisted') return runAIAssistedExtractionCached(files, config);
  return runDeterministicExtraction(files);
}

function signature(rule: Rule): string {
  const firstAssertion = rule.assertions[0] as any;
  const value = firstAssertion?.commandIncludes || firstAssertion?.pattern || firstAssertion?.manager || firstAssertion?.text || '';
  return `${rule.sourceFile}|${rule.category}|${String(value).trim().toLowerCase()}`;
}

function truncate(text: string): string {
  return text.length > 88 ? `${text.slice(0, 85)}...` : text;
}
