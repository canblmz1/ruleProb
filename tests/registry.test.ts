/**
 * Tests for fetchRemotePack() content sanitization (TD-07).
 * Covers: size limit, HTML rejection, valid plain-text, valid JSON, rule count limit.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchRemotePack } from '../src/packs/registry.js';

function mockFetch(body: string, status = 200) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  } as unknown as Response);
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Size limit ───────────────────────────────────────────────────────────────

describe('fetchRemotePack – size limit', () => {
  it('throws "too large" when content exceeds 100KB', async () => {
    const oversized = '- rule\n'.repeat(15_000); // well over 100_000 bytes
    mockFetch(oversized);
    await expect(fetchRemotePack('https://example.com/pack.txt')).rejects.toThrow(
      /too large/
    );
  });
});

// ─── HTML rejection ───────────────────────────────────────────────────────────

describe('fetchRemotePack – HTML rejection', () => {
  const htmlCases = [
    ['<html><body>Hello</body></html>', '<html> marker'],
    ['<!DOCTYPE html><html></html>', '<!doctype marker'],
    ['<script>alert(1)</script>', '<script> marker'],
    ['<body>content</body>', '<body> marker'],
  ] as const;

  for (const [content, label] of htmlCases) {
    it(`throws "appears to be HTML" for ${label}`, async () => {
      mockFetch(content);
      await expect(fetchRemotePack('https://example.com/pack.txt')).rejects.toThrow(
        /appears to be HTML/
      );
    });
  }
});

// ─── Valid plain-text ─────────────────────────────────────────────────────────

describe('fetchRemotePack – valid plain-text', () => {
  it('parses "- ..." lines into a rule pack', async () => {
    const content = [
      '- NEVER use any.',
      '- ALWAYS write tests.',
      '- Do not commit secrets.',
    ].join('\n');
    mockFetch(content);
    const pack = await fetchRemotePack('https://example.com/my-rules.txt');
    expect(pack.rules).toHaveLength(3);
    expect(pack.rules[0]).toBe('- NEVER use any.');
    expect(pack.name).toBe('my-rules');
    expect(pack.tags).toContain('remote');
  });
});

// ─── Valid JSON ───────────────────────────────────────────────────────────────

describe('fetchRemotePack – valid JSON', () => {
  it('parses a JSON RulePack correctly', async () => {
    const pack = {
      name: 'test-pack',
      description: 'A test pack',
      tags: ['test'],
      rules: ['- Rule one.', '- Rule two.'],
    };
    mockFetch(JSON.stringify(pack));
    const result = await fetchRemotePack('https://example.com/pack.json');
    expect(result.name).toBe('test-pack');
    expect(result.rules).toHaveLength(2);
  });

  it('throws when JSON rules are not all strings', async () => {
    const pack = {
      name: 'bad-pack',
      description: 'Bad',
      tags: [],
      rules: ['- Rule one.', 42, null],
    };
    mockFetch(JSON.stringify(pack));
    await expect(fetchRemotePack('https://example.com/pack.json')).rejects.toThrow(
      /must be an array of strings/
    );
  });
});

// ─── Rule count limit ─────────────────────────────────────────────────────────

describe('fetchRemotePack – rule count limit', () => {
  it('throws "too many rules" for JSON pack with > 100 rules', async () => {
    const pack = {
      name: 'huge-pack',
      description: 'Too many',
      tags: [],
      rules: Array.from({ length: 101 }, (_, i) => `- Rule ${i}.`),
    };
    mockFetch(JSON.stringify(pack));
    await expect(fetchRemotePack('https://example.com/pack.json')).rejects.toThrow(
      /too many rules/
    );
  });

  it('throws "too many rules" for plain-text pack with > 100 rules', async () => {
    const lines = Array.from({ length: 101 }, (_, i) => `- Rule ${i}.`).join('\n');
    mockFetch(lines);
    await expect(fetchRemotePack('https://example.com/pack.txt')).rejects.toThrow(
      /too many rules/
    );
  });

  it('accepts a pack with exactly 100 rules (JSON)', async () => {
    const pack = {
      name: 'max-pack',
      description: 'Max allowed',
      tags: [],
      rules: Array.from({ length: 100 }, (_, i) => `- Rule ${i}.`),
    };
    mockFetch(JSON.stringify(pack));
    const result = await fetchRemotePack('https://example.com/pack.json');
    expect(result.rules).toHaveLength(100);
  });
});
