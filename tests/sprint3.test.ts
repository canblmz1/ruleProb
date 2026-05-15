import { describe, it, expect } from 'vitest';
import { parseFrontmatter, fileMatchesGlobs } from '../src/instructions/frontmatter.js';
import { analyzeTokens } from '../src/tokens/analyze.js';
import { getPack, listPacks } from '../src/packs/registry.js';
import { runDoctor } from '../src/cli/doctor.js';
import { providerCapabilities } from '../src/providers/capabilities.js';
import type { Rule } from '../src/types/index.js';

// ─── Frontmatter parser ──────────────────────────────────────────────────────

describe('parseFrontmatter', () => {
  it('returns empty frontmatter and full body when no frontmatter', () => {
    const content = '# Hello\n- NEVER use any';
    const { frontmatter, body } = parseFrontmatter(content);
    expect(frontmatter).toEqual({});
    expect(body).toBe(content);
  });

  it('parses globs as inline list', () => {
    const content = '---\nglobs: ["src/**/*.ts", "tests/**"]\n---\n- NEVER use any';
    const { frontmatter } = parseFrontmatter(content);
    expect(frontmatter.globs).toEqual(['src/**/*.ts', 'tests/**']);
  });

  it('parses globs as YAML block list', () => {
    const content = '---\nglobs:\n  - src/**/*.ts\n  - tests/**\n---\n- rule';
    const { frontmatter } = parseFrontmatter(content);
    expect(frontmatter.globs).toEqual(['src/**/*.ts', 'tests/**']);
  });

  it('parses alwaysApply', () => {
    const content = '---\nalwaysApply: true\n---\n- rule';
    const { frontmatter } = parseFrontmatter(content);
    expect(frontmatter.alwaysApply).toBe(true);
  });

  it('parses description', () => {
    const content = '---\ndescription: "TypeScript rules"\n---\n- rule';
    const { frontmatter } = parseFrontmatter(content);
    expect(frontmatter.description).toBe('TypeScript rules');
  });

  it('strips frontmatter from body', () => {
    const content = '---\nglobs: ["*.ts"]\n---\n- NEVER use any\n- ALWAYS typecheck';
    const { body } = parseFrontmatter(content);
    expect(body).toContain('NEVER use any');
    expect(body).not.toContain('globs');
  });

  it('handles unclosed frontmatter gracefully', () => {
    const content = '---\nglobs: ["*.ts"]\n- rule without closing fence';
    const { frontmatter, body } = parseFrontmatter(content);
    expect(frontmatter).toEqual({});
    expect(body).toBe(content);
  });
});

describe('fileMatchesGlobs', () => {
  it('returns true for empty globs (always apply)', () => {
    expect(fileMatchesGlobs('src/foo.ts', [])).toBe(true);
  });

  it('matches exact extension glob', () => {
    expect(fileMatchesGlobs('src/foo.ts', ['*.ts'])).toBe(true);
    expect(fileMatchesGlobs('src/foo.js', ['*.ts'])).toBe(false);
  });

  it('matches double-star glob', () => {
    expect(fileMatchesGlobs('src/deep/nested/foo.ts', ['src/**/*.ts'])).toBe(true);
    expect(fileMatchesGlobs('lib/foo.ts', ['src/**/*.ts'])).toBe(false);
  });

  it('matches any of multiple globs', () => {
    expect(fileMatchesGlobs('tests/foo.test.ts', ['src/**', 'tests/**'])).toBe(true);
  });
});

// ─── Token analyzer ──────────────────────────────────────────────────────────

function makeFile(path: string, content: string) {
  return { path, content };
}

function makeRule(overrides: Partial<Rule> = {}): Rule {
  return {
    id: 'rule-1',
    sourceFile: 'CLAUDE.md',
    lineNumber: 1,
    rawLine: '- NEVER use any',
    text: 'NEVER use any',
    category: 'code_pattern_forbidden',
    severity: 'high',
    testable: true,
    assertions: [{ type: 'code_pattern_forbidden', pattern: 'any' }],
    ...overrides,
  } as Rule;
}

describe('analyzeTokens', () => {
  it('estimates total tokens across files', () => {
    const files = [makeFile('CLAUDE.md', 'a'.repeat(400))];
    const { totalTokens } = analyzeTokens(files, []);
    expect(totalTokens).toBe(100); // 400 / 4
  });

  it('produces a file entry per discovered file', () => {
    const files = [makeFile('CLAUDE.md', 'x'.repeat(100)), makeFile('AGENTS.md', 'y'.repeat(200))];
    const { files: infos } = analyzeTokens(files, []);
    expect(infos).toHaveLength(2);
  });

  it('warns when file exceeds 2000 token threshold', () => {
    const bigContent = 'x'.repeat(8001); // 8001 / 4 = ~2001 tokens
    const files = [makeFile('CLAUDE.md', bigContent)];
    const { warnings } = analyzeTokens(files, []);
    expect(warnings.some(w => w.includes('exceeds recommended'))).toBe(true);
  });

  it('returns top 5 most expensive rules', () => {
    const rules = Array.from({ length: 8 }, (_, i) =>
      makeRule({ id: `rule-${i}`, rawLine: 'x'.repeat((i + 1) * 20), text: 'rule ' + i })
    );
    const files = [makeFile('CLAUDE.md', 'content')];
    const { topRules } = analyzeTokens(files, rules);
    expect(topRules.length).toBeLessThanOrEqual(5);
    // Top rule should be the most expensive
    expect(topRules[0].estimatedTokens).toBeGreaterThanOrEqual(topRules[1]?.estimatedTokens ?? 0);
  });

  it('recommends removing non-testable rules', () => {
    const files = [makeFile('CLAUDE.md', 'content')];
    const rules = [makeRule({ testable: false, category: 'informational' })];
    const { recommendations } = analyzeTokens(files, rules);
    expect(recommendations.some(r => r.includes('non-testable'))).toBe(true);
  });
});

