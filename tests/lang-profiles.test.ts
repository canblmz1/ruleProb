import { describe, test, expect } from 'vitest';
import { resolveLanguageProfile, LANGUAGE_PROFILES } from '../src/lang-profiles/index.js';

describe('language profiles', () => {
  test('resolveLanguageProfile python returns python profile', () => {
    const p = resolveLanguageProfile('python');
    expect(p.id).toBe('python');
    expect(p.testRunners).toContain('pytest');
    expect(p.commandPrefixes).toContain('ruff');
  });
  test('resolveLanguageProfile go returns go profile', () => {
    const p = resolveLanguageProfile('go');
    expect(p.commandPrefixes).toContain('go');
    expect(p.testRunners).toContain('go test');
  });
  test('resolveLanguageProfile undefined returns node default', () => {
    const p = resolveLanguageProfile(undefined);
    expect(p.id).toBe('node');
  });
  test('resolveLanguageProfile unknown returns node default', () => {
    const p = resolveLanguageProfile('cobol');
    expect(p.id).toBe('node');
  });
  test('all profiles have required fields', () => {
    for (const [, profile] of Object.entries(LANGUAGE_PROFILES)) {
      expect(profile.id).toBeTruthy();
      expect(profile.commandPrefixes.length).toBeGreaterThan(0);
      expect(profile.testRunners.length).toBeGreaterThan(0);
    }
  });
});
