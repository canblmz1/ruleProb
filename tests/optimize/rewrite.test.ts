import { describe, it, expect } from 'vitest';
import { rewriteRuleDeterministic } from '../../src/optimize/rewrite.js';
import type { RuleHistory } from '../../src/history/ruleHistory.js';

function makeHistory(ruleText: string, category: string = 'forbidden_command'): RuleHistory {
  return {
    signature: `${category}::${ruleText.toLowerCase()}::CLAUDE.md`,
    ruleText,
    sourceFile: 'CLAUDE.md',
    sourceLine: 3,
    runs: [],
  };
}

describe('rewriteRuleDeterministic', () => {
  it('prefixes NEVER for forbidden_command rules', () => {
    const h = makeHistory('run pnpm publish', 'forbidden_command');
    const result = rewriteRuleDeterministic(h);
    expect(result.after).toMatch(/NEVER/i);
    expect(result.before).toBe('run pnpm publish');
    expect(result.before).not.toBe(result.after);
  });

  it('includes an Example: line in the output', () => {
    const h = makeHistory('run pnpm publish', 'forbidden_command');
    const result = rewriteRuleDeterministic(h);
    expect(result.after).toContain('Example:');
  });

  it('prefixes ALWAYS for required_command rules', () => {
    const h = makeHistory('run pnpm test before committing', 'required_command');
    const result = rewriteRuleDeterministic(h);
    expect(result.after).toMatch(/ALWAYS/i);
  });

  it('prefixes ALWAYS for package_manager rules', () => {
    const h = makeHistory('use pnpm', 'package_manager');
    const result = rewriteRuleDeterministic(h);
    expect(result.after).toMatch(/ALWAYS/i);
  });

  it('provides a rationale string', () => {
    const h = makeHistory('use pnpm', 'package_manager');
    const result = rewriteRuleDeterministic(h);
    expect(typeof result.rationale).toBe('string');
    expect(result.rationale.length).toBeGreaterThan(5);
  });

  it('does not return same before and after', () => {
    const h = makeHistory('some rule text', 'informational');
    const result = rewriteRuleDeterministic(h);
    expect(result.before).not.toBe(result.after);
  });
});
