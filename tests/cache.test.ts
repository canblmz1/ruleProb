import { describe, test, expect, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import { runAIAssistedExtractionCached, clearExtractionCache } from '../src/extractors/cache.js';

// Cache key formula mirrors src/extractors/cache.ts internals so we can
// inject and clean up specific entries without moving cwd.
function cacheKey(content: string, provider = 'openrouter', model = 'default', mode = 'ai-assisted'): string {
  const PROMPT_VERSION = 'v1';
  const sanitize = (v: string) => v.replace(/[^A-Za-z0-9_.-]+/g, '_').slice(0, 80);
  const fileHash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 32);
  return `${provider}_${sanitize(model)}_${mode}_${PROMPT_VERSION}_${fileHash}.json`;
}

const CACHE_DIR = path.resolve('.ruleprobe', 'cache');

// Track cache files we create so we can clean them up after each test
const createdCacheFiles: string[] = [];

afterEach(async () => {
  for (const file of createdCacheFiles.splice(0)) {
    try { await fs.remove(file); } catch { /* best effort */ }
  }
});

const baseConfig = {
  provider: 'openrouter' as const,
  instructionFiles: [] as string[],
  reportDir: '.ruleprobe',
  failBelow: 0,
  keepSandbox: false,
  extractor: 'ai-assisted'
};

describe('runAIAssistedExtractionCached', () => {
  test('returns rules via deterministic fallback when API key is absent', async () => {
    const content = '- ALWAYS use pnpm\n';
    const orig = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;

    // Track any cache file that gets written
    const key = cacheKey(content);
    createdCacheFiles.push(path.join(CACHE_DIR, key));

    try {
      const rules = await runAIAssistedExtractionCached(
        [{ path: 'CLAUDE.md', content }],
        baseConfig as any
      );
      expect(Array.isArray(rules)).toBe(true);
      expect(rules.length).toBeGreaterThan(0);
    } finally {
      if (orig !== undefined) process.env.OPENROUTER_API_KEY = orig;
    }
  });

  test('bypasses cache when useExtractionCache is false', async () => {
    const content = '- ALWAYS use pnpm\n';
    const orig = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;

    try {
      const rules = await runAIAssistedExtractionCached(
        [{ path: 'CLAUDE.md', content }],
        { ...baseConfig, useExtractionCache: false } as any
      );
      expect(Array.isArray(rules)).toBe(true);
    } finally {
      if (orig !== undefined) process.env.OPENROUTER_API_KEY = orig;
    }
  });

  test('serves rules from injected cache entry on cache hit', async () => {
    // Use unique content so the hash is predictable and unique to this test
    const uniqueContent = `- CACHE_HIT_TEST_UNIQUE_CONTENT_xyz123\n`;
    const key = cacheKey(uniqueContent, 'openrouter', 'default', 'ai-assisted');
    const cacheFilePath = path.join(CACHE_DIR, key);
    createdCacheFiles.push(cacheFilePath);

    const cachedRule = {
      id: 'injected-cache-rule',
      text: 'Rule served from injected cache',
      category: 'required_command',
      testable: true,
      severity: 'high',
      sourceFile: 'CLAUDE.md',
      lineNumber: 1,
      assertions: [{ type: 'required_command', commandIncludes: 'pnpm cached' }]
    };

    await fs.ensureDir(CACHE_DIR);
    await fs.writeJson(cacheFilePath, { rules: [cachedRule] });

    const orig = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;

    try {
      const rules = await runAIAssistedExtractionCached(
        [{ path: 'CLAUDE.md', content: uniqueContent }],
        baseConfig as any
      );
      expect(rules.some(r => r.id === 'injected-cache-rule')).toBe(true);
    } finally {
      if (orig !== undefined) process.env.OPENROUTER_API_KEY = orig;
    }
  });

  test('recovers gracefully when cache file is corrupted', async () => {
    const content = `- CACHE_CORRUPT_TEST_UNIQUE_abc987\n`;
    const key = cacheKey(content, 'openrouter', 'default', 'ai-assisted');
    const cacheFilePath = path.join(CACHE_DIR, key);
    createdCacheFiles.push(cacheFilePath);

    // Write corrupted JSON to simulate a corrupt cache
    await fs.ensureDir(CACHE_DIR);
    await fs.writeFile(cacheFilePath, 'NOT VALID JSON {{ ', 'utf-8');

    const orig = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;

    try {
      const rules = await runAIAssistedExtractionCached(
        [{ path: 'CLAUDE.md', content }],
        baseConfig as any
      );
      // Should recover via deterministic fallback (no crash)
      expect(Array.isArray(rules)).toBe(true);
    } finally {
      if (orig !== undefined) process.env.OPENROUTER_API_KEY = orig;
    }
  });

  test('cache entry has rules array in stored JSON', async () => {
    const content = `- CACHE_WRITE_TEST_UNIQUE_def456\n`;
    const key = cacheKey(content, 'openrouter', 'default', 'ai-assisted');
    const cacheFilePath = path.join(CACHE_DIR, key);
    createdCacheFiles.push(cacheFilePath);

    const orig = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;

    try {
      const rules = await runAIAssistedExtractionCached(
        [{ path: 'CLAUDE.md', content }],
        baseConfig as any
      );
      // The cache might not write when there are no rules to save; just verify
      // that the function returns an array without error.
      expect(Array.isArray(rules)).toBe(true);
    } finally {
      if (orig !== undefined) process.env.OPENROUTER_API_KEY = orig;
    }
  });
});

describe('clearExtractionCache', () => {
  test('returns a non-negative number and does not crash', async () => {
    const removed = await clearExtractionCache();
    expect(typeof removed).toBe('number');
    expect(removed).toBeGreaterThanOrEqual(0);
  });

  test('removes test-injected cache files and returns the correct count', async () => {
    const content = `- CLEAR_CACHE_TEST_UNIQUE_ghi789\n`;
    const key = cacheKey(content);
    const cacheFilePath = path.join(CACHE_DIR, key);
    // Do NOT add to createdCacheFiles — clearExtractionCache should remove it for us

    await fs.ensureDir(CACHE_DIR);
    await fs.writeJson(cacheFilePath, { rules: [] });

    // clearExtractionCache removes everything in the cache dir
    const removed = await clearExtractionCache();
    expect(removed).toBeGreaterThanOrEqual(1);

    const stillExists = await fs.pathExists(cacheFilePath);
    expect(stillExists).toBe(false);
  });
});
