import { test, expect } from 'vitest';
import { runDeterministicExtraction } from '../src/extractors/deterministic.js';
import { discoverInstructions } from '../src/instructions/discover.js';
import path from 'path';
import { generateScenarios } from '../src/scenarios/generate.js';

test('rule classification accurately classifies strings', () => {
  const files = [
    {
      path: 'CLAUDE.md',
      content: `
- Always run pnpm test before final response
- Use pnpm, not npm
- Never edit src/generated/*
- Never use any in TypeScript
- Final answer must mention changed files
      `
    }
  ];
  
  const rules = runDeterministicExtraction(files);
  expect(rules.length).toBeGreaterThanOrEqual(5);
  
  const requiredCmd = rules.find(r => r.text.includes('run pnpm test') || r.text.includes('Always run test'));
  expect(requiredCmd?.category, 'should be required_command').toBe('required_command');

  const pkgMgr = rules.find(r => r.text.includes('not npm'));
  expect(pkgMgr?.category, 'should be package_manager').toBe('package_manager');

  const forbidFile = rules.find(r => r.text.includes('src/generated'));
  expect(forbidFile?.category, 'should be forbidden_file_change').toBe('forbidden_file_change');

  const forbidCode = rules.find(r => r.text.includes('Never use any'));
  expect(forbidCode?.category, 'should be code_pattern_forbidden').toBe('code_pattern_forbidden');

  const finalAns = rules.find(r => r.text.includes('mention'));
  expect(finalAns?.category, 'should be final_answer_required').toBe('final_answer_required');
});

test('rule extraction preserves explicit forbidden file patterns', () => {
  const rules = runDeterministicExtraction([{
    path: 'CLAUDE.md',
    content: '- Never edit files under src/generated/.'
  }]);

  const forbiddenFileRule = rules.find(rule => rule.category === 'forbidden_file_change');
  expect((forbiddenFileRule?.assertions[0] as any)?.pattern).toBe('src/generated/**');
});

import { OpenRouterProvider } from '../src/providers/openrouter.js';

test('openrouter provider handles missing API key cleanly', async () => {
  const originalKey = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  
  const provider = new OpenRouterProvider({});
  const result = await provider.run({ scenario: { id: "1", title: "test", ruleId: "1", prompt: "Hello", sandboxFiles: {}, expectedAssertions: [] }, sandboxDir: "tmp" });
  
  expect(result.success).toBe(false);
  expect(result.rawOutput).toContain("requires OPENROUTER_API_KEY");
  
  if (originalKey !== undefined) process.env.OPENROUTER_API_KEY = originalKey;
});

test('openrouter provider uses default model and fetch is mockable', async () => {
  const orgKey = process.env.OPENROUTER_API_KEY;
  const orgModel = process.env.OPENROUTER_MODEL;
  
  process.env.OPENROUTER_API_KEY = "test-key";
  delete process.env.OPENROUTER_MODEL;
  
  const originalFetch = global.fetch;
  
  let fetchCalledWithModel = "";
  global.fetch = async (url, options: any) => {
    const body = JSON.parse(options.body as string);
    fetchCalledWithModel = body.model;
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      text: async () => JSON.stringify({ choices: [{ message: { content: JSON.stringify({ actions: [], finalAnswer: "Mocked response" }) } }] })
    } as any;
  };
  
  const provider = new OpenRouterProvider({ provider: "openrouter", reportDir: "", instructionFiles: [], failBelow: 0, keepSandbox: false });
  const result = await provider.run({ scenario: { id: "1", title: "test", ruleId: "1", prompt: "Hello", sandboxFiles: {}, expectedAssertions: [] }, sandboxDir: "tmp" });
  
  expect(result.success).toBe(true);
  expect(result.finalAnswer).toBe("Mocked response");
  expect(fetchCalledWithModel).toBe("mistralai/mistral-7b-instruct:free");
  
  global.fetch = originalFetch;
  
  if (orgKey !== undefined) process.env.OPENROUTER_API_KEY = orgKey;
  else delete process.env.OPENROUTER_API_KEY;
  
  if (orgModel !== undefined) process.env.OPENROUTER_MODEL = orgModel;
  else delete process.env.OPENROUTER_MODEL;
});

test('openrouter provider uses CLI model override', async () => {
  const orgKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "test-key";
  const originalFetch = global.fetch;
  
  let fetchCalledWithModel = "";
  global.fetch = async (url, options: any) => {
    const body = JSON.parse(options.body as string);
    fetchCalledWithModel = body.model;
    return { ok: true, status: 200, text: async () => "{}" } as any;
  };
  
  const provider = new OpenRouterProvider({ provider: "openrouter", model: "custom-model", reportDir: "", instructionFiles: [], failBelow: 0, keepSandbox: false });
  await provider.run({ scenario: { id: "1", title: "test", ruleId: "1", prompt: "Hello", sandboxFiles: {}, expectedAssertions: [] }, sandboxDir: "tmp" });
  
  expect(fetchCalledWithModel).toBe("custom-model");
  
  global.fetch = originalFetch;
  delete process.env.OPENROUTER_API_KEY;
});

