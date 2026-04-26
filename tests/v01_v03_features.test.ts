import { describe, test, expect } from 'vitest';
import path from 'path';
import fs from 'fs-extra';
import os from 'os';
import { evaluateResult } from '../src/evaluator/score.js';
import { normalizeProviderResult } from '../src/providers/normalize.js';
import { buildReportProofModel } from '../src/reporters/proof.js';
import { Scenario, EvaluationResult, Config } from '../src/types/index.js';
import { MockProvider } from '../src/providers/mock.js';
import { OpenCodeGoProvider } from '../src/providers/opencodeGo.js';
import { runDoctor } from '../src/cli/doctor.js';
import { runAIAssistedExtraction } from '../src/extractors/aiAssisted.js';

describe('severity-weighted score', () => {
  const baseResult = (overrides: Partial<EvaluationResult>): EvaluationResult => ({
    scenario: { id: 's', ruleId: 'r', title: 't', prompt: '', sandboxFiles: {}, expectedAssertions: [] },
    providerResult: { finalAnswer: '', changedFiles: [], changedFileContents: {}, commands: [], rawOutput: '', success: true },
    assertionResults: [],
    status: 'PASS',
    score: 100,
    ruleId: 'r',
    scenarioId: 's',
    expected: '',
    actual: '',
    evidence: '',
    severity: 'medium',
    ...overrides
  });

  test('weights high failures more than low failures', () => {
    const config: Config = { provider: 'mock', instructionFiles: [], reportDir: '.tmp', failBelow: 0, keepSandbox: false };
    const results: EvaluationResult[] = [
      baseResult({ status: 'PASS', score: 100, severity: 'low' }),
      baseResult({ status: 'PASS', score: 100, severity: 'low' }),
      baseResult({ status: 'FAIL', score: 0, severity: 'high' })
    ];
    const proof = buildReportProofModel(results, config);
    expect(proof.finalScore).toBeGreaterThan(proof.weightedScore);
    expect(proof.scoreBreakdown.weights.high).toBe(3);
    expect(proof.scoreBreakdown.weights.low).toBe(1);
  });

  test('cross-tab counts categories x severities', () => {
    const config: Config = { provider: 'mock', instructionFiles: [], reportDir: '.tmp', failBelow: 0, keepSandbox: false };
    const results: EvaluationResult[] = [
      baseResult({ status: 'PASS', score: 100, severity: 'high', category: 'package_manager' }),
      baseResult({ status: 'FAIL', score: 0, severity: 'high', category: 'package_manager' }),
      baseResult({ status: 'SKIPPED', score: 0, severity: 'medium', category: 'code_pattern_required' })
    ];
    const proof = buildReportProofModel(results, config);
    const pkg = proof.crossTab.rows.find(r => r.category === 'package_manager')!;
    expect(pkg.cells.high.pass).toBe(1);
    expect(pkg.cells.high.fail).toBe(1);
    const code = proof.crossTab.rows.find(r => r.category === 'code_pattern_required')!;
    expect(code.cells.medium.skipped).toBe(1);
  });

  test('share block contains score and counts', () => {
    const config: Config = { provider: 'mock', instructionFiles: ['CLAUDE.md'], reportDir: '.tmp', failBelow: 70, keepSandbox: false };
    const results: EvaluationResult[] = [baseResult({})];
    const proof = buildReportProofModel(results, config);
    expect(proof.shareBlock.text).toContain('Score:');
    expect(proof.shareBlock.text).toContain('PASS=');
    expect(proof.shareBlock.text).toContain('Provider: mock');
  });
});

describe('code_pattern SKIPPED semantics', () => {
  test('code_pattern_required without changed file contents returns SKIPPED', async () => {
    const scenario: Scenario = {
      id: 's1',
      ruleId: 'r1',
      title: 'Code required',
      prompt: '',
      sandboxFiles: {},
      expectedAssertions: [{ type: 'code_pattern_required', pattern: 'unknown' }]
    };
    const result = await evaluateResult(scenario, normalizeProviderResult({
      success: true,
      rawOutput: 'no files touched',
      changedFiles: [],
      changedFileContents: {}
    }));
    expect(result.status).toBe('SKIPPED');
    expect(result.assertionResults[0].skipped).toBe(true);
  });

  test('code_pattern_forbidden without changed file contents returns SKIPPED, not PASS', async () => {
    const scenario: Scenario = {
      id: 's1',
      ruleId: 'r1',
      title: 'Code forbidden',
      prompt: '',
      sandboxFiles: {},
      expectedAssertions: [{ type: 'code_pattern_forbidden', pattern: 'any' }]
    };
    const result = await evaluateResult(scenario, normalizeProviderResult({
      success: true,
      rawOutput: 'agent claimed compliance via prose only',
      changedFiles: [],
      changedFileContents: {}
    }));
    expect(result.status).toBe('SKIPPED');
    expect(result.assertionResults[0].skipped).toBe(true);
  });
});

