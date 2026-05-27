import fs from 'fs-extra';
import path from 'path';
import type { HistoryInsight } from './types.js';
import type { HistoryEntry } from '../history/track.js';

/**
 * Mine .ruleprobe/history.json to extract failure trends.
 * Returns safe defaults when the file is missing or malformed.
 */
export async function mineHistory(reportDir: string): Promise<HistoryInsight> {
  const historyPath = path.join(reportDir, 'history.json');

  let history: HistoryEntry[] = [];
  if (await fs.pathExists(historyPath)) {
    try {
      const raw = await fs.readJson(historyPath);
      if (Array.isArray(raw)) {
        history = raw as HistoryEntry[];
      }
    } catch {
      // malformed — treat as empty
    }
  }

  if (history.length === 0) {
    return { failureRate: 0, trend: 'stable', totalRuns: 0 };
  }

  const totalRuns = history.length;

  // Compute average failure rate across all recorded runs
  const totalScenarios = history.reduce((acc, e) => acc + (e.failed ?? 0) + (e.passed ?? 0) + (e.partial ?? 0), 0);
  const totalFailed = history.reduce((acc, e) => acc + (e.failed ?? 0), 0);
  const failureRate = totalScenarios > 0 ? Math.round((totalFailed / totalScenarios) * 100) : 0;

  // Trend: compare first half vs second half average score
  let trend: 'improving' | 'declining' | 'stable' = 'stable';
  if (history.length >= 2) {
    const mid = Math.floor(history.length / 2);
    const firstHalf = history.slice(0, mid);
    const secondHalf = history.slice(mid);

    const avgFirst = firstHalf.reduce((acc, e) => acc + e.score, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((acc, e) => acc + e.score, 0) / secondHalf.length;
    const delta = avgSecond - avgFirst;

    if (delta >= 3) trend = 'improving';
    else if (delta <= -3) trend = 'declining';
    else trend = 'stable';
  }

  return { failureRate, trend, totalRuns };
}
