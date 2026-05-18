import { afterEach, describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { writeHtmlReport } from '../src/reporters/html.js';
import { writeJsonReport } from '../src/reporters/json.js';
import { writeMarkdownReport } from '../src/reporters/markdown.js';
import { writePrCommentReport } from '../src/reporters/prComment.js';
import { Config, EvaluationResult } from '../src/types/index.js';

const tempDirs: string[] = [];

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await fs.remove(dir);
  }
});

function createConfig(reportDir: string): Config {
  return {
    provider: 'mock',
    instructionFiles: [],
    reportDir,
    failBelow: 0,
    keepSandbox: false
  };
}

function createResult(): EvaluationResult {
  return {
    scenario: {
      id: 'scenario-1',
      ruleId: 'rule-1',
      title: 'Test <title>',
      prompt: 'Prompt with <b>unsafe</b> text',
      sandboxFiles: {},
      expectedAssertions: []
    },
    providerResult: {
      finalAnswer: 'Final <answer>',
      changedFiles: ['src/index.ts'],
      changedFileContents: {
        'src/index.ts': 'export const value = "<script>";'
      },
      commands: ['pnpm test'],
      rawOutput: '<script>alert(1)</script>',
      success: true
    },
    assertionResults: [],
    status: 'PASS',
    score: 100,
    ruleId: 'rule-1',
    scenarioId: 'scenario-1',
    expected: 'Expected <strong>value</strong>',
    actual: 'Actual <img src=x onerror=alert(1)>',
    evidence: 'Evidence <script>alert(1)</script>',
    severity: 'high',
    category: 'code_pattern_forbidden',
    sourceFile: path.join(process.cwd(), 'examples/basic/CLAUDE.md'),
    sourceLine: 7,
    ruleText: 'Never use <script> in code.'
  };
}

function createFailingResult(): EvaluationResult {
  return {
    ...createResult(),
    status: 'FAIL',
    score: 0,
    category: 'code_pattern_forbidden',
    severity: 'high',
    expected: 'Changed file contents must not contain "any".',
    actual: "[FAIL] Changed file src/index.ts contains forbidden pattern 'any'",
    evidence: "Changed file src/index.ts contains forbidden pattern 'any': const value: any = input;",
    providerResult: {
      finalAnswer: 'Done',
      changedFiles: ['src/index.ts'],
      changedFileContents: {
        'src/index.ts': 'export function parse(input: unknown) {\n  const value: any = input;\n  return value;\n}\n'
      },
      commands: [],
      rawOutput: 'Mock run completed deterministically.',
      success: true
    }
  };
}

function createSkippedResult(skipReason: EvaluationResult['skipReason'] = 'DRY_RUN'): EvaluationResult {
  return {
    ...createResult(),
    status: 'SKIPPED',
    score: 0,
    skipReason,
    expected: 'Run the agent',
    actual: 'Agent was skipped',
    evidence: 'Provider was dry-run or a skeleton',
    providerResult: {
      finalAnswer: '',
      changedFiles: [],
      changedFileContents: {},
      commands: [],
      rawOutput: 'Dry run completed. No agent executed.',
      success: true
    }
  };
}

