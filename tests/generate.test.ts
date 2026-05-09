import { describe, test, expect } from 'vitest';
import { generateScenarios, createScenarioForRule } from '../src/scenarios/generate.js';
import { Rule } from '../src/types/index.js';

function makeRule(overrides: Partial<Rule> & { category: Rule['category'] }): Rule {
  return {
    id: 'rule-1',
    sourceFile: 'CLAUDE.md',
    lineNumber: 1,
    rawLine: '- test rule',
    text: 'test rule',
    severity: 'medium',
    testable: true,
    assertions: [],
    ...overrides
  };
}

describe('generateScenarios', () => {
  test('skips non-testable rules', () => {
    const rules: Rule[] = [
      makeRule({ category: 'informational', testable: false, assertions: [] }),
      makeRule({ category: 'commit_message_format', testable: false, assertions: [] })
    ];
    const scenarios = generateScenarios(rules);
    expect(scenarios).toHaveLength(0);
  });

  test('generates one scenario per testable rule', () => {
    const rules: Rule[] = [
      makeRule({ id: 'r1', category: 'package_manager', assertions: [{ type: 'package_manager_required', manager: 'pnpm' }] }),
      makeRule({ id: 'r2', category: 'forbidden_command', assertions: [{ type: 'forbidden_command', commandIncludes: 'git commit' }] })
    ];
    const scenarios = generateScenarios(rules);
    expect(scenarios).toHaveLength(2);
  });

  test('assigns sequential scenario ids', () => {
    const rules: Rule[] = [
      makeRule({ id: 'r1', category: 'required_command', assertions: [{ type: 'required_command', commandIncludes: 'pnpm test' }] }),
      makeRule({ id: 'r2', category: 'required_command', assertions: [{ type: 'required_command', commandIncludes: 'pnpm build' }] })
    ];
    const scenarios = generateScenarios(rules);
    expect(scenarios[0].id).toMatch(/^scenario-\d+$/);
    expect(scenarios[1].id).toMatch(/^scenario-\d+$/);
    expect(scenarios[0].id).not.toBe(scenarios[1].id);
  });
});

describe('createScenarioForRule – package_manager', () => {
  test('builds package_manager scenario with pnpm package.json', () => {
    const rule = makeRule({
      category: 'package_manager',
      assertions: [{ type: 'package_manager_required', manager: 'pnpm' }]
    });
    const scenario = createScenarioForRule(rule, 'scenario-1')!;
    expect(scenario.title).toContain('pnpm');
    expect(scenario.sandboxFiles['package.json']).toContain('"pnpm@9.0.0"');
    expect(scenario.sandboxFiles['pnpm-lock.yaml']).toBeDefined();
  });

  test('uses manager from assertion in title', () => {
    const rule = makeRule({
      category: 'package_manager',
      assertions: [{ type: 'package_manager_required', manager: 'yarn' }]
    });
    const scenario = createScenarioForRule(rule, 's1')!;
    expect(scenario.title).toContain('yarn');
  });
});

describe('createScenarioForRule – forbidden_command', () => {
  test('builds forbidden_command scenario with command in title', () => {
    const rule = makeRule({
      category: 'forbidden_command',
      assertions: [{ type: 'forbidden_command', commandIncludes: 'git commit' }]
    });
    const scenario = createScenarioForRule(rule, 's1')!;
    expect(scenario.title).toContain('git commit');
    expect(scenario.prompt).toContain('local-only');
    expect(scenario.sandboxFiles['src/index.ts']).toBeDefined();
  });

  test('uses default "forbidden command" when no assertion', () => {
    const rule = makeRule({ category: 'forbidden_command', assertions: [] });
    const scenario = createScenarioForRule(rule, 's1')!;
    expect(scenario.title).toContain('Forbidden command boundary');
  });
});

describe('createScenarioForRule – required_command', () => {
  test('includes the required command in title and infers script name', () => {
    const rule = makeRule({
      category: 'required_command',
      assertions: [{ type: 'required_command', commandIncludes: 'pnpm typecheck' }]
    });
    const scenario = createScenarioForRule(rule, 's1')!;
    expect(scenario.title).toContain('pnpm typecheck');
    const pkg = JSON.parse(scenario.sandboxFiles['package.json']);
    expect(pkg.scripts.typecheck).toBeDefined();
  });

  test('infers "test" script for vitest command', () => {
    const rule = makeRule({
      category: 'required_command',
      assertions: [{ type: 'required_command', commandIncludes: 'vitest run' }]
    });
    const scenario = createScenarioForRule(rule, 's1')!;
    const pkg = JSON.parse(scenario.sandboxFiles['package.json']);
    // "vitest" does not match the pnpm|npm|yarn|bun script prefix so it falls to 'test' default
    expect(pkg.scripts.test).toBeDefined();
  });
});

describe('createScenarioForRule – code_pattern_forbidden', () => {
  test('sets title with pattern', () => {
    const rule = makeRule({
      category: 'code_pattern_forbidden',
      assertions: [{ type: 'code_pattern_forbidden', pattern: 'any' }]
    });
    const scenario = createScenarioForRule(rule, 's1')!;
    expect(scenario.title).toContain('any');
    expect(scenario.sandboxFiles['src/parser.ts']).toContain('parseValue');
  });
});

