import { describe, test, expect } from 'vitest';
import {
  buildReportProofModel,
  getChangedSnippets,
  formatSource,
  formatChangedFiles,
  resultLimitationMessages,
  groupFailures
} from '../src/reporters/proof.js';
import { collectLimitationNotes, collectResultLimitationNotes } from '../src/reporters/limitations.js';
import { Config, EvaluationResult } from '../src/types/index.js';

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    provider: 'mock',
    instructionFiles: ['CLAUDE.md'],
    reportDir: '.ruleprobe',
    failBelow: 70,
    keepSandbox: false,
    ...overrides
  };
}

function makeResult(overrides: Partial<EvaluationResult> = {}): EvaluationResult {
  return {
    scenario: { id: 's1', ruleId: 'r1', title: 'Test', prompt: '', sandboxFiles: {}, expectedAssertions: [] },
    providerResult: {
      finalAnswer: 'done',
      changedFiles: [],
      changedFileContents: {},
      commands: [],
      rawOutput: 'ok',
      success: true
    },
    assertionResults: [],
    status: 'PASS',
    score: 100,
    ruleId: 'r1',
    scenarioId: 's1',
    expected: '',
    actual: '',
    evidence: '',
    severity: 'medium',
    category: 'required_command',
    ...overrides
  };
}

describe('buildReportProofModel', () => {
  test('returns zero scores for empty results', () => {
    const proof = buildReportProofModel([], makeConfig());
    expect(proof.finalScore).toBe(0);
    expect(proof.weightedScore).toBe(0);
    expect(proof.failureGroups).toHaveLength(0);
    expect(proof.knownLimitations.length).toBeGreaterThan(0);
  });

  test('calculates correct finalScore for all passing', () => {
    const results = [
      makeResult({ score: 100 }),
      makeResult({ score: 100 }),
      makeResult({ score: 100 })
    ];
    const proof = buildReportProofModel(results, makeConfig());
    expect(proof.finalScore).toBe(100);
  });

  test('calculates correct finalScore for mixed results', () => {
    const results = [
      makeResult({ score: 100 }),
      makeResult({ score: 0, status: 'FAIL' })
    ];
    const proof = buildReportProofModel(results, makeConfig());
    expect(proof.finalScore).toBe(50);
  });
});

describe('groupFailures', () => {
  test('groups FAIL and PARTIAL results by category+severity', () => {
    const results = [
      makeResult({ status: 'FAIL', score: 0, category: 'package_manager', severity: 'high' }),
      makeResult({ status: 'FAIL', score: 0, category: 'package_manager', severity: 'high' }),
      makeResult({ status: 'PARTIAL', score: 50, category: 'required_command', severity: 'medium' }),
      makeResult({ status: 'PASS', score: 100, category: 'code_pattern_forbidden', severity: 'high' })
    ];
    const groups = groupFailures(results);
    expect(groups).toHaveLength(2);
    const pkg = groups.find(g => g.category === 'package_manager');
    expect(pkg?.results).toHaveLength(2);
  });

  test('sorts groups by severity descending', () => {
    const results = [
      makeResult({ status: 'FAIL', score: 0, category: 'x', severity: 'low' }),
      makeResult({ status: 'FAIL', score: 0, category: 'y', severity: 'high' }),
      makeResult({ status: 'FAIL', score: 0, category: 'z', severity: 'medium' })
    ];
    const groups = groupFailures(results);
    expect(groups[0].severity).toBe('high');
    expect(groups[groups.length - 1].severity).toBe('low');
  });

  test('ignores PASS and SKIPPED results', () => {
    const results = [
      makeResult({ status: 'PASS', score: 100 }),
      makeResult({ status: 'SKIPPED', score: 0 })
    ];
    const groups = groupFailures(results);
    expect(groups).toHaveLength(0);
  });
});

describe('getChangedSnippets', () => {
  test('returns snippets from changedFileContents', () => {
    const result = makeResult({
      providerResult: {
        finalAnswer: '',
        changedFiles: ['src/index.ts'],
        changedFileContents: { 'src/index.ts': 'const x = 1;\nconst y = 2;\n' },
        commands: [],
        rawOutput: '',
        success: true
      }
    });
    const snippets = getChangedSnippets(result);
    expect(snippets).toHaveLength(1);
    expect(snippets[0].file).toBe('src/index.ts');
    expect(snippets[0].snippet).toContain('const x = 1');
  });

  test('respects limit parameter', () => {
    const contents: Record<string, string> = {};
    for (let i = 0; i < 5; i++) contents[`file${i}.ts`] = `const x = ${i};`;
    const result = makeResult({
      providerResult: {
        finalAnswer: '',
        changedFiles: Object.keys(contents),
        changedFileContents: contents,
        commands: [],
        rawOutput: '',
        success: true
      }
    });
    const snippets = getChangedSnippets(result, 2);
    expect(snippets).toHaveLength(2);
  });

  test('skips null content entries', () => {
    const result = makeResult({
      providerResult: {
        finalAnswer: '',
        changedFiles: ['a.ts', 'b.ts'],
        changedFileContents: { 'a.ts': null as any, 'b.ts': 'const ok = true;' },
        commands: [],
        rawOutput: '',
        success: true
      }
    });
    const snippets = getChangedSnippets(result);
    expect(snippets).toHaveLength(1);
    expect(snippets[0].file).toBe('b.ts');
  });

  test('returns empty array when no changed file contents', () => {
    const result = makeResult();
    const snippets = getChangedSnippets(result);
    expect(snippets).toHaveLength(0);
  });
});

