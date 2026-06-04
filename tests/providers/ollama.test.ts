import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveOllamaModel, checkOllamaHealth } from '../../src/providers/ollama.js';

describe('resolveOllamaModel', () => {
  it('resolves known alias codellama', () => {
    expect(resolveOllamaModel('codellama')).toBe('codellama:latest');
  });

  it('resolves known alias deepseek-coder', () => {
    expect(resolveOllamaModel('deepseek-coder')).toBe('deepseek-coder:6.7b');
  });

  it('resolves known alias llama3', () => {
    expect(resolveOllamaModel('llama3')).toBe('llama3.1:8b');
  });

  it('resolves known alias qwen-coder', () => {
    expect(resolveOllamaModel('qwen-coder')).toBe('qwen2.5-coder:7b');
  });

  it('passes through unknown model names unchanged', () => {
    expect(resolveOllamaModel('mistral:7b')).toBe('mistral:7b');
    expect(resolveOllamaModel('llama3.2')).toBe('llama3.2');
    expect(resolveOllamaModel('my-custom-model')).toBe('my-custom-model');
  });
});

describe('checkOllamaHealth', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns up=true with model list on 200 response', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ models: [{ name: 'llama3.1:8b' }, { name: 'codellama:latest' }] }),
    });

    const health = await checkOllamaHealth('http://localhost:11434');
    expect(health.up).toBe(true);
    expect(health.models).toContain('llama3.1:8b');
    expect(health.models).toContain('codellama:latest');
    expect(health.error).toBeUndefined();
  });

  it('returns up=false on non-ok response', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 503,
    });

    const health = await checkOllamaHealth('http://localhost:11434');
    expect(health.up).toBe(false);
    expect(health.models).toEqual([]);
    expect(health.error).toContain('503');
  });

  it('returns up=false when fetch throws (connection refused)', async () => {
    (global.fetch as any).mockRejectedValueOnce(new Error('connection refused'));

    const health = await checkOllamaHealth('http://localhost:11434');
    expect(health.up).toBe(false);
    expect(health.models).toEqual([]);
    expect(health.error).toBe('connection refused');
  });

  it('handles empty models array gracefully', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ models: [] }),
    });

    const health = await checkOllamaHealth('http://localhost:11434');
    expect(health.up).toBe(true);
    expect(health.models).toEqual([]);
  });
});
