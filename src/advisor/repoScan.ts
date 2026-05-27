import fs from 'fs-extra';
import path from 'path';
import type { RepoScanResult } from './types.js';

/**
 * Detect which package manager is in use from lockfile presence.
 */
function detectPackageManager(dir: string): { manager: string | null; hasLockfile: boolean } {
  const lockfiles: Array<[string, string]> = [
    ['pnpm-lock.yaml', 'pnpm'],
    ['yarn.lock', 'yarn'],
    ['bun.lockb', 'bun'],
    ['package-lock.json', 'npm'],
  ];

  for (const [file, manager] of lockfiles) {
    if (fs.pathExistsSync(path.join(dir, file))) {
      return { manager, hasLockfile: true };
    }
  }
  return { manager: null, hasLockfile: false };
}

/**
 * Detect test runner from package.json scripts and devDependencies.
 */
function detectTestRunner(pkgJson: Record<string, unknown>): string | null {
  const scripts = (pkgJson['scripts'] as Record<string, string> | undefined) ?? {};
  const devDeps = (pkgJson['devDependencies'] as Record<string, string> | undefined) ?? {};
  const deps = (pkgJson['dependencies'] as Record<string, string> | undefined) ?? {};
  const allDeps = { ...deps, ...devDeps };

  const scriptValues = Object.values(scripts).join(' ');

  // Check in priority order
  if ('vitest' in allDeps || scriptValues.includes('vitest')) return 'vitest';
  if ('jest' in allDeps || scriptValues.includes('jest')) return 'jest';
  if ('mocha' in allDeps || scriptValues.includes('mocha')) return 'mocha';
  if ('pytest' in allDeps || scriptValues.includes('pytest')) return 'pytest';
  if (scriptValues.includes('go test')) return 'go test';
  if (scriptValues.includes('cargo test')) return 'cargo test';

  return null;
}

/**
 * Detect lint/format tools from package.json devDependencies and scripts.
 */
function detectLinters(pkgJson: Record<string, unknown>): string[] {
  const devDeps = (pkgJson['devDependencies'] as Record<string, string> | undefined) ?? {};
  const deps = (pkgJson['dependencies'] as Record<string, string> | undefined) ?? {};
  const scripts = (pkgJson['scripts'] as Record<string, string> | undefined) ?? {};
  const allDeps = { ...deps, ...devDeps };
  const scriptValues = Object.values(scripts).join(' ');

  const found: string[] = [];

  const toolChecks: Array<[string, string]> = [
    ['eslint', 'eslint'],
    ['@biomejs/biome', 'biome'],
    ['biome', 'biome'],
    ['prettier', 'prettier'],
    ['ruff', 'ruff'],
  ];

  for (const [dep, tool] of toolChecks) {
    if ((dep in allDeps || scriptValues.includes(tool)) && !found.includes(tool)) {
      found.push(tool);
    }
  }

  // clippy — Rust specific, detected from scripts
  if (scriptValues.includes('clippy') && !found.includes('clippy')) {
    found.push('clippy');
  }

  return found;
}

/**
 * List frequently-changed directories from git log (top 5 by commit count).
 */
async function detectFrequentDirs(dir: string): Promise<string[]> {
  try {
    const { execa } = await import('execa');
    const { stdout } = await execa(
      'git',
      ['log', '--name-only', '--pretty=format:', '-n', '200'],
      { cwd: dir, reject: false }
    );

    if (!stdout) return [];

    const dirCount = new Map<string, number>();
    for (const line of stdout.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const parts = trimmed.split('/');
      if (parts.length > 1) {
        const topDir = parts[0];
        dirCount.set(topDir, (dirCount.get(topDir) ?? 0) + 1);
      }
    }

    return Array.from(dirCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([d]) => d);
  } catch {
    return [];
  }
}

/**
 * Scan a repository directory and return static analysis results.
 */
export async function scanRepo(dir: string): Promise<RepoScanResult> {
  const { manager, hasLockfile } = detectPackageManager(dir);

  let pkgJson: Record<string, unknown> = {};
  const pkgPath = path.join(dir, 'package.json');
  if (await fs.pathExists(pkgPath)) {
    try {
      pkgJson = await fs.readJson(pkgPath);
    } catch {
      // ignore malformed package.json
    }
  }

  const testRunner = detectTestRunner(pkgJson);
  const linters = detectLinters(pkgJson);
  const frequentDirs = await detectFrequentDirs(dir);

  return {
    packageManager: manager,
    testRunner,
    linters,
    frequentDirs,
    hasLockfile,
  };
}
