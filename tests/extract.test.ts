import { describe, test, expect } from 'vitest';
import { extractRules } from '../src/rules/extract.js';

// Helper to run extraction on a single line of instruction content
function extract(line: string) {
  return extractRules([{ path: 'CLAUDE.md', content: line }]);
}

describe('extractRules – package_manager', () => {
  test('detects "ALWAYS use pnpm" as package_manager rule', () => {
    const rules = extract('- ALWAYS use pnpm');
    const pm = rules.find(r => r.category === 'package_manager');
    expect(pm).toBeDefined();
    expect((pm!.assertions[0] as any).manager).toBe('pnpm');
  });

  test('detects "use pnpm" as package_manager rule', () => {
    const rules = extract('- use pnpm for all package commands');
    const pm = rules.find(r => r.category === 'package_manager');
    expect(pm).toBeDefined();
  });

  test('detects forbidden manager never use npm', () => {
    const rules = extract('- ALWAYS use pnpm. Never use npm.');
    const withForbidden = rules.find(
      r => r.category === 'package_manager' && (r.assertions[0] as any).forbiddenManagers?.includes('npm')
    );
    expect(withForbidden).toBeDefined();
  });

  test('detects forbidden yarn as standalone negation', () => {
    const rules = extract('- Never use yarn for installs');
    const withForbidden = rules.find(
      r => r.category === 'package_manager' && (r.assertions[0] as any).forbiddenManagers?.includes('yarn')
    );
    expect(withForbidden).toBeDefined();
  });

  test('detects forbidden bun as standalone negation', () => {
    const rules = extract('- never bun is allowed here');
    const withForbidden = rules.find(
      r => r.category === 'package_manager' && (r.assertions[0] as any).forbiddenManagers?.includes('bun')
    );
    expect(withForbidden).toBeDefined();
  });

  test('produces no package_manager rule for unrelated pnpm mentions', () => {
    // A line that mentions pnpm but is informational / conventional commit
    const rules = extract('- Conventional Commits: feat(scope): chore(pnpm):');
    const pm = rules.find(r => r.category === 'package_manager');
    expect(pm).toBeUndefined();
  });
});

describe('extractRules – forbidden_command', () => {
  test('detects NEVER run backtick command', () => {
    const rules = extract('- NEVER run `pnpm test`');
    const forbidden = rules.find(r => r.category === 'forbidden_command');
    expect(forbidden).toBeDefined();
    expect((forbidden!.assertions[0] as any).commandIncludes).toContain('pnpm test');
  });

  test('detects "do not commit" as forbidden git commit', () => {
    const rules = extract('- Do not commit without review.');
    const forbidden = rules.find(r => r.category === 'forbidden_command');
    expect(forbidden).toBeDefined();
    expect((forbidden!.assertions[0] as any).commandIncludes).toBe('git commit');
  });

  test('detects "never commit" as forbidden git commit', () => {
    const rules = extract("- Never commit broken code.");
    const forbidden = rules.find(r => r.category === 'forbidden_command');
    expect(forbidden).toBeDefined();
    expect((forbidden!.assertions[0] as any).commandIncludes).toBe('git commit');
  });

  test("ignores \"do not commit to\" as it's not a git commit command", () => {
    const rules = extract('- Do not commit to that approach.');
    // "commit to" is the narrative false-positive; should not produce forbidden_command for git commit
    const forbidden = rules.find(r => r.category === 'forbidden_command' && (r.assertions[0] as any).commandIncludes === 'git commit');
    expect(forbidden).toBeUndefined();
  });

  test('detects `bazel clean` as forbidden via "avoid"', () => {
    const rules = extract('- Avoid `bazel clean` in CI builds');
    const forbidden = rules.find(r => r.category === 'forbidden_command' && (r.assertions[0] as any).commandIncludes === 'bazel clean');
    expect(forbidden).toBeDefined();
  });

  test('rejects short/keyword tokens in backticks', () => {
    // "any" is too short and matches a keyword
    const rules = extract('- Never use `any` in code');
    const forbidden = rules.find(r => r.category === 'forbidden_command');
    // Should produce code_pattern_forbidden, not forbidden_command
    expect(forbidden).toBeUndefined();
  });
});

