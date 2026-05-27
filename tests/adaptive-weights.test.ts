import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { loadAdaptiveWeights } from '../src/weights/adaptive.js';
import type { HistoryEntry } from '../src/history/track.js';

const STATIC_WEIGHTS = { high: 3, medium: 2, low: 1 };

function makeEntry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    timestamp: new Date().toISOString(),
    score: 80,
    weightedScore: 80,
    provider: 'mock',
    extractor: 'deterministic',
    totalRules: 10,
    passed: 8,
    partial: 0,
    failed: 2,
    skipped: 0,
    ...overrides,
  };
}

function makeHighFailEntry(): HistoryEntry {
  return makeEntry({ passed: 3, partial: 0, failed: 7, skipped: 0, score: 30, weightedScore: 30 });
}

function makeModerateFailEntry(): HistoryEntry {
  return makeEntry({ passed: 8, partial: 0, failed: 2, skipped: 0, score: 80, weightedScore: 80 });
}

function makeLowFailEntry(): HistoryEntry {
  return makeEntry({ passed: 10, partial: 0, failed: 0, skipped: 0, score: 100, weightedScore: 100 });
}

let tmpDir: string;
beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ruleprobe-aw-'));
});
afterEach(async () => {
  await fs.remove(tmpDir);
});

describe('loadAdaptiveWeights', () => {
  it('returns static weights and source=static when no history file exists', async () => {
    const result = await loadAdaptiveWeights(tmpDir, STATIC_WEIGHTS);
    expect(result.source).toBe('static');
    expect(result.weights).toEqual(STATIC_WEIGHTS);
    expect(result.runsAnalyzed).toBe(0);
  });

  it('returns static weights when fewer than 3 runs', async () => {
    const history: HistoryEntry[] = [makeEntry(), makeEntry()];
    await fs.writeJson(path.join(tmpDir, 'history.json'), history);

    const result = await loadAdaptiveWeights(tmpDir, STATIC_WEIGHTS);
    expect(result.source).toBe('static');
    expect(result.weights).toEqual(STATIC_WEIGHTS);
    expect(result.runsAnalyzed).toBe(0);
  });

  it('returns adaptive weights with higher "high" severity weight when failure rate >30%', async () => {
    // 7/10 failed each run → ~70% failure rate
    const history: HistoryEntry[] = [
      makeHighFailEntry(),
      makeHighFailEntry(),
      makeHighFailEntry(),
    ];
    await fs.writeJson(path.join(tmpDir, 'history.json'), history);

    const result = await loadAdaptiveWeights(tmpDir, STATIC_WEIGHTS);
    expect(result.source).toBe('adaptive');
    expect(result.runsAnalyzed).toBe(3);
    // High severity weight should be boosted above baseline of 3
    expect(result.weights['high']).toBeGreaterThan(STATIC_WEIGHTS['high']);
    // Medium and low stay unchanged (only high gets boosted for high failure rate)
    expect(result.weights['low']).toBe(STATIC_WEIGHTS['low']);
  });

  it('returns adaptive weights with boosted "medium" weight when failure rate 15-30%', async () => {
    // 2/10 failed each run → 20% failure rate (moderate)
    const history: HistoryEntry[] = [
      makeModerateFailEntry(),
      makeModerateFailEntry(),
      makeModerateFailEntry(),
    ];
    await fs.writeJson(path.join(tmpDir, 'history.json'), history);

    const result = await loadAdaptiveWeights(tmpDir, STATIC_WEIGHTS);
    expect(result.source).toBe('adaptive');
    expect(result.weights['medium']).toBeGreaterThan(STATIC_WEIGHTS['medium']);
    // High severity is unchanged (failure rate not >30%)
    expect(result.weights['high']).toBe(STATIC_WEIGHTS['high']);
  });

  it('returns static weights when failure rate is below 15%', async () => {
    // 0/10 failed → 0% failure rate
    const history: HistoryEntry[] = [
      makeLowFailEntry(),
      makeLowFailEntry(),
      makeLowFailEntry(),
    ];
    await fs.writeJson(path.join(tmpDir, 'history.json'), history);

    const result = await loadAdaptiveWeights(tmpDir, STATIC_WEIGHTS);
    // source may be 'static' because weights didn't change
    expect(result.weights['high']).toBe(STATIC_WEIGHTS['high']);
    expect(result.weights['medium']).toBe(STATIC_WEIGHTS['medium']);
    expect(result.weights['low']).toBe(STATIC_WEIGHTS['low']);
  });

  it('all weights clamped to [1, 10] range even if boosted aggressively', async () => {
    // Simulate extreme static weights + high failure
    const extremeWeights = { high: 9, medium: 8, low: 7 };
    const history: HistoryEntry[] = [
      makeHighFailEntry(),
      makeHighFailEntry(),
      makeHighFailEntry(),
      makeHighFailEntry(),
      makeHighFailEntry(),
    ];
    await fs.writeJson(path.join(tmpDir, 'history.json'), history);

    const result = await loadAdaptiveWeights(tmpDir, extremeWeights);
    for (const [, w] of Object.entries(result.weights)) {
      expect(w).toBeGreaterThanOrEqual(1);
      expect(w).toBeLessThanOrEqual(10);
    }
  });

  it('exponential decay: recent high-failure entries dominate over old low-failure entries', async () => {
    // Old entries: low failure. Recent entries: high failure.
    const history: HistoryEntry[] = [
      // 5 old low-failure entries
      makeLowFailEntry(),
      makeLowFailEntry(),
      makeLowFailEntry(),
      makeLowFailEntry(),
      makeLowFailEntry(),
      // 3 recent high-failure entries
      makeHighFailEntry(),
      makeHighFailEntry(),
      makeHighFailEntry(),
    ];
    await fs.writeJson(path.join(tmpDir, 'history.json'), history);

    const resultWithDecay = await loadAdaptiveWeights(tmpDir, STATIC_WEIGHTS);

    // With decay, recent high failures should pull the weighted failure rate high enough
    // to trigger adaptive weighting
    expect(resultWithDecay.runsAnalyzed).toBe(8);
    // The high-failure recent entries should boost the high weight
    expect(resultWithDecay.weights['high']).toBeGreaterThan(STATIC_WEIGHTS['high']);
  });

  it('is graceful when history.json is malformed JSON', async () => {
    await fs.writeFile(path.join(tmpDir, 'history.json'), 'not-valid-json', 'utf-8');
    const result = await loadAdaptiveWeights(tmpDir, STATIC_WEIGHTS);
    expect(result.source).toBe('static');
    expect(result.weights).toEqual(STATIC_WEIGHTS);
    expect(result.runsAnalyzed).toBe(0);
  });

  it('writes weights.adaptive.json when enough history exists', async () => {
    const history: HistoryEntry[] = [
      makeHighFailEntry(),
      makeHighFailEntry(),
      makeHighFailEntry(),
    ];
    await fs.writeJson(path.join(tmpDir, 'history.json'), history);

    await loadAdaptiveWeights(tmpDir, STATIC_WEIGHTS);

    const outPath = path.join(tmpDir, 'weights.adaptive.json');
    expect(await fs.pathExists(outPath)).toBe(true);
    const saved = await fs.readJson(outPath);
    expect(saved).toHaveProperty('weights');
    expect(saved).toHaveProperty('source');
    expect(saved).toHaveProperty('runsAnalyzed');
    expect(saved).toHaveProperty('generatedAt');
  });
});
