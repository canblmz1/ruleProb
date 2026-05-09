import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { loadHistory, appendHistory, clearHistory, filterHistory, computeTrendSummary } from '../src/history/track.js';
import type { Config } from '../src/types/index.js';

function makeConfig(reportDir: string): Config {
  return {
    provider: 'mock',
    instructionFiles: [],
    reportDir,
    extractor: 'deterministic',
  } as unknown as Config;
}

let tmpDir: string;
beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ruleprobe-hist-'));
});
afterEach(async () => {
  await fs.remove(tmpDir);
});

describe('computeTrendSummary', () => {
  it('returns zeros for empty history', () => {
    const t = computeTrendSummary([]);
    expect(t).toEqual({ bestScore: 0, worstScore: 0, averageScore: 0, runs: 0, streak: { type: 'same', count: 0 } });
  });

  it('computes best, worst, average correctly', () => {
    const entries = [60, 80, 70].map((score, i) => ({
      timestamp: new Date(i).toISOString(),
      score,
      weightedScore: score,
      provider: 'mock',
      extractor: 'deterministic',
      totalRules: 5,
      passed: 3,
      partial: 1,
      failed: 1,
      skipped: 0,
    }));
    const t = computeTrendSummary(entries);
    expect(t.bestScore).toBe(80);
    expect(t.worstScore).toBe(60);
    expect(t.averageScore).toBe(70);
    expect(t.runs).toBe(3);
  });

  it('detects upward streak', () => {
    const scores = [50, 60, 70, 80];
    const entries = scores.map((score, i) => ({
      timestamp: new Date(i).toISOString(),
      score,
      weightedScore: score,
      provider: 'mock',
      extractor: 'deterministic',
      totalRules: 5,
      passed: 3,
      partial: 1,
      failed: 1,
      skipped: 0,
    }));
    const t = computeTrendSummary(entries);
    expect(t.streak.type).toBe('up');
    expect(t.streak.count).toBe(3);
  });

  it('detects downward streak', () => {
    const scores = [80, 70, 60, 50];
    const entries = scores.map((score, i) => ({
      timestamp: new Date(i).toISOString(),
      score,
      weightedScore: score,
      provider: 'mock',
      extractor: 'deterministic',
      totalRules: 5,
      passed: 3,
      partial: 1,
      failed: 1,
      skipped: 0,
    }));
    const t = computeTrendSummary(entries);
    expect(t.streak.type).toBe('down');
    expect(t.streak.count).toBe(3);
  });

  it('breaks streak correctly', () => {
    const scores = [50, 80, 70, 90];
    const entries = scores.map((score, i) => ({
      timestamp: new Date(i).toISOString(),
      score,
      weightedScore: score,
      provider: 'mock',
      extractor: 'deterministic',
      totalRules: 5,
      passed: 3,
      partial: 1,
      failed: 1,
      skipped: 0,
    }));
    const t = computeTrendSummary(entries);
    expect(t.streak.type).toBe('up');
    expect(t.streak.count).toBe(1);
  });
});

describe('filterHistory', () => {
  const entries = [
    { provider: 'mock', branch: 'main', score: 80 },
    { provider: 'gemini', branch: 'main', score: 90 },
    { provider: 'mock', branch: 'feature', score: 70 },
    { provider: 'gemini', branch: 'feature', score: 75 },
  ].map((e, i) => ({
    ...e,
    timestamp: new Date(i).toISOString(),
    weightedScore: e.score,
    extractor: 'deterministic',
    totalRules: 5,
    passed: 3,
    partial: 1,
    failed: 1,
    skipped: 0,
  }));

  it('returns all entries when no filter', () => {
    expect(filterHistory(entries)).toHaveLength(4);
  });

  it('filters by provider', () => {
    const result = filterHistory(entries, { provider: 'mock' });
    expect(result).toHaveLength(2);
    expect(result.every(e => e.provider === 'mock')).toBe(true);
  });

  it('filters by branch', () => {
    const result = filterHistory(entries, { branch: 'main' });
    expect(result).toHaveLength(2);
    expect(result.every(e => e.branch === 'main')).toBe(true);
  });

  it('filters by provider and branch', () => {
    const result = filterHistory(entries, { provider: 'gemini', branch: 'feature' });
    expect(result).toHaveLength(1);
    expect(result[0].score).toBe(75);
  });

  it('returns empty when no match', () => {
    expect(filterHistory(entries, { provider: 'openrouter' })).toHaveLength(0);
  });
});

describe('history persistence', () => {
  it('loads empty array when no history file', async () => {
    const config = makeConfig(tmpDir);
    const h = await loadHistory(config);
    expect(h).toEqual([]);
  });

  it('appends and loads entries correctly', async () => {
    const config = makeConfig(tmpDir);
    await appendHistory({ score: 85, weightedScore: 85, totalRules: 5, passed: 4, partial: 0, failed: 1, skipped: 0 }, config);
    const h = await loadHistory(config);
    expect(h).toHaveLength(1);
    expect(h[0].score).toBe(85);
    expect(h[0].provider).toBe('mock');
  });

  it('clears history file', async () => {
    const config = makeConfig(tmpDir);
    await appendHistory({ score: 85, weightedScore: 85, totalRules: 5, passed: 4, partial: 0, failed: 1, skipped: 0 }, config);
    await clearHistory(config);
    const h = await loadHistory(config);
    expect(h).toEqual([]);
  });

  it('clear is safe when history file does not exist', async () => {
    const config = makeConfig(tmpDir);
    await expect(clearHistory(config)).resolves.not.toThrow();
  });
});