describe('extractRules – required_command', () => {
  test('detects "Use `vitest`" as required_command', () => {
    const rules = extract('- Use `vitest` to run tests');
    const req = rules.find(r => r.category === 'required_command');
    expect(req).toBeDefined();
    expect((req!.assertions[0] as any).commandIncludes).toContain('vitest');
  });

  test('detects "ensure pnpm typecheck passes" as required_command', () => {
    const rules = extract('- Ensure pnpm typecheck passes before committing');
    const req = rules.find(r => r.category === 'required_command');
    expect(req).toBeDefined();
    expect((req!.assertions[0] as any).commandIncludes).toContain('pnpm typecheck');
  });

  test('detects "run `bazel build`" as required_command', () => {
    const rules = extract('- Always run `bazel build //...` to verify');
    const req = rules.find(r => r.category === 'required_command');
    expect(req).toBeDefined();
  });

  test('does NOT produce required_command for bare package manager names', () => {
    // "pnpm" alone (without sub-command) should not produce a command rule
    const rules = extract('- Use `pnpm` as the package manager');
    const cmdRule = rules.find(r => r.category === 'required_command');
    expect(cmdRule).toBeUndefined();
  });
});

describe('extractRules – code_pattern_forbidden', () => {
  test('detects "never use any" as code_pattern_forbidden', () => {
    const rules = extract('- Never use `any` in TypeScript');
    const rule = rules.find(r => r.category === 'code_pattern_forbidden' && (r.assertions[0] as any).pattern === 'any');
    expect(rule).toBeDefined();
  });

  test('detects "avoid any" as code_pattern_forbidden', () => {
    const rules = extract('- Avoid `any` type annotations');
    const rule = rules.find(r => r.category === 'code_pattern_forbidden');
    expect(rule).toBeDefined();
  });

  test('detects Buffer + use Uint8Array as code_pattern_forbidden for Buffer', () => {
    const rules = extract('- Never use Buffer; use Uint8Array instead');
    const bufferForbidden = rules.find(r => r.category === 'code_pattern_forbidden' && (r.assertions[0] as any).pattern === 'Buffer');
    expect(bufferForbidden).toBeDefined();
  });

  test('detects "never use classes" as code_pattern_forbidden', () => {
    const rules = extract('- Never use classes; use plain objects');
    const rule = rules.find(r => r.category === 'code_pattern_forbidden' && (r.assertions[0] as any).pattern === 'class');
    expect(rule).toBeDefined();
  });

  test('detects "never use require()" as code_pattern_forbidden', () => {
    const rules = extract('- Never use require() for imports');
    const rule = rules.find(r => r.category === 'code_pattern_forbidden' && (r.assertions[0] as any).pattern === 'require(');
    expect(rule).toBeDefined();
  });

  test('detects "default export forbidden" as code_pattern_forbidden', () => {
    const rules = extract('- Default export is forbidden in this repo');
    const rule = rules.find(r => r.category === 'code_pattern_forbidden' && (r.assertions[0] as any).pattern === 'export default');
    expect(rule).toBeDefined();
  });
});

describe('extractRules – code_pattern_required', () => {
  test('detects "use unknown" as code_pattern_required', () => {
    const rules = extract('- Use unknown instead of any');
    const rule = rules.find(r => r.category === 'code_pattern_required' && (r.assertions[0] as any).pattern === 'unknown');
    expect(rule).toBeDefined();
  });

  test('detects "use Uint8Array" as code_pattern_required', () => {
    const rules = extract('- Use Uint8Array for binary data');
    const rule = rules.find(r => r.category === 'code_pattern_required' && (r.assertions[0] as any).pattern === 'Uint8Array');
    expect(rule).toBeDefined();
  });

  test('detects "use plain objects" as code_pattern_required', () => {
    const rules = extract('- Use plain objects instead of classes');
    const rule = rules.find(r => r.category === 'code_pattern_required' && (r.assertions[0] as any).pattern === 'plain objects');
    expect(rule).toBeDefined();
  });
});

