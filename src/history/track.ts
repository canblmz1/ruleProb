import fs from 'fs-extra';
import path from 'path';
import { Config } from '../types/index.js';

export interface HistoryEntry {
  timestamp: string;
  score: number;
  weightedScore: number;
  provider: string;
  extractor: string;
  totalRules: number;
  passed: number;
  partial: number;
  failed: number;
  skipped: number;
  branch?: string;
  commit?: string;
}

export interface ScoreTrend {
  direction: 'up' | 'down' | 'same';
  delta: number;
  previousScore: number | null;
  history: HistoryEntry[];
}

const HISTORY_FILE = 'history.json';
const MAX_ENTRIES = 100;

export async function loadHistory(config: Config): Promise<HistoryEntry[]> {
  const filePath = path.join(config.reportDir, HISTORY_FILE);
  if (await fs.pathExists(filePath)) {
    try {
      const data = await fs.readJson(filePath);
      if (Array.isArray(data)) return data;
      // File exists but is not an array — treat as corrupt.
      console.warn(`[ruleprobe] Warning: history file at ${filePath} is malformed (not an array). Starting fresh.`);
    } catch {
      console.warn(`[ruleprobe] Warning: could not parse history file at ${filePath}. Starting fresh.`);
    }
  }
  return [];
}

export async function appendHistory(
  results: {
    score: number;
    weightedScore: number;
    totalRules: number;
    passed: number;
    partial: number;
    failed: number;
    skipped: number;
  },
  config: Config
): Promise<ScoreTrend> {
  const history = await loadHistory(config);

  let branch: string | undefined;
  let commit: string | undefined;
  try {
    const { execa } = await import('execa');
    const { stdout: branchOut } = await execa('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { reject: false });
    branch = branchOut?.trim() || undefined;
    const { stdout: commitOut } = await execa('git', ['rev-parse', '--short', 'HEAD'], { reject: false });
    commit = commitOut?.trim() || undefined;
  } catch {
    // git not available
  }

  const entry: HistoryEntry = {
    timestamp: new Date().toISOString(),
    score: results.score,
    weightedScore: results.weightedScore,
    provider: config.provider,
    extractor: config.extractor || 'deterministic',
    totalRules: results.totalRules,
    passed: results.passed,
    partial: results.partial,
    failed: results.failed,
    skipped: results.skipped,
    branch,
    commit
  };

  history.push(entry);
  if (history.length > MAX_ENTRIES) {
    history.splice(0, history.length - MAX_ENTRIES);
  }

  const filePath = path.join(config.reportDir, HISTORY_FILE);
  await fs.ensureDir(config.reportDir);
  await fs.writeFile(filePath, JSON.stringify(history, null, 2), 'utf-8');

  const previous = history.length > 1 ? history[history.length - 2] : null;
  const previousScore = previous ? previous.score : null;
  let direction: 'up' | 'down' | 'same' = 'same';
  let delta = 0;

  if (previousScore !== null) {
    delta = Math.abs(results.score - previousScore);
    if (results.score > previousScore) direction = 'up';
    else if (results.score < previousScore) direction = 'down';
  }

  return { direction, delta, previousScore, history };
}

export type TrendSummary = {
  bestScore: number;
  worstScore: number;
  averageScore: number;
  runs: number;
  streak: { type: 'up' | 'down' | 'same'; count: number };
};

export async function clearHistory(config: Config): Promise<void> {
  const filePath = path.join(config.reportDir, HISTORY_FILE);
  if (await fs.pathExists(filePath)) await fs.remove(filePath);
}

export function filterHistory(
  history: HistoryEntry[],
  opts: { provider?: string; branch?: string } = {}
): HistoryEntry[] {
  return history.filter(e => {
    if (opts.provider && e.provider !== opts.provider) return false;
    if (opts.branch && e.branch !== opts.branch) return false;
    return true;
  });
}

export function computeTrendSummary(history: HistoryEntry[]): TrendSummary {
  if (history.length === 0) {
    return { bestScore: 0, worstScore: 0, averageScore: 0, runs: 0, streak: { type: 'same', count: 0 } };
  }

  const scores = history.map(h => h.score);
  const bestScore = Math.max(...scores);
  const worstScore = Math.min(...scores);
  const averageScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

  let streakType: 'up' | 'down' | 'same' = 'same';
  let streakCount = 0;
  for (let i = history.length - 1; i > 0; i--) {
    const curr = history[i].score;
    const prev = history[i - 1].score;
    const type: 'up' | 'down' | 'same' = curr > prev ? 'up' : curr < prev ? 'down' : 'same';
    if (i === history.length - 1) {
      streakType = type;
      streakCount = 1;
    } else if (type === streakType) {
      streakCount++;
    } else {
      break;
    }
  }

  return {
    bestScore,
    worstScore,
    averageScore,
    runs: history.length,
    streak: { type: streakType, count: streakCount }
  };
}