describe('formatSource', () => {
  test('returns Unknown when sourceFile is undefined', () => {
    expect(formatSource(undefined, undefined)).toBe('Unknown');
  });

  test('returns relative path with line number', () => {
    const src = formatSource('/some/absolute/file.md', 10);
    expect(src).toContain('file.md');
    expect(src).toContain(':10');
  });

  test('returns relative path without line number', () => {
    const src = formatSource('/some/absolute/file.md', undefined);
    expect(src).toContain('file.md');
    expect(src).not.toContain(':');
  });
});

describe('formatChangedFiles', () => {
  test('returns (none) for empty array', () => {
    expect(formatChangedFiles([])).toBe('(none)');
  });

  test('wraps each file in backticks', () => {
    const formatted = formatChangedFiles(['src/a.ts', 'src/b.ts']);
    expect(formatted).toContain('`src/a.ts`');
    expect(formatted).toContain('`src/b.ts`');
  });
});

describe('resultLimitationMessages', () => {
  test('returns empty array for clean passing result', () => {
    const messages = resultLimitationMessages(makeResult());
    expect(messages).toEqual([]);
  });

  test('includes skipped note for SKIPPED status', () => {
    const result = makeResult({ status: 'SKIPPED' });
    const messages = resultLimitationMessages(result);
    expect(messages.some(m => m.toLowerCase().includes('skip'))).toBe(true);
  });

  test('includes rate limit note when output mentions 429', () => {
    const result = makeResult({
      providerResult: { ...makeResult().providerResult, rawOutput: 'HTTP 429 Too Many Requests' }
    });
    const messages = resultLimitationMessages(result);
    expect(messages.some(m => m.toLowerCase().includes('rate'))).toBe(true);
  });

  test('includes provider failure note when success is false', () => {
    const result = makeResult({
      providerResult: { ...makeResult().providerResult, success: false }
    });
    const messages = resultLimitationMessages(result);
    expect(messages.some(m => m.toLowerCase().includes('provider'))).toBe(true);
  });
});

describe('collectLimitationNotes', () => {
  test('always includes synthetic-scenarios limitation', () => {
    const notes = collectLimitationNotes([], makeConfig());
    expect(notes.some(n => n.code === 'synthetic-scenarios')).toBe(true);
  });

  test('includes mock-provider note for mock provider', () => {
    const notes = collectLimitationNotes([], makeConfig({ provider: 'mock' }));
    expect(notes.some(n => n.code === 'mock-provider')).toBe(true);
  });

  test('includes dry-run-provider note for dry-run provider', () => {
    const notes = collectLimitationNotes([], makeConfig({ provider: 'dry-run' }));
    expect(notes.some(n => n.code === 'dry-run-provider')).toBe(true);
  });

  test('includes actions-disabled note when noExecuteActions is true', () => {
    const notes = collectLimitationNotes([], makeConfig({ noExecuteActions: true }));
    expect(notes.some(n => n.code === 'actions-disabled')).toBe(true);
  });

  test('includes extractor-provider-mismatch when hybrid mode with mock provider', () => {
    const notes = collectLimitationNotes([], makeConfig({ provider: 'mock', extractor: 'hybrid' }));
    expect(notes.some(n => n.code === 'extractor-provider-mismatch')).toBe(true);
  });

  test('includes deterministic-extraction-fallback when API key is missing for openrouter+hybrid', () => {
    const orig = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    try {
      const notes = collectLimitationNotes([], makeConfig({ provider: 'openrouter', extractor: 'hybrid' }));
      expect(notes.some(n => n.code === 'deterministic-extraction-fallback')).toBe(true);
    } finally {
      if (orig !== undefined) process.env.OPENROUTER_API_KEY = orig;
    }
  });

  test('deduplicates limitation notes', () => {
    // Two skipped results should still produce only one "skipped-results" note
    const results = [
      makeResult({ status: 'SKIPPED' }),
      makeResult({ status: 'SKIPPED' })
    ];
    const notes = collectLimitationNotes(results, makeConfig());
    const skippedNotes = notes.filter(n => n.code === 'skipped-results');
    expect(skippedNotes).toHaveLength(1);
  });
});

describe('collectResultLimitationNotes', () => {
  test('returns empty for clean result', () => {
    const notes = collectResultLimitationNotes(makeResult());
    expect(notes).toHaveLength(0);
  });

  test('detects "could not parse" in rawOutput', () => {
    const result = makeResult({
      providerResult: { ...makeResult().providerResult, rawOutput: 'Error: could not parse response' }
    });
    const notes = collectResultLimitationNotes(result);
    expect(notes.some(n => n.code === 'structured-output')).toBe(true);
  });

  test('detects "quota" in rawOutput', () => {
    const result = makeResult({
      providerResult: { ...makeResult().providerResult, rawOutput: 'quota exceeded for today' }
    });
    const notes = collectResultLimitationNotes(result);
    expect(notes.some(n => n.code === 'rate-limit')).toBe(true);
  });
});