describe('token-bounded command matching', () => {
  test('required_command pnpm test matches "pnpm test --watch" but not "pnpm testimonial"', async () => {
    const scenarioMatching: Scenario = {
      id: 's1', ruleId: 'r1', title: 't', prompt: '', sandboxFiles: {},
      expectedAssertions: [{ type: 'required_command', commandIncludes: 'pnpm test' }]
    };
    const ok = await evaluateResult(scenarioMatching, normalizeProviderResult({
      success: true, rawOutput: 'ok', commands: ['pnpm test --watch']
    }));
    expect(ok.status).toBe('PASS');

    const notMatch = await evaluateResult(scenarioMatching, normalizeProviderResult({
      success: true, rawOutput: 'ok', commands: ['pnpm testimonial']
    }));
    expect(notMatch.status).toBe('FAIL');
  });
});

describe('honest mock provider', () => {
  test('mock produces non-uniform results across scenarios', async () => {
    const provider = new MockProvider();
    const tmp = path.join(os.tmpdir(), `mock-test-${Date.now()}`);
    await fs.ensureDir(tmp);
    try {
      const buckets = new Set<string>();
      for (let i = 0; i < 30; i++) {
        const scenario: Scenario = {
          id: `s-${i}`,
          ruleId: 'r',
          title: 't',
          prompt: '',
          sandboxFiles: {},
          expectedAssertions: [{ type: 'forbidden_command', commandIncludes: 'git commit' }]
        };
        const result = await provider.run({ scenario, sandboxDir: tmp });
        buckets.add(result.commands.length === 0 ? 'compliant' : 'noncompliant');
      }
      // We expect both compliant and non-compliant outcomes to appear across
      // ~30 scenarios with different ids.
      expect(buckets.has('compliant')).toBe(true);
      expect(buckets.has('noncompliant')).toBe(true);
    } finally {
      await fs.remove(tmp);
    }
  });
});

describe('opencode-go provider', () => {
  test('returns clear missing-key error when OPENCODE_GO_API_KEY is unset', async () => {
    const original = process.env.OPENCODE_GO_API_KEY;
    delete process.env.OPENCODE_GO_API_KEY;
    try {
      const provider = new OpenCodeGoProvider({ provider: 'opencode-go', instructionFiles: [], reportDir: '.tmp', failBelow: 0, keepSandbox: false });
      const result = await provider.run({
        scenario: { id: 's', ruleId: 'r', title: 't', prompt: 'p', sandboxFiles: {}, expectedAssertions: [] },
        sandboxDir: os.tmpdir()
      });
      expect(result.success).toBe(false);
      expect(result.rawOutput).toContain('OPENCODE_GO_API_KEY');
    } finally {
      if (original) process.env.OPENCODE_GO_API_KEY = original;
    }
  });

  test('returns clear missing-model error when key is set but model is missing', async () => {
    const originalKey = process.env.OPENCODE_GO_API_KEY;
    const originalModel = process.env.OPENCODE_GO_MODEL;
    process.env.OPENCODE_GO_API_KEY = 'sk-test-fake';
    delete process.env.OPENCODE_GO_MODEL;
    try {
      const provider = new OpenCodeGoProvider({ provider: 'opencode-go', instructionFiles: [], reportDir: '.tmp', failBelow: 0, keepSandbox: false });
      const result = await provider.run({
        scenario: { id: 's', ruleId: 'r', title: 't', prompt: 'p', sandboxFiles: {}, expectedAssertions: [] },
        sandboxDir: os.tmpdir()
      });
      expect(result.success).toBe(false);
      expect(result.rawOutput).toContain('OPENCODE_GO_MODEL');
    } finally {
      if (originalKey) process.env.OPENCODE_GO_API_KEY = originalKey; else delete process.env.OPENCODE_GO_API_KEY;
      if (originalModel) process.env.OPENCODE_GO_MODEL = originalModel;
    }
  });
});