import { parseActionPlan } from '../src/actions/parse.js';

test('parseActionPlan reads structured JSON safely', () => {
  const valid = `
Here is my plan:
\`\`\`json
{
  "actions": [
    { "type": "write_file", "path": "src/x.ts", "content": "1" }
  ],
  "finalAnswer": "done"
}
\`\`\`
  `;
  const result = parseActionPlan(valid);
  expect(result?.actions[0].type).toBe("write_file");
  expect(result?.finalAnswer).toBe("done");

  const invalid = "Just prose and stuff { ] ]";
  expect(parseActionPlan(invalid)).toBeNull();
});

import { executeActionPlan } from '../src/actions/execute.js';
import { createSandbox, cleanupSandbox } from '../src/sandbox/create.js';

test('package manager scenarios use safe script-based validation instead of install flows', () => {
  const scenarios = generateScenarios([{
    id: 'r1',
    sourceFile: 'CLAUDE.md',
    text: 'Always use pnpm',
    category: 'package_manager',
    severity: 'high',
    testable: true,
    assertions: [{ type: 'package_manager_required', manager: 'pnpm', forbiddenManagers: ['npm', 'yarn'] }]
  } as any]);

  expect(scenarios[0].prompt).not.toContain('Install the lodash package');
  expect(scenarios[0].sandboxFiles['package.json']).toContain('"test"');
  expect(scenarios[0].title).toContain('Package manager compliance');
});

test('scenario generation uses category-native templates', () => {
  const scenarios = generateScenarios([
    {
      id: 'r1',
      sourceFile: 'CLAUDE.md',
      text: 'Never run git push',
      category: 'forbidden_command',
      severity: 'high',
      testable: true,
      assertions: [{ type: 'forbidden_command', commandIncludes: 'git push' }]
    },
    {
      id: 'r2',
      sourceFile: 'CLAUDE.md',
      text: 'Bug fixes must include tests',
      category: 'required_file_change',
      severity: 'high',
      testable: true,
      assertions: [{ type: 'required_file_change', pattern: 'test' }]
    },
    {
      id: 'r3',
      sourceFile: 'CLAUDE.md',
      text: 'Use unknown',
      category: 'code_pattern_required',
      severity: 'medium',
      testable: true,
      assertions: [{ type: 'code_pattern_required', pattern: 'unknown' }]
    }
  ] as any);

  expect(scenarios[0].title).toContain('Forbidden command boundary');
  expect(scenarios[0].prompt).toContain('local-only maintenance');
  expect(scenarios[1].title).toContain('Required file coverage');
  expect(Object.keys(scenarios[1].sandboxFiles)).toContain('tests/add.test.ts');
  expect(scenarios[2].title).toContain('Required code pattern');
  expect(scenarios[2].prompt).toContain('external input');
});

test('executeActionPlan blocks dangerous maneuvers and handles success paths', async () => {
  const sb = await createSandbox({ id: "safe-exec", ruleId: "1", title: "1", prompt: "p", expectedAssertions: [], sandboxFiles: {} });
  const originalTimeout = process.env.RULEPROBE_ACTION_TIMEOUT_MS;
  process.env.RULEPROBE_ACTION_TIMEOUT_MS = "100";
  
  const plan = {
    actions: [
      { type: "write_file", path: "test.ts", content: "ok" },
      { type: "write_file", path: "../evil.ts", content: "bad" },
      { type: "run_command", command: "pnpm test" },
      { type: "run_command", command: "rm -rf .git" }
    ],
    finalAnswer: "done"
  } as any;

  try {
    const result = await executeActionPlan(sb, plan);
    // first is safe
    expect(result.changedFiles).toContain('test.ts');
    // second is blocked
    expect(result.errors.some(e => e.includes('BLOCKED: path traversal'))).toBe(true);
    // third is allowed
    expect(result.evidence.some(e => e.includes('Ran allowed command'))).toBe(true);
    // fourth is blocked
    expect(result.commands).toContain('BLOCKED: rm -rf .git');
  } finally {
    if (originalTimeout === undefined) delete process.env.RULEPROBE_ACTION_TIMEOUT_MS;
    else process.env.RULEPROBE_ACTION_TIMEOUT_MS = originalTimeout;
    await cleanupSandbox(sb);
  }
});
