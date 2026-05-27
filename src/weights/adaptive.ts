/**
 * Computes per-category adaptive severity weights from historical run data.
 * Uses exponential decay so recent failures matter more than old ones.
 * Falls back to provided static weights when insufficient history exists.
 */

import fs from 'fs-extra';
import path from 'path';
import type { HistoryEntry } from '../history/track.js';

export interface AdaptiveWeightsResult {
  weights: Record<string, number>;  // category or severity → weight (1-10)
  source: 'adaptive' | 'static';   // whether adaptive weights were actually applied
  runsAnalyzed: number;
}

const DECAY_FACTOR = 0.8;
const MIN_WEIGHT = 1;
const MAX_WEIGHT = 10;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Compute a failure-rate weighted by exponential decay over ordered history entries.
 * Entries at the end of the array are most recent and get more weight.
 */
function weightedFailureRate(entries: HistoryEntry[]): number {
  let weightedFailures = 0;
  let weightedTotal = 0;

  for (let i = 0; i < entries.length; i++) {
    // Most recent entry (last) gets weight of 1.0, older get 0.8^distance
    const distance = entries.length - 1 - i;
    const decayWeight = Math.pow(DECAY_FACTOR, distance);

    const entry = entries[i];
    const total = (entry.passed ?? 0) + (entry.partial ?? 0) + (entry.failed ?? 0);
    if (total === 0) continue;

    const failRate = (entry.failed ?? 0) / total;
    weightedFailures += failRate * decayWeight;
    weightedTotal += decayWeight;
  }

  return weightedTotal > 0 ? weightedFailures / weightedTotal : 0;
}

export async function loadAdaptiveWeights(
  reportDir: string,
  staticWeights: Record<string, number>
): Promise<AdaptiveWeightsResult> {
  const historyPath = path.join(reportDir, 'history.json');

  let history: HistoryEntry[] = [];
  try {
    if (await fs.pathExists(historyPath)) {
      const raw = await fs.readJson(historyPath);
      if (Array.isArray(raw)) {
        history = raw as HistoryEntry[];
      }
    }
  } catch {
    // history file unreadable — fall back to static
    return { weights: { ...staticWeights }, source: 'static', runsAnalyzed: 0 };
  }

  if (history.length < 3) {
    return { weights: { ...staticWeights }, source: 'static', runsAnalyzed: 0 };
  }

  const failRate = weightedFailureRate(history);

  const adaptedWeights: Record<string, number> = { ...staticWeights };

  if (failRate > 0.30) {
    // High failure rate: boost high severity by up to 2x
    const baseHigh = staticWeights['high'] ?? 3;
    const boost = 1 + Math.min(1, failRate - 0.30) * (1 / 0.70);  // linear 1x→2x from 30%→100%
    adaptedWeights['high'] = clamp(baseHigh * (1 + boost * 1.0), MIN_WEIGHT, MAX_WEIGHT);
  } else if (failRate > 0.15) {
    // Moderate failure rate: boost medium severity by 1.5x
    const baseMedium = staticWeights['medium'] ?? 2;
    const boost = (failRate - 0.15) / (0.30 - 0.15);  // linear 0→1 from 15%→30%
    adaptedWeights['medium'] = clamp(baseMedium * (1 + boost * 0.5), MIN_WEIGHT, MAX_WEIGHT);
  }
  // else: failure rate is low — use static weights as-is

  // Determine if any weight actually changed
  const changed = Object.keys(adaptedWeights).some(
    k => adaptedWeights[k] !== staticWeights[k]
  );

  const result: AdaptiveWeightsResult = {
    weights: adaptedWeights,
    source: changed ? 'adaptive' : 'static',
    runsAnalyzed: history.length
  };

  // Persist the result for inspection
  try {
    await fs.ensureDir(reportDir);
    await fs.writeFile(
      path.join(reportDir, 'weights.adaptive.json'),
      JSON.stringify({ ...result, generatedAt: new Date().toISOString() }, null, 2),
      'utf-8'
    );
  } catch {
    // non-fatal: just skip writing the output file
  }

  return result;
}
