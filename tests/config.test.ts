import { describe, test, expect, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { loadConfig, defaultConfig } from '../src/config/load.js';

const tmpDirs: string[] = [];

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await fs.remove(dir);
  }
});

async function makeTmpDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ruleprobe-config-'));
  tmpDirs.push(dir);
  return dir;
}

describe('loadConfig', () => {
  test('returns defaultConfig when no file exists', async () => {
    const dir = await makeTmpDir();
    // Change working directory context by providing a path that doesn't exist
    const config = await loadConfig(path.join(dir, 'nonexistent.config.json'));
    expect(config).toEqual(defaultConfig);
  });

  test('merges user config with defaults when file exists', async () => {
    const dir = await makeTmpDir();
    const configPath = path.join(dir, 'ruleprobe.config.json');
    await fs.writeJson(configPath, { provider: 'openrouter', failBelow: 90 });
    const config = await loadConfig(configPath);
    expect(config.provider).toBe('openrouter');
    expect(config.failBelow).toBe(90);
    // Defaults still apply for unspecified fields
    expect(config.reportDir).toBe(defaultConfig.reportDir);
    expect(config.keepSandbox).toBe(defaultConfig.keepSandbox);
  });

  test('falls back to defaults when JSON is invalid, with a console warning', async () => {
    const dir = await makeTmpDir();
    const configPath = path.join(dir, 'ruleprobe.config.json');
    await fs.writeFile(configPath, '{ not valid json ]]]', 'utf-8');

    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: any[]) => { warnings.push(args.join(' ')); };

    try {
      const config = await loadConfig(configPath);
      expect(config).toEqual(defaultConfig);
      expect(warnings.some(w => w.includes('Could not parse'))).toBe(true);
    } finally {
      console.warn = originalWarn;
    }
  });

  test('defaultConfig has expected shape', () => {
    expect(defaultConfig.provider).toBe('mock');
    expect(defaultConfig.failBelow).toBe(70);
    expect(defaultConfig.keepSandbox).toBe(false);
    expect(defaultConfig.reportDir).toBe('.ruleprobe');
    expect(Array.isArray(defaultConfig.instructionFiles)).toBe(true);
    expect(defaultConfig.instructionFiles.length).toBeGreaterThan(0);
  });
});
