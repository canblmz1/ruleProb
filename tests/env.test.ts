import { test, expect, beforeAll, afterAll } from 'vitest';
import { getEnv, requireEnv } from '../src/config/env.js';

let orgEnv: Record<string, string | undefined>;

beforeAll(() => {
  orgEnv = { ...process.env };
});

afterAll(() => {
  process.env = { ...orgEnv };
});

test('getEnv properly reads process.env', () => {
  process.env.TEST_GET_ENV = '  value123  ';
  expect(getEnv('TEST_GET_ENV')).toBe('value123');
});

test('getEnv returns undefined for empty strings', () => {
  process.env.TEST_EMPTY_ENV = '   ';
  expect(getEnv('TEST_EMPTY_ENV')).toBeUndefined();
});

test('requireEnv throws if not found', () => {
  delete process.env.TEST_MISSING_ENV;
  expect(() => requireEnv('TEST_MISSING_ENV')).toThrow();
});

test('requireEnv returns valid string if found', () => {
  process.env.TEST_FOUND_ENV = 'present';
  expect(requireEnv('TEST_FOUND_ENV')).toBe('present');
});
