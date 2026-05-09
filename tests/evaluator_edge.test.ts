import { describe, test, expect } from 'vitest';
import { evaluateResult } from '../src/evaluator/score.js';
import { normalizeProviderResult } from '../src/providers/normalize.js';
import { DryRunProvider } from '../src/providers/dryRun.js';
import { Scenario } from '../src/types/index.js';
import os from 'os';

function makeScenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    id: 's1',
    ruleId: 'r1',
    title: 'Test scenario',
    prompt: 'test',
    sandboxFiles: {},
    expectedAssertions: [],
    severity: 'medium',
    ...overrides
  };
}

// ────────────────────────────────────────────────────────────────
// DryRunProvider
// ────────────────────────────────────────────────────────────────
describe('DryRunProvider', () => {
  test('returns dry-run output with SKIPPED status after evaluation', async () => {
    const provider = new DryRunProvider();
    const scenario = makeScenario({
      title: 'My dry-run test',
      expectedAssertions: [{ type: 'required_command', commandIncludes: 'pnpm test' }]
    });
    const result = await provider.run({ scenario, sandboxDir: os.tmpdir() });
    expect(result.rawOutput).toContain('Dry run completed');
    expect(result.rawOutput).toContain(scenario.prompt);
    expect(result.finalAnswer).toContain('DRY RUN');
    expect(result.commands).toHaveLength(0);

    // Evaluating a dry-run result should yield SKIPPED
    const evalResult = await evaluateResult(scenario, result);
    expect(evalResult.status).toBe('SKIPPED');
  });
});

// ────────────────────────────────────────────────────────────────
// final_answer_contains
// ────────────────────────────────────────────────────────────────
describe('evaluateResult – final_answer_contains', () => {
  test('PASS when finalAnswer contains required phrase', async () => {
    const scenario = makeScenario({
      expectedAssertions: [{ type: 'final_answer_contains', text: 'pnpm test' }]
    });
    const result = await evaluateResult(
      scenario,
      normalizeProviderResult({ success: true, rawOutput: 'ok', finalAnswer: 'I ran pnpm test successfully.' })
    );
    expect(result.status).toBe('PASS');
    expect(result.assertionResults[0].passed).toBe(true);
  });

  test('FAIL when finalAnswer does not contain required phrase', async () => {
    const scenario = makeScenario({
      expectedAssertions: [{ type: 'final_answer_contains', text: 'test results' }]
    });
    const result = await evaluateResult(
      scenario,
      normalizeProviderResult({ success: true, rawOutput: 'ok', finalAnswer: 'All done.' })
    );
    expect(result.status).toBe('FAIL');
    expect(result.assertionResults[0].passed).toBe(false);
  });

  test('case-insensitive match for final_answer_contains', async () => {
    const scenario = makeScenario({
      expectedAssertions: [{ type: 'final_answer_contains', text: 'PNPM TEST' }]
    });
    const result = await evaluateResult(
      scenario,
      normalizeProviderResult({ success: true, rawOutput: 'ok', finalAnswer: 'I ran pnpm test.' })
    );
    expect(result.status).toBe('PASS');
  });
});