describe('extractRules – file change rules', () => {
  test('detects "never edit package.json" as forbidden_file_change', () => {
    const rules = extract('- Never edit package.json directly');
    const rule = rules.find(r => r.category === 'forbidden_file_change' && (r.assertions[0] as any).pattern === 'package.json');
    expect(rule).toBeDefined();
  });

  test('detects "do not modify generated files" as forbidden_file_change', () => {
    const rules = extract('- Do not modify generated files');
    const rule = rules.find(r => r.category === 'forbidden_file_change');
    expect(rule).toBeDefined();
  });

  test('detects "do not touch src/generated/" as forbidden_file_change with explicit pattern', () => {
    const rules = extract('- Do not touch `src/generated/` files');
    const rule = rules.find(r => r.category === 'forbidden_file_change');
    expect(rule).toBeDefined();
    expect((rule!.assertions[0] as any).pattern).toContain('src/generated/');
  });

  test('detects "must include tests" as required_file_change', () => {
    const rules = extract('- Must include tests with every change');
    const rule = rules.find(r => r.category === 'required_file_change' && (r.assertions[0] as any).pattern === 'test');
    expect(rule).toBeDefined();
  });

  test('detects "must update docs" as required_file_change', () => {
    const rules = extract('- Must update docs when changing public API');
    const rule = rules.find(r => r.category === 'required_file_change' && (r.assertions[0] as any).pattern === 'docs');
    expect(rule).toBeDefined();
  });
});

describe('extractRules – informational detection', () => {
  test('marks conventional commit lines as informational and non-testable', () => {
    const rules = extract('- Conventional commit: feat(scope): add new feature');
    expect(rules.every(r => r.testable === false)).toBe(true);
  });

  test('marks "e.g." lines combined with informational content as informational', () => {
    // The "e.g." fragment triggers isInformational because the whole line contains "e.g."
    // followed by a conventional commit example. Both parts are non-actionable.
    const rules = extract('- e.g. feat(scope): describe your commit');
    expect(rules.every(r => r.testable === false)).toBe(true);
  });

  test('marks "for example" lines as informational', () => {
    const rules = extract('- For example, run pnpm build');
    expect(rules.every(r => r.testable === false)).toBe(true);
  });
});

describe('extractRules – line filtering', () => {
  test('skips lines not starting with -, *, or digit', () => {
    const rules = extractRules([{
      path: 'README.md',
      content: 'This is a header\nNot a bullet point\nNo rule here'
    }]);
    expect(rules).toHaveLength(0);
  });

  test('accepts numbered list items', () => {
    const rules = extractRules([{
      path: 'AGENTS.md',
      content: '1. Always use pnpm\n2. Never use npm'
    }]);
    expect(rules.length).toBeGreaterThan(0);
    expect(rules[0].lineNumber).toBe(1);
  });

  test('extracts from multiple files', () => {
    const rules = extractRules([
      { path: 'CLAUDE.md', content: '- Always use pnpm\n' },
      { path: 'AGENTS.md', content: '- Never run `git commit`\n' }
    ]);
    const sourcePaths = rules.map(r => r.sourceFile);
    expect(sourcePaths).toContain('CLAUDE.md');
    expect(sourcePaths).toContain('AGENTS.md');
  });
});

describe('extractRules – deduplication', () => {
  test('deduplicates identical rules within the same fragment', () => {
    // Two identical pnpm package manager rules from the same line
    const rules = extract('- ALWAYS use pnpm. ALWAYS use pnpm.');
    const pmRules = rules.filter(r => r.category === 'package_manager');
    // Should not produce two identical package_manager rules
    const signatures = pmRules.map(r => JSON.stringify(r.assertions));
    const unique = new Set(signatures);
    expect(unique.size).toBe(pmRules.length);
  });
});

describe('extractRules – multi-rule split', () => {
  test('splits NEVER run pnpm test + Use vitest into two rules', () => {
    const rules = extract('- NEVER run `pnpm test`. Use `vitest` --run instead.');
    const forbidden = rules.find(r => r.category === 'forbidden_command');
    const required = rules.find(r => r.category === 'required_command');
    expect(forbidden).toBeDefined();
    expect(required).toBeDefined();
  });

  test('mention/explain lines produce final_answer_required fallback', () => {
    const rules = extract('- Always mention changed files in the final answer');
    // The word "mention" triggers a final_answer_required fallback if no command rule is found
    const finalAnswer = rules.find(r => r.category === 'final_answer_required');
    expect(finalAnswer).toBeDefined();
  });
});
