import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { writeSarifReport } from '../src/reporters/sarif.js';
import { writeJUnitReport } from '../src/reporters/junit.js';
import { lintRules, formatLintOutput } from '../src/lint/analyze.js';
import type { EvaluationResult, Config, Rule } from '../src/types/index.js';

let tmpDir: string;
beforeEach(async () => { tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rp-s2-')); });
afterEach(async () => { await fs.remove(tmpDir); });

function makeConfig(reportDir: string): Config {
  return { provider: 'mock', instructionFiles: [], reportDir, failBelow: 70, keepSandbox: false } as unknown as Config;
}

function makeResult(overrides: Partial<EvaluationResult> = {}): EvaluationResult {
  return {
    ruleId: 'rule-1',
    scenarioId: 'sc-1',
    status: 'PASS',
    score: 100,
    severity: 'high',
    category: 'forbidden_command',
    sourceFile: 'CLAUDE.md',
    sourceLine: 5,
    ruleText: 'NEVER run git commit',
    expected: 'git commit not run',
    actual: 'no git commit observed',
    evidence: 'Commands: none',
    scenario: { id: 'sc-1', ruleId: 'rule-1', title: 'Forbidden command: git commit', prompt: '', sandboxFiles: {}, expectedAssertions: [] },
    providerResult: { finalAnswer: '', changedFiles: [], changedFileContents: {}, commands: [], rawOutput: '', success: true },
    assertionResults: [],
    ...overrides
  } as EvaluationResult;
}

function makeRule(overrides: Partial<Rule> = {}): Rule {
  return {
    id: 'rule-1',
    sourceFile: 'CLAUDE.md',
    lineNumber: 5,
    rawLine: '- NEVER run git commit',
    text: 'NEVER run git commit',
    category: 'forbidden_command',
    severity: 'high',
    testable: true,
    assertions: [{ type: 'forbidden_command', commandIncludes: 'git commit' }],
    ...overrides,
  } as Rule;
}

// ─── SARIF ───────────────────────────────────────────────────────────────────

describe('SARIF reporter', () => {
  it('writes a valid SARIF 2.1.0 file', async () => {
    const config = makeConfig(tmpDir);
    const results = [makeResult(), makeResult({ ruleId: 'rule-2', status: 'FAIL', score: 0, severity: 'high' })];
    const outPath = await writeSarifReport(results, config);
    expect(await fs.pathExists(outPath)).toBe(true);
    const sarif = await fs.readJson(outPath);
    expect(sarif.version).toBe('2.1.0');
    expect(sarif.runs).toHaveLength(1);
    expect(sarif.runs[0].tool.driver.name).toBe('RuleProbe');
    expect(sarif.runs[0].results).toHaveLength(2);
  });

  it('maps FAIL+high to level error', async () => {
    const config = makeConfig(tmpDir);
    await writeSarifReport([makeResult({ status: 'FAIL', severity: 'high' })], config);
    const sarif = await fs.readJson(path.join(tmpDir, 'report.sarif'));
    expect(sarif.runs[0].results[0].level).toBe('error');
  });

  it('maps PASS to level note', async () => {
    const config = makeConfig(tmpDir);
    await writeSarifReport([makeResult({ status: 'PASS' })], config);
    const sarif = await fs.readJson(path.join(tmpDir, 'report.sarif'));
    expect(sarif.runs[0].results[0].level).toBe('note');
  });

  it('maps SKIPPED to level none', async () => {
    const config = makeConfig(tmpDir);
    await writeSarifReport([makeResult({ status: 'SKIPPED' })], config);
    const sarif = await fs.readJson(path.join(tmpDir, 'report.sarif'));
    expect(sarif.runs[0].results[0].level).toBe('none');
  });

  it('includes source location', async () => {
    const config = makeConfig(tmpDir);
    await writeSarifReport([makeResult({ sourceFile: 'AGENTS.md', sourceLine: 12 })], config);
    const sarif = await fs.readJson(path.join(tmpDir, 'report.sarif'));
    const loc = sarif.runs[0].results[0].locations[0].physicalLocation;
    expect(loc.artifactLocation.uri).toContain('AGENTS.md');
    expect(loc.region.startLine).toBe(12);
  });
});

// ─── JUnit XML ───────────────────────────────────────────────────────────────

describe('JUnit XML reporter', () => {
  it('writes a valid JUnit XML file', async () => {
    const config = makeConfig(tmpDir);
    const outPath = await writeJUnitReport([makeResult()], config);
    expect(await fs.pathExists(outPath)).toBe(true);
    const xml = await fs.readFile(outPath, 'utf-8');
    expect(xml).toContain('<?xml version="1.0"');
    expect(xml).toContain('<testsuites');
    expect(xml).toContain('<testcase');
  });

  it('includes failure element for FAIL status', async () => {
    const config = makeConfig(tmpDir);
    await writeJUnitReport([makeResult({ status: 'FAIL', score: 0 })], config);
    const xml = await fs.readFile(path.join(tmpDir, 'report.xml'), 'utf-8');
    expect(xml).toContain('<failure');
  });

  it('includes skipped element for SKIPPED status', async () => {
    const config = makeConfig(tmpDir);
    await writeJUnitReport([makeResult({ status: 'SKIPPED' })], config);
    const xml = await fs.readFile(path.join(tmpDir, 'report.xml'), 'utf-8');
    expect(xml).toContain('<skipped');
  });

  it('does not include failure for PASS', async () => {
    const config = makeConfig(tmpDir);
    await writeJUnitReport([makeResult({ status: 'PASS' })], config);
    const xml = await fs.readFile(path.join(tmpDir, 'report.xml'), 'utf-8');
    expect(xml).not.toContain('<failure');
  });

  it('counts failures correctly in attributes', async () => {
    const config = makeConfig(tmpDir);
    const results = [makeResult({ status: 'PASS' }), makeResult({ status: 'FAIL', ruleId: 'rule-2' }), makeResult({ status: 'FAIL', ruleId: 'rule-3' })];
    await writeJUnitReport(results, config);
    const xml = await fs.readFile(path.join(tmpDir, 'report.xml'), 'utf-8');
    expect(xml).toContain('failures="2"');
    expect(xml).toContain('tests="3"');
  });

  it('escapes XML special characters', async () => {
    const config = makeConfig(tmpDir);
    const r = makeResult({ scenario: { ...makeResult().scenario, title: 'Rule with <special> & "chars"' } });
    await writeJUnitReport([r], config);
    const xml = await fs.readFile(path.join(tmpDir, 'report.xml'), 'utf-8');
    expect(xml).toContain('&lt;special&gt;');
    expect(xml).toContain('&amp;');
  });
});

// ─── Lint ─────────────────────────────────────────────────────────────────────

describe('lintRules', () => {
  it('returns no issues for clean testable rules', () => {
    const rules = [makeRule(), makeRule({ id: 'rule-2', text: 'ALWAYS run pnpm typecheck', category: 'required_command', assertions: [{ type: 'required_command', commandIncludes: 'pnpm typecheck' }] })];
    const issues = lintRules(rules);
    expect(issues.filter(i => i.code !== 'R001')).toHaveLength(0);
  });

  it('flags non-testable rules with R001', () => {
    const rule = makeRule({ testable: false, category: 'informational' });
    const issues = lintRules([rule]);
    expect(issues.some(i => i.code === 'R001')).toBe(true);
  });

  it('flags vague language with R002', () => {
    const rule = makeRule({ text: 'Try to avoid using any in TypeScript' });
    const issues = lintRules([rule]);
    expect(issues.some(i => i.code === 'R002')).toBe(true);
  });

  it('does not flag R002 if strong keyword present', () => {
    const rule = makeRule({ text: 'NEVER use any even if you try to be careful' });
    const issues = lintRules([rule]);
    expect(issues.some(i => i.code === 'R002')).toBe(false);
  });

  it('flags very short rules with R003', () => {
    const rule = makeRule({ text: 'No any' });
    const issues = lintRules([rule]);
    expect(issues.some(i => i.code === 'R003')).toBe(true);
  });

  it('flags duplicate rules with R004', () => {
    const r1 = makeRule({ id: 'rule-1' });
    const r2 = makeRule({ id: 'rule-2', text: 'Never commit via git commit' });
    const issues = lintRules([r1, r2]);
    expect(issues.some(i => i.code === 'R004')).toBe(true);
  });

  it('does not flag R004 for different assertion values', () => {
    const r1 = makeRule({ id: 'rule-1', assertions: [{ type: 'forbidden_command', commandIncludes: 'git commit' }] });
    const r2 = makeRule({ id: 'rule-2', text: 'NEVER run git push', assertions: [{ type: 'forbidden_command', commandIncludes: 'git push' }] });
    const issues = lintRules([r1, r2]);
    expect(issues.some(i => i.code === 'R004')).toBe(false);
  });

  it('flags unknown category with R005', () => {
    const rule = makeRule({ category: 'unknown', assertions: [{ type: 'unknown', value: 'something' }] });
    const issues = lintRules([rule]);
    expect(issues.some(i => i.code === 'R005')).toBe(true);
  });
});

describe('formatLintOutput', () => {
  it('shows green success message when no issues', () => {
    const output = formatLintOutput([], 5);
    expect(output).toContain('5 rule(s) checked');
    expect(output).toContain('no issues');
  });

  it('shows counts for mixed issues', () => {
    const issues = [
      { ruleId: 'r1', ruleText: 'test', sourceFile: 'CLAUDE.md', line: 1, severity: 'warn' as const, code: 'R002', message: 'vague' },
      { ruleId: 'r2', ruleText: 'test2', sourceFile: 'CLAUDE.md', line: 2, severity: 'info' as const, code: 'R001', message: 'non-testable' }
    ];
    const output = formatLintOutput(issues, 10);
    expect(output).toContain('10 rule(s) checked');
    expect(output).toContain('1 warning(s)');
    expect(output).toContain('1 info(s)');
  });
});
