import { test, expect, vi } from 'vitest';
import { AnthropicProvider } from '../src/providers/anthropic.js';
import { OpenAIProvider } from '../src/providers/openai.js';
import { OllamaProvider } from '../src/providers/ollama.js';
import { getEnv } from '../src/config/env.js';

vi.mock('../src/config/env.js', () => ({
  getEnv: vi.fn(),
}));

vi.mock('../src/sandbox/create.js', () => ({
  getChangedFiles: vi.fn(() => Promise.resolve([])),
  getChangedFileContents: vi.fn(() => Promise.resolve({})),
}));

vi.mock('../src/actions/execute.js', () => ({
  executeActionPlan: vi.fn(() => Promise.resolve({
    success: true,
    changedFiles: [],
    commands: [],
    errors: [],
    evidence: []
  })),
}));

const STUB_SCENARIO = {
  id: '1', title: 'test', ruleId: '1', prompt: 'Hello',
  sandboxFiles: {}, expectedAssertions: []
};

// ── AnthropicProvider ─────────────────────────────────────────────────────────

test('AnthropicProvider returns failure when ANTHROPIC_API_KEY is missing', async () => {
  (getEnv as any).mockReturnValue(undefined);
  const provider = new AnthropicProvider({});
  const result = await provider.run({ scenario: STUB_SCENARIO, sandboxDir: 'tmp' });
  expect(result.success).toBe(false);
  expect(result.rawOutput).toContain('ANTHROPIC_API_KEY');
});

test('AnthropicProvider sends x-api-key header and uses correct endpoint', async () => {
  (getEnv as any).mockImplementation((name: string) =>
    name === 'ANTHROPIC_API_KEY' ? 'test-anthropic-key' : undefined
  );

  const originalFetch = global.fetch;
  let capturedUrl = '';
  let capturedHeaders: any = null;

  global.fetch = async (url: any, options: any) => {
    capturedUrl = url.toString();
    capturedHeaders = options.headers;
    return {
      ok: true, status: 200, statusText: 'OK',
      text: async () => JSON.stringify({
        content: [{ text: JSON.stringify({ actions: [], finalAnswer: 'Anthropic response' }) }]
      })
    } as any;
  };

  const provider = new AnthropicProvider({});
  const result = await provider.run({ scenario: STUB_SCENARIO, sandboxDir: 'tmp' });

  expect(capturedUrl).toBe('https://api.anthropic.com/v1/messages');
  expect(capturedHeaders['x-api-key']).toBe('test-anthropic-key');
  expect(capturedHeaders['anthropic-version']).toBe('2023-06-01');
  expect(result.success).toBe(true);
  expect(result.finalAnswer).toBe('Anthropic response');

  global.fetch = originalFetch;
});

test('AnthropicProvider uses default model claude-3-5-haiku-20241022', async () => {
  (getEnv as any).mockImplementation((name: string) =>
    name === 'ANTHROPIC_API_KEY' ? 'test-key' : undefined
  );

  const originalFetch = global.fetch;
  let capturedBody: any = null;

  global.fetch = async (_url: any, options: any) => {
    capturedBody = JSON.parse(options.body as string);
    return {
      ok: true, status: 200, statusText: 'OK',
      text: async () => JSON.stringify({
        content: [{ text: JSON.stringify({ actions: [], finalAnswer: 'ok' }) }]
      })
    } as any;
  };

  const provider = new AnthropicProvider({});
  await provider.run({ scenario: STUB_SCENARIO, sandboxDir: 'tmp' });

  expect(capturedBody.model).toBe('claude-3-5-haiku-20241022');

  global.fetch = originalFetch;
});

test('AnthropicProvider does not expose API key in rawOutput', async () => {
  (getEnv as any).mockImplementation((name: string) =>
    name === 'ANTHROPIC_API_KEY' ? 'super-secret-key' : undefined
  );

  const originalFetch = global.fetch;

  global.fetch = async (_url: any, _options: any) => {
    return {
      ok: true, status: 200, statusText: 'OK',
      text: async () => JSON.stringify({
        content: [{ text: JSON.stringify({ actions: [], finalAnswer: 'ok' }) }]
      })
    } as any;
  };

  const provider = new AnthropicProvider({});
  const result = await provider.run({ scenario: STUB_SCENARIO, sandboxDir: 'tmp' });

  expect(result.rawOutput).not.toContain('super-secret-key');

  global.fetch = originalFetch;
});

// ── OpenAIProvider ────────────────────────────────────────────────────────────

test('OpenAIProvider returns failure when OPENAI_API_KEY is missing', async () => {
  (getEnv as any).mockReturnValue(undefined);
  const provider = new OpenAIProvider({});
  const result = await provider.run({ scenario: STUB_SCENARIO, sandboxDir: 'tmp' });
  expect(result.success).toBe(false);
  expect(result.rawOutput).toContain('OPENAI_API_KEY');
});