describe('reporters', () => {
  it('writes markdown reports with source provenance and evidence fields', async () => {
    const reportDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ruleprobe-report-md-'));
    tempDirs.push(reportDir);

    await writeMarkdownReport([createResult()], createConfig(reportDir));

    const markdown = await fs.readFile(path.join(reportDir, 'report.md'), 'utf-8');
    expect(markdown).toContain('Source: examples/basic/CLAUDE.md:7');
    expect(markdown).toContain('Category: code_pattern_forbidden');
    expect(markdown).toContain('Rule: Never use <script> in code.');
    expect(markdown).toContain('## Known Limitations');
    expect(markdown).toContain('generated sandbox scenarios');
    expect(markdown).toContain('Evidence:');
    expect(markdown).toContain('Actual <img src=x onerror=alert(1)>');
  });

  it('escapes HTML output for user and provider controlled text', async () => {
    const reportDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ruleprobe-report-html-'));
    tempDirs.push(reportDir);

    await writeHtmlReport([createResult()], createConfig(reportDir));

    const html = await fs.readFile(path.join(reportDir, 'report.html'), 'utf-8');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('Actual &lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('Never use &lt;script&gt; in code.');
    expect(html).toContain('Known Limitations');
    expect(html).toContain('Source:</strong> examples/basic/CLAUDE.md:7');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
  });

  it('writes JSON reports with known limitation metadata', async () => {
    const reportDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ruleprobe-report-json-'));
    tempDirs.push(reportDir);

    await writeJsonReport([createResult()], createConfig(reportDir));

    const json = await fs.readJson(path.join(reportDir, 'report.json'));
    expect(json.knownLimitations.length).toBeGreaterThan(0);
    expect(json.knownLimitations.some((note: any) => note.code === 'synthetic-scenarios')).toBe(true);
  });

  it('writes grouped failures and changed content snippets', async () => {
    const reportDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ruleprobe-report-proof-'));
    tempDirs.push(reportDir);

    await writeMarkdownReport([createFailingResult()], createConfig(reportDir));
    await writeHtmlReport([createFailingResult()], createConfig(reportDir));
    await writeJsonReport([createFailingResult()], createConfig(reportDir));

    const markdown = await fs.readFile(path.join(reportDir, 'report.md'), 'utf-8');
    expect(markdown).toContain('## Failure Groups');
    expect(markdown).toContain('code_pattern_forbidden (high): 1 result(s) needing attention');
    expect(markdown).toContain('Changed Content Snippets:');
    expect(markdown).toContain('const value: any = input;');

    const html = await fs.readFile(path.join(reportDir, 'report.html'), 'utf-8');
    expect(html).toContain('Failure Groups');
    expect(html).toContain('Changed Content Snippets');
    expect(html).toContain('const value: any = input;');

    const json = await fs.readJson(path.join(reportDir, 'report.json'));
    expect(json.failureGroups[0].category).toBe('code_pattern_forbidden');
    expect(json.results[0].changedSnippets[0].snippet).toContain('const value: any = input;');
  });

  it('HTML report includes Chart.js script (inline bundle or CDN fallback)', async () => {
    const reportDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ruleprobe-report-chartjs-'));
    tempDirs.push(reportDir);

    await writeHtmlReport([createResult()], createConfig(reportDir));

    const html = await fs.readFile(path.join(reportDir, 'report.html'), 'utf-8');
    // Either an inline <script>...</script> with Chart.js content OR a CDN src tag must be present
    const hasInlineChart = html.includes('Chart') && /<script>[^<]{1000,}/.test(html);
    const hasCdnChart = html.includes('cdn.jsdelivr.net') && html.includes('chart.js');
    expect(hasInlineChart || hasCdnChart).toBe(true);
  });

  it('HTML report inline script does not contain unescaped </script> closing tag in bundle', async () => {
    const reportDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ruleprobe-report-scriptesc-'));
    tempDirs.push(reportDir);

    await writeHtmlReport([createResult()], createConfig(reportDir));

    const html = await fs.readFile(path.join(reportDir, 'report.html'), 'utf-8');
    // Extract all inline script block contents and ensure none contain raw </script>
    const inlineScripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)];
    for (const [, content] of inlineScripts) {
      // The content between <script> and </script> must not contain a raw </script>
      expect(content.toLowerCase()).not.toContain('</script>');
    }
  });

  it('renders skip reason in markdown, html, json, junit, and sarif reports', async () => {
    const reportDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ruleprobe-report-skip-'));
    tempDirs.push(reportDir);
    const skipped = createSkippedResult('DRY_RUN');
    const config = createConfig(reportDir);

    await writeMarkdownReport([skipped], config);
    await writeHtmlReport([skipped], config);
    await writeJsonReport([skipped], config);

    const { writeSarifReport } = await import('../src/reporters/sarif.js');
    const { writeJUnitReport } = await import('../src/reporters/junit.js');
    await writeSarifReport([skipped], config);
    await writeJUnitReport([skipped], config);

    const markdown = await fs.readFile(path.join(reportDir, 'report.md'), 'utf-8');
    expect(markdown).toContain('Skip Reason: DRY_RUN');

    const html = await fs.readFile(path.join(reportDir, 'report.html'), 'utf-8');
    expect(html).toContain('<strong>Skip Reason:</strong> DRY_RUN');

    const json = await fs.readJson(path.join(reportDir, 'report.json'));
    expect(json.results[0].skipReason).toBe('DRY_RUN');

    const junit = await fs.readFile(path.join(reportDir, 'report.xml'), 'utf-8');
    expect(junit).toContain('Skip Reason: DRY_RUN');

    const sarif = await fs.readJson(path.join(reportDir, 'report.sarif'));
    expect(sarif.runs[0].results[0].message.text).toContain('skip reason: DRY_RUN');
  });

  it('markdown report includes rule coverage section', async () => {
    const reportDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ruleprobe-report-coverage-'));
    tempDirs.push(reportDir);
    const config = createConfig(reportDir);
    const skipped = createSkippedResult('DRY_RUN');

    await writeMarkdownReport([createResult(), createFailingResult(), skipped], config);

    const markdown = await fs.readFile(path.join(reportDir, 'report.md'), 'utf-8');
    expect(markdown).toContain('## Rule Coverage');
    expect(markdown).toContain('Scenarios evaluated: 2/3');
    expect(markdown).toContain('Skipped: 1');
  });

  it('markdown report includes skipped guidance section for code_pattern rules', async () => {
    const reportDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ruleprobe-report-skipped-guidance-'));
    tempDirs.push(reportDir);
    const config = createConfig(reportDir);
    const skipped = createSkippedResult('DRY_RUN');
    skipped.category = 'code_pattern_forbidden';

    await writeMarkdownReport([skipped], config);

    const markdown = await fs.readFile(path.join(reportDir, 'report.md'), 'utf-8');
    expect(markdown).toContain('## Skipped Guidance');
    expect(markdown).toContain('code pattern rule(s) were skipped');
    expect(markdown).toContain('--provider claude-code');
    expect(markdown).toContain('--provider openrouter');
  });

  it('writes PR comment report with score, counts, and baseline delta', async () => {
    const reportDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ruleprobe-report-pr-'));
    tempDirs.push(reportDir);
    const config = createConfig(reportDir);

    const delta = {
      newPasses: [],
      improvements: [createResult()],
      unchanged: [],
      regressions: [createFailingResult()]
    };

    const prCommentPath = await writePrCommentReport([createResult(), createFailingResult()], config, delta);
    expect(prCommentPath).toBe(path.join(reportDir, 'report.pr-comment.md'));

    const md = await fs.readFile(prCommentPath, 'utf-8');
    expect(md).toContain('RuleProbe Compliance Report');
    expect(md).toContain('Score:');
    expect(md).toContain('✅ PASS');
    expect(md).toContain('❌ FAIL');
    expect(md).toContain('Baseline Comparison');
    expect(md).toContain('Improvements:');
    expect(md).toContain('Regressions:');
    expect(md).toContain('Top Issues');
    expect(md).toContain('View full report');
  });
});
