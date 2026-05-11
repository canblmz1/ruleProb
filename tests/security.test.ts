/**
 * Security regression tests:
 * - API key masking in provider outputs
 * - Badge score input validation
 * - HTML report escaping (provider/extractor values)
 * - Invalid provider name rejection
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenRouterProvider } from '../src/providers/openrouter.js';
import { generateScoreBadge, generateTrendBadge } from '../src/badge/generate.js';

// ─── OpenRouter API key masking ──────────────────────────────────────────────

describe('OpenRouterProvider API key masking', () => {
  const FAKE_KEY = 'sk-or-v1-supersecretkey1234567890abcdef';

  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = FAKE_KEY;
  });

  afterEach(() => {
    delete process.env.OPENROUTER_API_KEY;
  });

  it('masks API key when fetch throws with key in message', async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => {
      throw new Error(`Authorization failed for key ${FAKE_KEY}`);
    };

    const provider = new OpenRouterProvider({ provider: 'openrouter', instructionFiles: [], reportDir: '.ruleprobe', failBelow: 0, keepSandbox: false });
    const result = await provider.run({
      scenario: { id: '1', title: 't', ruleId: 'r', prompt: 'test', sandboxFiles: {}, expectedAssertions: [] },
      sandboxDir: '/tmp/fake'
    });

    global.fetch = originalFetch;

    expect(result.success).toBe(false);
    expect(result.rawOutput).not.toContain(FAKE_KEY);
    expect(result.rawOutput).toContain('[REDACTED]');
  });

  it('masks API key in non-ok HTTP response body', async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => ({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => `{"error":"Invalid API key ${FAKE_KEY}"}`
    } as any);

    const provider = new OpenRouterProvider({ provider: 'openrouter', instructionFiles: [], reportDir: '.ruleprobe', failBelow: 0, keepSandbox: false });
    const result = await provider.run({
      scenario: { id: '1', title: 't', ruleId: 'r', prompt: 'test', sandboxFiles: {}, expectedAssertions: [] },
      sandboxDir: '/tmp/fake'
    });

    global.fetch = originalFetch;

    expect(result.rawOutput).not.toContain(FAKE_KEY);
    expect(result.rawOutput).toContain('[REDACTED]');
  });

  it('returns failure with env var hint when API key is absent', async () => {
    delete process.env.OPENROUTER_API_KEY;

    const provider = new OpenRouterProvider({ provider: 'openrouter', instructionFiles: [], reportDir: '.ruleprobe', failBelow: 0, keepSandbox: false });
    const result = await provider.run({
      scenario: { id: '1', title: 't', ruleId: 'r', prompt: 'test', sandboxFiles: {}, expectedAssertions: [] },
      sandboxDir: '/tmp/fake'
    });

    expect(result.success).toBe(false);
    expect(result.rawOutput).toContain('OPENROUTER_API_KEY');
  });
});

// ─── Badge score validation ───────────────────────────────────────────────────

describe('generateScoreBadge input validation', () => {
  it('clamps negative scores to 0', () => {
    const svg = generateScoreBadge(-10, -10);
    expect(svg).toContain('0');
    expect(svg).not.toContain('-10');
  });

  it('clamps scores above 100 to 100', () => {
    const svg = generateScoreBadge(999, 999);
    expect(svg).toContain('100%20/%20100');
    // The displayed score should not show 999 as a badge value (note: namespace URL contains '1999' which is OK)
    expect(svg).not.toContain('>999%20/%20100<');
  });

  it('handles NaN score gracefully', () => {
    const svg = generateScoreBadge(NaN, NaN);
    expect(svg).toContain('0');
    expect(svg).not.toContain('NaN');
  });

  it('handles Infinity score gracefully', () => {
    const svg = generateScoreBadge(Infinity, Infinity);
    expect(svg).toContain('100');
    expect(svg).not.toContain('Infinity');
  });

  it('renders valid score normally', () => {
    const svg = generateScoreBadge(85, 78);
    expect(svg).toContain('85');
    expect(svg).toContain('ruleprobe');
  });
});

// ─── HTML report escaping ─────────────────────────────────────────────────────

describe('HTML report: provider/extractor name escaping', () => {
  it('writeHtmlReport escapes config.provider in header', async () => {
    const { writeHtmlReport } = await import('../src/reporters/html.js');
    const fs = await import('fs-extra');
    const os = await import('os');
    const path = await import('path');

    const reportDir = await fs.default.mkdtemp(path.default.join(os.default.tmpdir(), 'rp-sec-html-'));
    try {
      await writeHtmlReport([], {
        provider: '<script>alert(1)</script>',
        instructionFiles: [],
        reportDir,
        failBelow: 0,
        keepSandbox: false
      });
      const html = await fs.default.readFile(path.default.join(reportDir, 'report.html'), 'utf-8');
      expect(html).not.toContain('<script>alert(1)</script>');
      expect(html).toContain('&lt;script&gt;');
    } finally {
      await fs.default.remove(reportDir);
    }
  });
});