describe('createScenarioForRule – code_pattern_required', () => {
  test('sets title with pattern', () => {
    const rule = makeRule({
      category: 'code_pattern_required',
      assertions: [{ type: 'code_pattern_required', pattern: 'unknown' }]
    });
    const scenario = createScenarioForRule(rule, 's1')!;
    expect(scenario.title).toContain('unknown');
    expect(scenario.sandboxFiles['src/normalize.ts']).toBeDefined();
  });
});

describe('createScenarioForRule – required_file_change', () => {
  test('includes test path in sandboxFiles for "test" pattern', () => {
    const rule = makeRule({
      category: 'required_file_change',
      assertions: [{ type: 'required_file_change', pattern: 'test' }]
    });
    const scenario = createScenarioForRule(rule, 's1')!;
    expect(scenario.title).toContain('test');
    expect(scenario.sandboxFiles['tests/add.test.ts']).toBeDefined();
  });

  test('includes docs path in sandboxFiles for "docs" pattern', () => {
    const rule = makeRule({
      category: 'required_file_change',
      assertions: [{ type: 'required_file_change', pattern: 'docs' }]
    });
    const scenario = createScenarioForRule(rule, 's1')!;
    expect(scenario.sandboxFiles['docs/guide.md']).toBeDefined();
  });
});

describe('createScenarioForRule – forbidden_file_change', () => {
  test('includes forbidden path in sandboxFiles', () => {
    const rule = makeRule({
      category: 'forbidden_file_change',
      assertions: [{ type: 'forbidden_file_change', pattern: 'generated' }]
    });
    const scenario = createScenarioForRule(rule, 's1')!;
    expect(scenario.title).toContain('generated');
    expect(scenario.sandboxFiles['src/generated/schema.ts']).toBeDefined();
  });
});

describe('createScenarioForRule – final_answer_required', () => {
  test('builds final_answer_required scenario', () => {
    const rule = makeRule({
      category: 'final_answer_required',
      assertions: [{ type: 'final_answer_contains', text: 'evidence' }]
    });
    const scenario = createScenarioForRule(rule, 's1')!;
    expect(scenario.title).toContain('Final answer');
    expect(scenario.sandboxFiles['src/user.ts']).toBeDefined();
  });
});

describe('createScenarioForRule – final_answer_not_contains', () => {
  test('builds final_answer_not_contains scenario with restricted phrase', () => {
    const rule = makeRule({
      category: 'final_answer_not_contains',
      assertions: [{ type: 'final_answer_not_contains', text: 'ready to deploy' }]
    });
    const scenario = createScenarioForRule(rule, 's1')!;
    expect(scenario.title).toContain('phrasing boundary');
    expect(scenario.prompt).toContain('ready to deploy');
  });

  test('uses default phrase when no assertion provided', () => {
    const rule = makeRule({ category: 'final_answer_not_contains', assertions: [] });
    const scenario = createScenarioForRule(rule, 's1')!;
    expect(scenario.prompt).toContain('the restricted phrase');
  });
});

describe('createScenarioForRule – commit_message_format and informational', () => {
  test('commit_message_format returns null', () => {
    const rule = makeRule({ category: 'commit_message_format', testable: false, assertions: [] });
    const scenario = createScenarioForRule(rule, 's1');
    expect(scenario).toBeNull();
  });

  test('informational returns null', () => {
    const rule = makeRule({ category: 'informational', testable: false, assertions: [] });
    const scenario = createScenarioForRule(rule, 's1');
    expect(scenario).toBeNull();
  });
});

describe('createScenarioForRule – unknown category falls back to generic', () => {
  test('unknown category uses generic prompt with ruleText', () => {
    const rule = makeRule({
      category: 'unknown',
      text: 'Some unknown instruction',
      assertions: []
    });
    const scenario = createScenarioForRule(rule, 's1')!;
    expect(scenario).toBeDefined();
    expect(scenario.title).toContain('Some unknown instruction');
    expect(scenario.sandboxFiles['src/index.ts']).toBeDefined();
  });
});

describe('scenario carries rule metadata', () => {
  test('scenario has ruleId, ruleText, sourceFile, severity, expectedAssertions', () => {
    const rule = makeRule({
      id: 'r-special',
      sourceFile: 'AGENTS.md',
      lineNumber: 42,
      text: 'Always use pnpm',
      severity: 'high',
      category: 'package_manager',
      assertions: [{ type: 'package_manager_required', manager: 'pnpm' }]
    });
    const scenario = createScenarioForRule(rule, 's99')!;
    expect(scenario.ruleId).toBe('r-special');
    expect(scenario.ruleText).toBe('Always use pnpm');
    expect(scenario.sourceFile).toBe('AGENTS.md');
    expect(scenario.sourceLine).toBe(42);
    expect(scenario.severity).toBe('high');
    expect(scenario.expectedAssertions).toEqual(rule.assertions);
  });
});
