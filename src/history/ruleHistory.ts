import fs from 'fs-extra';
import path from 'path';
import type { Config, EvaluationResult } from '../types/index.js';

const RULE_HISTORY_FILE = 'rule-history.json';
const MAX = 50;

export interface RuleRunStatus {
  ts: string;
  status: EvaluationResult['status'];
  score: number;
}

export interface RuleHistory {
  signature: string;
  ruleText: string;
  sourceFile?: string;
  sourceLine?: number;
  runs: RuleRunStatus[];
}

export function ruleSignature(
  r: Pick<EvaluationResult, 'category' | 'ruleText' | 'sourceFile'>
): string {
  return `${r.category ?? 'unknown'}::${(r.ruleText ?? '').trim().toLowerCase()}::${r.sourceFile ?? ''}`;
}

export async function appendRuleHistory(
  results: EvaluationResult[],
  config: Config
): Promise<void> {
  const fp = path.join(config.reportDir, RULE_HISTORY_FILE);
  const existing: RuleHistory[] = (await fs.pathExists(fp))
    ? await fs.readJson(fp).catch(() => [])
    : [];

  const bySig = new Map(existing.map(h => [h.signature, h]));
  const ts = new Date().toISOString();

  for (const r of results) {
    const sig = ruleSignature(r);
    const h = bySig.get(sig) ?? {
      signature: sig,
      ruleText: r.ruleText ?? '',
      sourceFile: r.sourceFile,
      sourceLine: r.sourceLine,
      runs: [],
    };
    h.runs.push({ ts, status: r.status, score: r.score });
    if (h.runs.length > MAX) h.runs.splice(0, h.runs.length - MAX);
    bySig.set(sig, h);
  }

  await fs.ensureDir(config.reportDir);
  await fs.writeJson(fp, Array.from(bySig.values()), { spaces: 2 });
}

export async function loadRuleHistory(config: Config): Promise<RuleHistory[]> {
  const fp = path.join(config.reportDir, RULE_HISTORY_FILE);
  return (await fs.pathExists(fp))
    ? await fs.readJson(fp).catch(() => [])
    : [];
}
