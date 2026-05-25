import { test, expect, vi, beforeEach, afterEach } from 'vitest';
import { runAIAssistedExtraction } from '../src/extractors/aiAssisted.js';
import { getEnv } from '../src/config/env.js';

vi.mock('../src/config/env.js', () => ({
  getEnv: vi.fn(),
}));

// Mock fs-extra to avoid disk writes in tests
vi.mock('fs-extra', () => ({
  default: {
    ensureDir: vi.fn(() => Promise.resolve()),
    writeFile: vi.fn(() => Promise.resolve()),
  },
}));

// Mock deterministic extraction as fallback
vi.mock('../src/extractors/deterministic.js', () => ({
  runDeterministicExtraction: vi.fn(() => []),
}));

const VALID_GEMINI_RULES_RESPONSE = JSON.stringify({
  candidates: [{
    content: {
      parts: [{
        text: JSON.stringify({
          rules: [{
            id: 'rule-1',
            text: 'ALWAYS use pnpm',
            category: 'package_manager',
            testable: true,
            severity: 'high',
            sourceFile: 'CLAUDE.md',
            lineNumber: 1,
            assertions: [{ type: 'package_manager_required', manager: 'pnpm' }],
            reason: ''
          }]
        })
      }]
    }
  }]
});

const INVALID_JSON_RESPONSE = JSON.stringify({
  candidates: [{
    content: {
      parts: [{
        text: 'This is not JSON at all, just plain text that cannot be parsed.'
      }]
    }
  }]
});

function makeGeminiConfig(overrides: Record<string, any> = {}) {
  return {
    provider: 'gemini',
    extractor: 'ai-assisted',
    debugExtractor: false,
    model: 'gemini-2.5-flash',
    providerTimeoutMs: 5000,
    instructionFiles: [],
    reportDir: '.ruleprobe',
    failBelow: 70,
    keepSandbox: false,
    ...overrides,
  } as any;
}

const TEST_FILES = [{ path: 'CLAUDE.md', content: 'ALWAYS use pnpm' }];