test('OpenAIProvider sends Bearer token and uses correct endpoint', async () => {
  (getEnv as any).mockImplementation((name: string) =>
    name === 'OPENAI_API_KEY' ? 'test-openai-key' : undefined
  );

  const originalFetch = global.fetch;
  let capturedUrl = '';
  let capturedHeaders: any = null;
  let capturedBody: any = null;

  global.fetch = async (url: any, options: any) => {
    capturedUrl = url.toString();
    capturedHeaders = options.headers;
    capturedBody = JSON.parse(options.body as string);
    return {
      ok: true, status: 200, statusText: 'OK',
      text: async () => JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ actions: [], finalAnswer: 'OpenAI response' }) } }]
      })
    } as any;
  };

  const provider = new OpenAIProvider({});
  const result = await provider.run({ scenario: STUB_SCENARIO, sandboxDir: 'tmp' });

  expect(capturedUrl).toBe('https://api.openai.com/v1/chat/completions');
  expect(capturedHeaders['Authorization']).toBe('Bearer test-openai-key');
  expect(capturedBody.response_format).toEqual({ type: 'json_object' });
  expect(capturedBody.model).toBe('gpt-4o-mini');
  expect(result.success).toBe(true);
  expect(result.finalAnswer).toBe('OpenAI response');

  global.fetch = originalFetch;
});

test('OpenAIProvider respects model override', async () => {
  (getEnv as any).mockImplementation((name: string) =>
    name === 'OPENAI_API_KEY' ? 'test-key' : undefined
  );

  const originalFetch = global.fetch;
  let capturedBody: any = null;

  global.fetch = async (_url: any, options: any) => {
    capturedBody = JSON.parse(options.body as string);
    return {
      ok: true, status: 200, statusText: 'OK',
      text: async () => JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ actions: [], finalAnswer: 'ok' }) } }]
      })
    } as any;
  };

  const provider = new OpenAIProvider({ model: 'gpt-4o' });
  await provider.run({ scenario: STUB_SCENARIO, sandboxDir: 'tmp' });

  expect(capturedBody.model).toBe('gpt-4o');

  global.fetch = originalFetch;
});

// ── OllamaProvider ────────────────────────────────────────────────────────────

// Helper: mock fetch that routes /api/tags (health) and /api/chat (inference)
function makeOllamaFetchMock(opts: { captureUrl?: { value: string }; captureBody?: { value: any }; baseUrl?: string } = {}) {
  return async (url: any, options: any) => {
    const urlStr = url.toString();
    if (urlStr.endsWith('/api/tags')) {
      // health check — always return up with models
      return {
        ok: true, status: 200, statusText: 'OK',
        json: async () => ({ models: [{ name: 'llama3.2' }, { name: 'mistral' }] }),
      } as any;
    }
    // /api/chat
    if (opts.captureUrl) opts.captureUrl.value = urlStr;
    if (opts.captureBody && options?.body) opts.captureBody.value = JSON.parse(options.body as string);
    return {
      ok: true, status: 200, statusText: 'OK',
      text: async () => JSON.stringify({
        message: { content: JSON.stringify({ actions: [], finalAnswer: 'Ollama response' }) }
      }),
    } as any;
  };
}

test('OllamaProvider uses localhost:11434 by default', async () => {
  (getEnv as any).mockReturnValue(undefined);

  const originalFetch = global.fetch;
  const capturedUrl = { value: '' };
  global.fetch = makeOllamaFetchMock({ captureUrl: capturedUrl }) as any;

  const provider = new OllamaProvider({ model: 'llama3.2' });
  const result = await provider.run({ scenario: STUB_SCENARIO, sandboxDir: 'tmp' });

  expect(capturedUrl.value).toBe('http://localhost:11434/api/chat');
  expect(result.success).toBe(true);
  expect(result.finalAnswer).toBe('Ollama response');

  global.fetch = originalFetch;
});

test('OllamaProvider respects OLLAMA_BASE_URL env override', async () => {
  (getEnv as any).mockImplementation((name: string) =>
    name === 'OLLAMA_BASE_URL' ? 'http://my-ollama:8080' : undefined
  );

  const originalFetch = global.fetch;
  const capturedUrl = { value: '' };
  global.fetch = makeOllamaFetchMock({ captureUrl: capturedUrl }) as any;

  const provider = new OllamaProvider({ model: 'mistral' });
  await provider.run({ scenario: STUB_SCENARIO, sandboxDir: 'tmp' });

  expect(capturedUrl.value).toBe('http://my-ollama:8080/api/chat');

  global.fetch = originalFetch;
});

test('OllamaProvider sends format:json and stream:false', async () => {
  (getEnv as any).mockReturnValue(undefined);

  const originalFetch = global.fetch;
  const capturedBody = { value: null as any };
  global.fetch = makeOllamaFetchMock({ captureBody: capturedBody }) as any;

  const provider = new OllamaProvider({ model: 'llama3.2' });
  await provider.run({ scenario: STUB_SCENARIO, sandboxDir: 'tmp' });

  expect(capturedBody.value.format).toBe('json');
  expect(capturedBody.value.stream).toBe(false);

  global.fetch = originalFetch;
});

test('OllamaProvider handles connection error gracefully', async () => {
  (getEnv as any).mockReturnValue(undefined);

  const originalFetch = global.fetch;

  global.fetch = async () => {
    throw new Error('ECONNREFUSED');
  };

  const provider = new OllamaProvider({ model: 'llama3.2' });
  const result = await provider.run({ scenario: STUB_SCENARIO, sandboxDir: 'tmp' });

  expect(result.success).toBe(false);
  // Either "not reachable" (health check failed) or the raw ECONNREFUSED error
  expect(result.rawOutput.toLowerCase()).toMatch(/not reachable|econnrefused/i);

  global.fetch = originalFetch;
});