// ─── Pack registry ───────────────────────────────────────────────────────────

describe('pack registry', () => {
  it('lists all built-in packs', () => {
    const packs = listPacks();
    expect(packs.length).toBeGreaterThanOrEqual(4);
    const names = packs.map(p => p.name);
    expect(names).toContain('typescript-strict');
    expect(names).toContain('security');
    expect(names).toContain('monorepo');
    expect(names).toContain('react');
  });

  it('getPack returns correct pack', () => {
    const pack = getPack('typescript-strict');
    expect(pack).toBeDefined();
    expect(pack!.rules.length).toBeGreaterThan(0);
    expect(pack!.tags).toContain('typescript');
  });

  it('getPack returns undefined for unknown pack', () => {
    expect(getPack('nonexistent-pack')).toBeUndefined();
  });

  it('all packs have at least 3 rules', () => {
    for (const pack of listPacks()) {
      expect(pack.rules.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('all pack rules start with a bullet point', () => {
    for (const pack of listPacks()) {
      for (const rule of pack.rules) {
        expect(rule.trimStart()).toMatch(/^-/);
      }
    }
  });
});

// ─── doctor --json ────────────────────────────────────────────────────────────

describe('runDoctor --json mode', () => {
  it('returns structured result with checks array', async () => {
    const result = await runDoctor({ cwd: process.cwd(), json: true });
    expect(Array.isArray(result.checks)).toBe(true);
    expect(result.checks.length).toBeGreaterThan(0);
  });

  it('every check has name, status, detail fields', async () => {
    const result = await runDoctor({ cwd: process.cwd(), json: true });
    for (const check of result.checks) {
      expect(typeof check.name).toBe('string');
      expect(['PASS', 'WARN', 'FAIL']).toContain(check.status);
      expect(typeof check.detail).toBe('string');
    }
  });

  it('criticalFailures is a non-negative integer', async () => {
    const result = await runDoctor({ cwd: process.cwd(), json: true });
    expect(typeof result.criticalFailures).toBe('number');
    expect(result.criticalFailures).toBeGreaterThanOrEqual(0);
  });

  it('summary is a non-empty string', async () => {
    const result = await runDoctor({ cwd: process.cwd(), json: true });
    expect(typeof result.summary).toBe('string');
    expect(result.summary.length).toBeGreaterThan(0);
  });

  it('summary says "no critical issues" when criticalFailures is 0', async () => {
    const result = await runDoctor({ cwd: process.cwd(), json: true });
    if (result.criticalFailures === 0) {
      expect(result.summary).toBe('no critical issues');
    } else {
      expect(result.summary).toContain('critical issue');
    }
  });

  it('result is JSON-serializable without throwing', async () => {
    const result = await runDoctor({ cwd: process.cwd(), json: true });
    expect(() => JSON.stringify(result)).not.toThrow();
    const parsed = JSON.parse(JSON.stringify(result));
    expect(parsed.checks).toBeDefined();
    expect(parsed.criticalFailures).toBeDefined();
    expect(parsed.summary).toBeDefined();
  });
});

// ─── providers --json ─────────────────────────────────────────────────────────

describe('providerCapabilities JSON shape', () => {
  it('is an array with at least one entry', () => {
    expect(Array.isArray(providerCapabilities)).toBe(true);
    expect(providerCapabilities.length).toBeGreaterThan(0);
  });

  it('every entry has required fields', () => {
    for (const cap of providerCapabilities) {
      expect(typeof cap.provider).toBe('string');
      expect(typeof cap.extraction).toBe('string');
      expect(typeof cap.runtimeExecution).toBe('string');
      expect(typeof cap.notes).toBe('string');
    }
  });

  it('mock provider is present', () => {
    expect(providerCapabilities.some(c => c.provider === 'mock')).toBe(true);
  });

  it('dry-run provider is present', () => {
    expect(providerCapabilities.some(c => c.provider === 'dry-run')).toBe(true);
  });

  it('is JSON-serializable without throwing', () => {
    expect(() => JSON.stringify(providerCapabilities)).not.toThrow();
    const parsed = JSON.parse(JSON.stringify(providerCapabilities));
    expect(Array.isArray(parsed)).toBe(true);
  });
});
