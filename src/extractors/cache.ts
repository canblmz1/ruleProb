import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import { Rule, Config } from '../types/index.js';
import { runAIAssistedExtraction } from './aiAssisted.js';

// File-content-hash-based cache so repeated `list-rules`/`compare`/`run`
// invocations against unchanged instruction files don't burn provider quota.
//
// Cache keys deliberately include provider, model, prompt-version, and
// extractor mode so we never reuse a cached result across model upgrades or
// prompt changes.
const PROMPT_VERSION = 'v1';

export async function runAIAssistedExtractionCached(
  files: { path: string; content: string }[],
  config: Config
): Promise<Rule[]> {
  const useCache = config.useExtractionCache !== false; // default ON
  const debug = config.debugExtractor;

  if (!useCache) {
    if (debug) console.log('[extractor cache] disabled via --no-cache');
    return runAIAssistedExtraction(files, config);
  }

  const cacheDir = path.resolve('.ruleprobe', 'cache');
  await fs.ensureDir(cacheDir);

  const provider = config.provider || 'unknown';
  const model = config.model || 'default';
  const mode = config.extractor || 'ai-assisted';

  const merged: Rule[] = [];
  const filesNeedingFetch: { path: string; content: string }[] = [];
  const fileToCachePath = new Map<string, string>();

  for (const file of files) {
    const fileHash = crypto.createHash('sha256').update(file.content).digest('hex').slice(0, 32);
    const key = `${provider}_${sanitizeForFilename(model)}_${mode}_${PROMPT_VERSION}_${fileHash}.json`;
    const cachePath = path.join(cacheDir, key);
    fileToCachePath.set(file.path, cachePath);

    if (await fs.pathExists(cachePath)) {
      try {
        const cached = await fs.readJson(cachePath);
        if (Array.isArray(cached?.rules)) {
          if (debug) console.log(`[extractor cache] hit for ${file.path} -> ${path.basename(cachePath)}`);
          merged.push(...cached.rules);
          continue;
        }
      } catch {
        // fall through to fetch on parse failure
      }
    }

    if (debug) console.log(`[extractor cache] miss for ${file.path}`);
    filesNeedingFetch.push(file);
  }

  if (filesNeedingFetch.length > 0) {
    const freshRules = await runAIAssistedExtraction(filesNeedingFetch, config);
    for (const file of filesNeedingFetch) {
      const fileRules = freshRules.filter(rule => rule.sourceFile === file.path);
      const cachePath = fileToCachePath.get(file.path);
      if (cachePath && fileRules.length > 0) {
        try {
          await fs.writeJson(cachePath, { rules: fileRules, savedAt: new Date().toISOString() }, { spaces: 2 });
        } catch {
          // cache write failure is non-fatal
        }
      }
      merged.push(...fileRules);
    }
  }

  return merged;
}

export async function clearExtractionCache(): Promise<number> {
  const cacheDir = path.resolve('.ruleprobe', 'cache');
  if (!await fs.pathExists(cacheDir)) return 0;
  const entries = await fs.readdir(cacheDir);
  let removed = 0;
  for (const entry of entries) {
    const target = path.join(cacheDir, entry);
    try {
      await fs.remove(target);
      removed++;
    } catch {
      // skip
    }
  }
  return removed;
}

function sanitizeForFilename(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]+/g, '_').slice(0, 80);
}