beforeEach(() => {
  (getEnv as any).mockImplementation((name: string) => {
    if (name === 'GEMINI_API_KEY') return 'test-gemini-key';
    return undefined;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// --- Test 1: On parse failure, retry is made and succeeds ---
test('on parse failure, a retry request is made and returns valid rules', async () => {
  let callCount = 0;

  global.fetch = vi.fn(async () => {
    callCount++;
    if (callCount === 1) {
      // First call: return invalid JSON payload (can't be parsed as rules)
      return {
        ok: true,
        status: 200,
        text: async () => INVALID_JSON_RESPONSE,
      } as any;
    }
    // Second call (retry): return valid rules
    return {
      ok: true,
      status: 200,
      text: async () => VALID_GEMINI_RULES_RESPONSE,
    } as any;
  }) as any;

  const rules = await runAIAssistedExtraction(TEST_FILES, makeGeminiConfig());

  // fetch should have been called twice: initial + retry
  expect(callCount).toBe(2);
  // Should have extracted the rule from the retry response
  expect(rules.length).toBe(1);
  expect(rules[0].category).toBe('package_manager');
  expect(rules[0].id).toBe('rule-1');
});

// --- Test 2: After two consecutive parse failures, fallback is used ---
test('after two consecutive parse failures, fallback is used and no AI rules returned', async () => {
  let callCount = 0;

  global.fetch = vi.fn(async () => {
    callCount++;
    return {
      ok: true,
      status: 200,
      text: async () => INVALID_JSON_RESPONSE,
    } as any;
  }) as any;

  const { runDeterministicExtraction } = await import('../src/extractors/deterministic.js');

  const rules = await runAIAssistedExtraction(TEST_FILES, makeGeminiConfig());

  // fetch was called twice: initial + retry
  expect(callCount).toBe(2);
  // Fallback deterministic extraction was invoked (returns [] per mock)
  expect(runDeterministicExtraction).toHaveBeenCalled();
  // No AI-extracted rules
  expect(rules.length).toBe(0);
});

// --- Test 3: retryAttempted is reflected in debug output ---
test('retryAttempted is logged in debug output on parse failure', async () => {
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  let callCount = 0;

  global.fetch = vi.fn(async () => {
    callCount++;
    if (callCount === 1) {
      return {
        ok: true,
        status: 200,
        text: async () => INVALID_JSON_RESPONSE,
      } as any;
    }
    // Retry also fails
    return {
      ok: true,
      status: 200,
      text: async () => INVALID_JSON_RESPONSE,
    } as any;
  }) as any;

  await runAIAssistedExtraction(TEST_FILES, makeGeminiConfig({ debugExtractor: true }));

  const logMessages = logSpy.mock.calls.map(args => args.join(' '));
  const retryAttemptedLog = logMessages.some(msg => msg.includes('retry attempted: yes'));
  const retrySuccessLog = logMessages.some(msg => msg.includes('retry success: no'));

  expect(retryAttemptedLog).toBe(true);
  expect(retrySuccessLog).toBe(true);

  logSpy.mockRestore();
});

// --- Test 4: No retry when initial parse succeeds ---
test('no retry when initial parse succeeds', async () => {
  let callCount = 0;

  global.fetch = vi.fn(async () => {
    callCount++;
    return {
      ok: true,
      status: 200,
      text: async () => VALID_GEMINI_RULES_RESPONSE,
    } as any;
  }) as any;

  const rules = await runAIAssistedExtraction(TEST_FILES, makeGeminiConfig());

  expect(callCount).toBe(1);
  expect(rules.length).toBe(1);
});

// --- Test 5: Pre-filter rejects rules missing required fields ---
test('pre-filter rejects rules missing required fields before validateCandidate', async () => {
  const responseWithIncompleteRule = JSON.stringify({
    candidates: [{
      content: {
        parts: [{
          text: JSON.stringify({
            rules: [
              // Valid rule
              {
                id: 'rule-1',
                text: 'ALWAYS use pnpm',
                category: 'package_manager',
                testable: true,
                severity: 'high',
                sourceFile: 'CLAUDE.md',
                lineNumber: 1,
                assertions: [{ type: 'package_manager_required', manager: 'pnpm' }],
                reason: ''
              },
              // Invalid: missing 'severity' field
              {
                id: 'rule-2',
                text: 'some rule without severity',
                category: 'informational',
                testable: false,
                sourceFile: 'CLAUDE.md',
                lineNumber: 2,
                assertions: [],
                reason: ''
              },
              // Invalid: missing 'id' field
              {
                text: 'another rule without id',
                category: 'informational',
                testable: false,
                severity: 'low',
                sourceFile: 'CLAUDE.md',
                lineNumber: 3,
                assertions: [],
                reason: ''
              }
            ]
          })
        }]
      }
    }]
  });

  global.fetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    text: async () => responseWithIncompleteRule,
  } as any)) as any;

  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

  await runAIAssistedExtraction(TEST_FILES, makeGeminiConfig({ debugExtractor: true }));

  const logMessages = logSpy.mock.calls.map(args => args.join(' '));
  const preFilterLog = logMessages.some(msg => msg.includes('pre-filter') && msg.includes('2'));

  expect(preFilterLog).toBe(true);

  logSpy.mockRestore();
});

// --- Test 6: Parse success rate is logged in debug mode ---
test('parse success rate is logged in debug mode', async () => {
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

  global.fetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    text: async () => VALID_GEMINI_RULES_RESPONSE,
  } as any)) as any;

  const twoFiles = [
    { path: 'CLAUDE.md', content: 'ALWAYS use pnpm' },
    { path: 'AGENTS.md', content: 'NEVER commit' },
  ];

  await runAIAssistedExtraction(twoFiles, makeGeminiConfig({ debugExtractor: true }));

  const logMessages = logSpy.mock.calls.map(args => args.join(' '));
  const parseRateLog = logMessages.some(msg => msg.includes('parse success rate:') && msg.includes('2/2'));

  expect(parseRateLog).toBe(true);

  logSpy.mockRestore();
});
