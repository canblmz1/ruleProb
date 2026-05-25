import { test, expect } from 'vitest';
import { evaluateResult } from '../src/evaluator/score.js';
import { normalizeProviderResult } from '../src/providers/normalize.js';
import { Scenario, ProviderResult } from '../src/types/index.js';

function makeScenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    id: 's1',
    ruleId: 'r1',
    title: 'Test',
    prompt: 'test prompt',
    sandboxFiles: {},
    expectedAssertions: [],
    ...overrides
  };
}

function makeProviderResult(overrides: Partial<ProviderResult> = {}): ProviderResult {
  return normalizeProviderResult({
    success: true,
    finalAnswer: 'done',
    rawOutput: 'ok',
    ...overrides
  } as any);
}

test('FAIL on required_command includes a suggestion mentioning the command', async () => {
  const scenario = makeScenario({
    expectedAssertions: [{ type: 'required_command', commandIncludes: 'pnpm typecheck' }]
  });
  const providerResult = makeProviderResult({ commands: [] });

  const result = await evaluateResult(scenario, providerResult);
  expect(result.status).toBe('FAIL');
  expect(result.suggestion).toBeDefined();
  expect(result.suggestion).toContain('pnpm typecheck');
});

test('FAIL on forbidden_command includes a suggestion mentioning the command', async () => {
  const scenario = makeScenario({
    expectedAssertions: [{ type: 'forbidden_command', commandIncludes: 'pnpm test' }]
  });
  const providerResult = makeProviderResult({ commands: ['pnpm test'] });

  const result = await evaluateResult(scenario, providerResult);
  expect(result.status).toBe('FAIL');
  expect(result.suggestion).toBeDefined();
  expect(result.suggestion).toContain('pnpm test');
});

test('PASS result has no suggestion', async () => {
  const scenario = makeScenario({
    expectedAssertions: [{ type: 'required_command', commandIncludes: 'pnpm build' }]
  });
  const providerResult = makeProviderResult({ commands: ['pnpm build'] });

  const result = await evaluateResult(scenario, providerResult);
  expect(result.status).toBe('PASS');
  expect(result.suggestion).toBeUndefined();
});

test('SKIPPED result has no suggestion', async () => {
  const scenario = makeScenario({
    expectedAssertions: [{ type: 'required_command', commandIncludes: 'pnpm build' }]
  });
  const providerResult = makeProviderResult({ kind: 'dry-run' } as any);

  const result = await evaluateResult(scenario, providerResult);
  expect(result.status).toBe('SKIPPED');
  expect(result.suggestion).toBeUndefined();
});

test('buildSuggestion for package_manager_required mentions the manager', async () => {
  const scenario = makeScenario({
    expectedAssertions: [{ type: 'package_manager_required', manager: 'pnpm', forbiddenManagers: ['npm', 'yarn'] }]
  });
  // Use npm to trigger forbidden manager path -> false
  const providerResult = makeProviderResult({ commands: ['npm install'] });

  const result = await evaluateResult(scenario, providerResult);
  expect(result.status).toBe('FAIL');
  expect(result.suggestion).toBeDefined();
  expect(result.suggestion).toContain('pnpm');
});