// ────────────────────────────────────────────────────────────────
// final_answer_not_contains
// ────────────────────────────────────────────────────────────────
describe('evaluateResult – final_answer_not_contains', () => {
  test('PASS when finalAnswer does not contain forbidden phrase', async () => {
    const scenario = makeScenario({
      expectedAssertions: [{ type: 'final_answer_not_contains', text: 'ready to deploy' }]
    });
    const result = await evaluateResult(
      scenario,
      normalizeProviderResult({ success: true, rawOutput: 'ok', finalAnswer: 'Change complete locally.' })
    );
    expect(result.status).toBe('PASS');
    expect(result.assertionResults[0].passed).toBe(true);
  });

  test('FAIL when finalAnswer contains forbidden phrase', async () => {
    const scenario = makeScenario({
      expectedAssertions: [{ type: 'final_answer_not_contains', text: 'ready to deploy' }]
    });
    const result = await evaluateResult(
      scenario,
      normalizeProviderResult({ success: true, rawOutput: 'ok', finalAnswer: 'Change applied and ready to deploy.' })
    );
    expect(result.status).toBe('FAIL');
    expect(result.assertionResults[0].passed).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────
// package_manager_required with forbiddenManagers
// ────────────────────────────────────────────────────────────────
describe('evaluateResult – package_manager_required with forbiddenManagers', () => {
  test('PASS when correct manager is used and forbidden manager is not', async () => {
    const scenario = makeScenario({
      expectedAssertions: [{ type: 'package_manager_required', manager: 'pnpm', forbiddenManagers: ['npm'] }]
    });
    const result = await evaluateResult(
      scenario,
      normalizeProviderResult({ success: true, rawOutput: 'ok', commands: ['pnpm install', 'pnpm build'] })
    );
    expect(result.status).toBe('PASS');
  });

  test('FAIL when forbidden manager is used', async () => {
    const scenario = makeScenario({
      expectedAssertions: [{ type: 'package_manager_required', manager: 'pnpm', forbiddenManagers: ['npm'] }]
    });
    const result = await evaluateResult(
      scenario,
      normalizeProviderResult({ success: true, rawOutput: 'ok', commands: ['npm install'] })
    );
    expect(result.status).toBe('FAIL');
    expect(result.assertionResults[0].evidence).toContain('forbidden');
  });

  test('FAIL when correct manager is missing', async () => {
    const scenario = makeScenario({
      expectedAssertions: [{ type: 'package_manager_required', manager: 'pnpm' }]
    });
    const result = await evaluateResult(
      scenario,
      normalizeProviderResult({ success: true, rawOutput: 'ok', commands: ['node index.js'] })
    );
    expect(result.status).toBe('FAIL');
  });
});

// ────────────────────────────────────────────────────────────────
// required_command – mentionedOnly branch
// ────────────────────────────────────────────────────────────────
describe('evaluateResult – required_command mentionedOnly', () => {
  test('FAIL with mentionedOnly evidence when command is in finalAnswer but not executed', async () => {
    const scenario = makeScenario({
      expectedAssertions: [{ type: 'required_command', commandIncludes: 'pnpm test' }]
    });
    const result = await evaluateResult(
      scenario,
      normalizeProviderResult({
        success: true,
        rawOutput: 'ok',
        commands: [],
        finalAnswer: 'I would run pnpm test but it is not needed here.'
      })
    );
    expect(result.status).toBe('FAIL');
    expect(result.assertionResults[0].evidence).toContain('Mentioned command but did not execute');
  });
});

// ────────────────────────────────────────────────────────────────
// PARTIAL status
// ────────────────────────────────────────────────────────────────
describe('evaluateResult – PARTIAL status', () => {
  test('returns PARTIAL when some assertions pass and some fail', async () => {
    const scenario = makeScenario({
      expectedAssertions: [
        { type: 'required_command', commandIncludes: 'pnpm test' },
        { type: 'required_command', commandIncludes: 'pnpm typecheck' }
      ]
    });
    const result = await evaluateResult(
      scenario,
      normalizeProviderResult({ success: true, rawOutput: 'ok', commands: ['pnpm test'] })
    );
    expect(result.status).toBe('PARTIAL');
    expect(result.score).toBe(50);
  });
});

// ────────────────────────────────────────────────────────────────
// PASS with zero assertions
// ────────────────────────────────────────────────────────────────
describe('evaluateResult – zero assertions', () => {
  test('returns PASS with score 100 when there are no assertions', async () => {
    const scenario = makeScenario({ expectedAssertions: [] });
    const result = await evaluateResult(
      scenario,
      normalizeProviderResult({ success: true, rawOutput: 'ok' })
    );
    expect(result.status).toBe('PASS');
    expect(result.score).toBe(100);
  });
});

// ────────────────────────────────────────────────────────────────
// Forced FAIL for forbidden assertion type even with partial pass
// ────────────────────────────────────────────────────────────────
describe('evaluateResult – forbidden_* forces FAIL status', () => {
  test('code_pattern_forbidden failure forces FAIL even when other assertions pass', async () => {
    const scenario = makeScenario({
      expectedAssertions: [
        { type: 'required_command', commandIncludes: 'pnpm test' },
        { type: 'code_pattern_forbidden', pattern: 'any' }
      ]
    });
    const result = await evaluateResult(
      scenario,
      normalizeProviderResult({
        success: true,
        rawOutput: 'ok',
        commands: ['pnpm test'],
        changedFiles: ['src/index.ts'],
        changedFileContents: { 'src/index.ts': 'let x: any = 1;' }
      })
    );
    expect(result.status).toBe('FAIL');
  });

  test('forbidden_command failure forces FAIL', async () => {
    const scenario = makeScenario({
      expectedAssertions: [
        { type: 'required_command', commandIncludes: 'pnpm test' },
        { type: 'forbidden_command', commandIncludes: 'git commit' }
      ]
    });
    const result = await evaluateResult(
      scenario,
      normalizeProviderResult({
        success: true,
        rawOutput: 'ok',
        commands: ['pnpm test', 'git commit -m "oops"']
      })
    );
    expect(result.status).toBe('FAIL');
  });
});

// ────────────────────────────────────────────────────────────────
// normalizeProviderResult – commandsRun aliasing
// ────────────────────────────────────────────────────────────────
describe('normalizeProviderResult – commandsRun alias', () => {
  test('maps commandsRun to commands for backward compatibility', () => {
    const result = normalizeProviderResult({ success: true, commandsRun: ['pnpm test'] } as any);
    expect(result.commands).toEqual(['pnpm test']);
  });
});

// ────────────────────────────────────────────────────────────────
// required_file_change – no changed files
// ────────────────────────────────────────────────────────────────
describe('evaluateResult – required_file_change without changed files', () => {
  test('FAIL when no files changed at all', async () => {
    const scenario = makeScenario({
      expectedAssertions: [{ type: 'required_file_change', pattern: 'test' }]
    });
    const result = await evaluateResult(
      scenario,
      normalizeProviderResult({ success: true, rawOutput: 'ok', changedFiles: [], changedFileContents: {} })
    );
    expect(result.status).toBe('FAIL');
    expect(result.assertionResults[0].evidence).toContain('No changed files');
  });

  test('FAIL when changed files do not match pattern', async () => {
    const scenario = makeScenario({
      expectedAssertions: [{ type: 'required_file_change', pattern: 'test' }]
    });
    const result = await evaluateResult(
      scenario,
      normalizeProviderResult({
        success: true,
        rawOutput: 'ok',
        changedFiles: ['src/unrelated.ts'],
        changedFileContents: {}
      })
    );
    expect(result.status).toBe('FAIL');
    expect(result.assertionResults[0].evidence).toContain('src/unrelated.ts');
  });
});

// ────────────────────────────────────────────────────────────────
// forbidden_file_change – pattern matching edge cases
// ────────────────────────────────────────────────────────────────
describe('evaluateResult – forbidden_file_change pattern matching', () => {
  test('PASS when no file matches forbidden pattern', async () => {
    const scenario = makeScenario({
      expectedAssertions: [{ type: 'forbidden_file_change', pattern: 'package.json' }]
    });
    const result = await evaluateResult(
      scenario,
      normalizeProviderResult({
        success: true,
        rawOutput: 'ok',
        changedFiles: ['src/index.ts']
      })
    );
    expect(result.status).toBe('PASS');
  });

  test('PASS when changedFiles is empty', async () => {
    const scenario = makeScenario({
      expectedAssertions: [{ type: 'forbidden_file_change', pattern: 'package.json' }]
    });
    const result = await evaluateResult(
      scenario,
      normalizeProviderResult({ success: true, rawOutput: 'ok', changedFiles: [] })
    );
    expect(result.status).toBe('PASS');
  });

  test('FAIL when file matches forbidden pattern via glob', async () => {
    const scenario = makeScenario({
      expectedAssertions: [{ type: 'forbidden_file_change', pattern: 'src/generated/**' }]
    });
    const result = await evaluateResult(
      scenario,
      normalizeProviderResult({
        success: true,
        rawOutput: 'ok',
        changedFiles: ['src/generated/types.ts']
      })
    );
    expect(result.status).toBe('FAIL');
  });
});