describe('opencode-go ai-assisted extraction routing', () => {
  const sampleInstruction = '# Project rules\n\n- ALWAYS use pnpm, never npm or yarn.\n- NEVER run pnpm test directly.\n- Never use `any` in TypeScript code.\n';

  function withMockedFetch<T>(handler: (input: any, init: any) => { status: number; body: string }, fn: () => Promise<T>): Promise<T> {
    const original = global.fetch;
    (global as any).fetch = async (input: any, init: any) => {
      const result = handler(input, init);
      const text = result.body;
      return new Response(text, { status: result.status, statusText: result.status === 200 ? 'OK' : 'Error' });
    };
    return fn().finally(() => {
      (global as any).fetch = original;
    });
  }

  test('opencode-go is treated as a supported AI extraction provider', async () => {
    const originalKey = process.env.OPENCODE_GO_API_KEY;
    const originalModel = process.env.OPENCODE_GO_MODEL;
    process.env.OPENCODE_GO_API_KEY = 'sk-test-fake-1234567890';
    process.env.OPENCODE_GO_MODEL = 'opencode-go/kimi-k2.6';

    let lastUrl = '';
    let lastBody: any = null;
    let lastAuth = '';

    try {
      const rules = await withMockedFetch(
        (input, init) => {
          lastUrl = String(input);
          lastBody = init?.body ? JSON.parse(String(init.body)) : null;
          lastAuth = init?.headers?.Authorization || '';
          const choices = {
            choices: [{
              message: {
                content: JSON.stringify({
                  rules: [
                    {
                      id: 'rule-1',
                      text: 'ALWAYS use pnpm, never npm or yarn.',
                      category: 'package_manager',
                      testable: true,
                      severity: 'high',
                      sourceFile: 'CLAUDE.md',
                      lineNumber: 3,
                      assertions: [{ type: 'package_manager_required', manager: 'pnpm', forbiddenManagers: ['npm', 'yarn'] }]
                    }
                  ]
                })
              }
            }]
          };
          return { status: 200, body: JSON.stringify(choices) };
        },
        () =>
          runAIAssistedExtraction(
            [{ path: 'CLAUDE.md', content: sampleInstruction }],
            { provider: 'opencode-go', extractor: 'ai-assisted', instructionFiles: [], reportDir: '.tmp', failBelow: 0, keepSandbox: false } as any
          )
      );

      expect(lastUrl).toContain('opencode.ai/zen/go/v1/chat/completions');
      expect(lastBody?.model).toBe('opencode-go/kimi-k2.6');
      expect(lastAuth.startsWith('Bearer ')).toBe(true);
      expect(rules.length).toBeGreaterThan(0);
      expect(rules[0].category).toBe('package_manager');
    } finally {
      if (originalKey !== undefined) process.env.OPENCODE_GO_API_KEY = originalKey; else delete process.env.OPENCODE_GO_API_KEY;
      if (originalModel !== undefined) process.env.OPENCODE_GO_MODEL = originalModel; else delete process.env.OPENCODE_GO_MODEL;
    }
  });

  test('missing OPENCODE_GO_API_KEY falls back deterministically without crashing', async () => {
    const originalKey = process.env.OPENCODE_GO_API_KEY;
    delete process.env.OPENCODE_GO_API_KEY;

    try {
      const rules = await runAIAssistedExtraction(
        [{ path: 'CLAUDE.md', content: sampleInstruction }],
        { provider: 'opencode-go', extractor: 'ai-assisted', instructionFiles: [], reportDir: '.tmp', failBelow: 0, keepSandbox: false } as any
      );
      // ai-assisted falls back deterministically; deterministic extraction yields >= 1 rule for this content.
      expect(rules.length).toBeGreaterThan(0);
    } finally {
      if (originalKey !== undefined) process.env.OPENCODE_GO_API_KEY = originalKey;
    }
  });

  test('missing OPENCODE_GO_MODEL falls back deterministically and surfaces clear error', async () => {
    const originalKey = process.env.OPENCODE_GO_API_KEY;
    const originalModel = process.env.OPENCODE_GO_MODEL;
    process.env.OPENCODE_GO_API_KEY = 'sk-test-fake-1234567890';
    delete process.env.OPENCODE_GO_MODEL;

    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: any[]) => { warnings.push(args.join(' ')); };

    try {
      const rules = await runAIAssistedExtraction(
        [{ path: 'CLAUDE.md', content: sampleInstruction }],
        { provider: 'opencode-go', extractor: 'ai-assisted', instructionFiles: [], reportDir: '.tmp', failBelow: 0, keepSandbox: false } as any
      );
      expect(warnings.some(w => w.includes('OPENCODE_GO_MODEL'))).toBe(true);
      expect(rules.length).toBeGreaterThan(0); // deterministic fallback still yields rules
    } finally {
      console.warn = originalWarn;
      if (originalKey !== undefined) process.env.OPENCODE_GO_API_KEY = originalKey; else delete process.env.OPENCODE_GO_API_KEY;
      if (originalModel !== undefined) process.env.OPENCODE_GO_MODEL = originalModel;
    }
  });

  test('opencode-go parse failure persists raw response to .ruleprobe/opencode-go-extractor-raw.txt', async () => {
    const originalKey = process.env.OPENCODE_GO_API_KEY;
    const originalModel = process.env.OPENCODE_GO_MODEL;
    process.env.OPENCODE_GO_API_KEY = 'sk-test-fake-1234567890';
    process.env.OPENCODE_GO_MODEL = 'opencode-go/kimi-k2.6';

    const rawFile = path.resolve('.ruleprobe', 'opencode-go-extractor-raw.txt');
    if (await fs.pathExists(rawFile)) await fs.remove(rawFile);

    try {
      const rules = await withMockedFetch(
        () => ({ status: 200, body: 'not-json-at-all-this-is-prose' }),
        () =>
          runAIAssistedExtraction(
            [{ path: 'CLAUDE.md', content: sampleInstruction }],
            { provider: 'opencode-go', extractor: 'ai-assisted', instructionFiles: [], reportDir: '.tmp', failBelow: 0, keepSandbox: false } as any
          )
      );
      expect(await fs.pathExists(rawFile)).toBe(true);
      const persisted = await fs.readFile(rawFile, 'utf8');
      expect(persisted).toContain('not-json-at-all');
      // Deterministic fallback fires when ai-assisted parse fails:
      expect(rules.length).toBeGreaterThan(0);
    } finally {
      if (originalKey !== undefined) process.env.OPENCODE_GO_API_KEY = originalKey; else delete process.env.OPENCODE_GO_API_KEY;
      if (originalModel !== undefined) process.env.OPENCODE_GO_MODEL = originalModel; else delete process.env.OPENCODE_GO_MODEL;
    }
  });

  test('debug output never includes the raw API key', async () => {
    const originalKey = process.env.OPENCODE_GO_API_KEY;
    const originalModel = process.env.OPENCODE_GO_MODEL;
    const secret = 'sk-test-supersecret-do-not-leak';
    process.env.OPENCODE_GO_API_KEY = secret;
    process.env.OPENCODE_GO_MODEL = 'opencode-go/kimi-k2.6';

    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: any[]) => { logs.push(args.join(' ')); };

    try {
      await withMockedFetch(
        () => ({ status: 200, body: JSON.stringify({ choices: [{ message: { content: '{"rules":[]}' } }] }) }),
        () =>
          runAIAssistedExtraction(
            [{ path: 'CLAUDE.md', content: sampleInstruction }],
            { provider: 'opencode-go', extractor: 'ai-assisted', instructionFiles: [], reportDir: '.tmp', failBelow: 0, keepSandbox: false, debugExtractor: true } as any
          )
      );
      const joined = logs.join('\n');
      expect(joined).not.toContain(secret);
      expect(joined).toContain('OPENCODE_GO API key visible: yes');
    } finally {
      console.log = originalLog;
      if (originalKey !== undefined) process.env.OPENCODE_GO_API_KEY = originalKey; else delete process.env.OPENCODE_GO_API_KEY;
      if (originalModel !== undefined) process.env.OPENCODE_GO_MODEL = originalModel; else delete process.env.OPENCODE_GO_MODEL;
    }
  });
});

describe('doctor command', () => {
  test('returns at least one critical-failure-or-pass entry without crashing', async () => {
    const result = await runDoctor({ cwd: process.cwd() });
    expect(result.checks.length).toBeGreaterThan(3);
    const node = result.checks.find(check => check.name.startsWith('Node version'));
    expect(node?.status).toBe('PASS');
  }, 30000);
});
