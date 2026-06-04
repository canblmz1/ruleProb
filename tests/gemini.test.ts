import { test, expect, vi } from 'vitest';
import { GeminiProvider } from '../src/providers/gemini.js';
import { getEnv } from '../src/config/env.js';
import { getChangedFiles } from '../src/sandbox/create.js';
import { executeActionPlan } from '../src/actions/execute.js';

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

test('GeminiProvider handles missing API key cleanly', async () => {
  (getEnv as any).mockReturnValue(undefined);
  
  const provider = new GeminiProvider({});
  const result = await provider.run({ 
    scenario: { id: "1", title: "test", ruleId: "1", prompt: "Hello", sandboxFiles: {}, expectedAssertions: [] }, 
    sandboxDir: "tmp" 
  });
  
  expect(result.success).toBe(false);
  expect(result.rawOutput).toContain("requires GEMINI_API_KEY");
});

test('GeminiProvider uses default model and fetch is mockable', async () => {
  (getEnv as any).mockImplementation((name: string) => {
    if (name === 'GEMINI_API_KEY') return 'test-gemini-key';
    return undefined;
  });

  const originalFetch = global.fetch;
  
  let fetchCalledWithModel = "";
  let fetchBody: any = null;
  
  global.fetch = async (url: any, options: any) => {
    const urlString = url.toString();
    const match = urlString.match(/\/models\/(.+):generateContent/);
    if (match) fetchCalledWithModel = match[1];
    
    fetchBody = JSON.parse(options.body as string);
    
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      text: async () => JSON.stringify({ 
        candidates: [{ 
          content: { 
            parts: [{ 
              text: JSON.stringify({ actions: [], finalAnswer: "Gemini response" }) 
            }] 
          } 
        }] 
      })
    } as any;
  };
  
  const provider = new GeminiProvider({});
  const result = await provider.run({ 
    scenario: { id: "1", title: "test", ruleId: "1", prompt: "Hello", sandboxFiles: {}, expectedAssertions: [] }, 
    sandboxDir: "tmp" 
  });
  
  if (!result.success) console.error('GEMINI TEST FAIL RAW OUTPUT:', result.rawOutput);
  expect(result.success).toBe(true);
  expect(result.finalAnswer).toBe("Gemini response");
  expect(fetchCalledWithModel).toBe("gemini-2.5-flash");
  expect(fetchBody.generationConfig.responseMimeType).toBe("application/json");
  expect(executeActionPlan).toHaveBeenCalledWith("tmp", { actions: [], finalAnswer: "Gemini response" }, { captureMode: undefined });
  
  global.fetch = originalFetch;
});

test('GeminiProvider handles model override', async () => {
    (getEnv as any).mockImplementation((name: string) => {
        if (name === 'GEMINI_API_KEY') return 'test-gemini-key';
        return undefined;
    });

    const originalFetch = global.fetch;
    let fetchCalledWithModel = "";

    global.fetch = async (url: any, options: any) => {
        const urlString = url.toString();
        const match = urlString.match(/\/models\/(.+):generateContent/);
        if (match) fetchCalledWithModel = match[1];

        return {
            ok: true,
            status: 200,
            statusText: "OK",
            text: async () => JSON.stringify({
                candidates: [{ content: { parts: [{ text: JSON.stringify({ actions: [], finalAnswer: "OK" }) }] } }]
            })
        } as any;
    };

    const provider = new GeminiProvider({ model: 'gemini-pro-vision' });
    await provider.run({
        scenario: { id: "1", title: "test", ruleId: "1", prompt: "Hello", sandboxFiles: {}, expectedAssertions: [] },
        sandboxDir: "tmp"
    });

    expect(fetchCalledWithModel).toBe("gemini-pro-vision");
    global.fetch = originalFetch;
});

test('GeminiProvider does not expose API key in URL query parameter', async () => {
  (getEnv as any).mockImplementation((name: string) => {
    if (name === 'GEMINI_API_KEY') return 'test-gemini-key';
    return undefined;
  });

  const originalFetch = global.fetch;
  let capturedUrl = '';

  global.fetch = async (url: any, options: any) => {
    capturedUrl = url.toString();

    return {
      ok: true,
      status: 200,
      statusText: "OK",
      text: async () => JSON.stringify({
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({ actions: [], finalAnswer: "OK" })
            }]
          }
        }]
      })
    } as any;
  };

  const provider = new GeminiProvider({});
  await provider.run({
    scenario: { id: "1", title: "test", ruleId: "1", prompt: "Hello", sandboxFiles: {}, expectedAssertions: [] },
    sandboxDir: "tmp"
  });

  expect(capturedUrl.includes('test-gemini-key')).toBe(false);
  expect(capturedUrl.includes('?key=')).toBe(false);

  global.fetch = originalFetch;
});

test('GeminiProvider sets API key in x-goog-api-key header', async () => {
  (getEnv as any).mockImplementation((name: string) => {
    if (name === 'GEMINI_API_KEY') return 'test-gemini-key';
    return undefined;
  });

  const originalFetch = global.fetch;
  let capturedHeaders: any = null;

  global.fetch = async (url: any, options: any) => {
    capturedHeaders = options.headers;

    return {
      ok: true,
      status: 200,
      statusText: "OK",
      text: async () => JSON.stringify({
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({ actions: [], finalAnswer: "OK" })
            }]
          }
        }]
      })
    } as any;
  };

  const provider = new GeminiProvider({});
  await provider.run({
    scenario: { id: "1", title: "test", ruleId: "1", prompt: "Hello", sandboxFiles: {}, expectedAssertions: [] },
    sandboxDir: "tmp"
  });

  expect(capturedHeaders['x-goog-api-key']).toBe('test-gemini-key');

  global.fetch = originalFetch;
});

test('GeminiProvider uses real newlines (not literal \\n) in prompt separator', async () => {
  (getEnv as any).mockImplementation((name: string) => {
    if (name === 'GEMINI_API_KEY') return 'test-gemini-key';
    return undefined;
  });

  const originalFetch = global.fetch;
  let capturedFetchBody: any = null;

  global.fetch = async (url: any, options: any) => {
    capturedFetchBody = JSON.parse(options.body as string);

    return {
      ok: true,
      status: 200,
      statusText: "OK",
      text: async () => JSON.stringify({
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({ actions: [], finalAnswer: "Gemini response" })
            }]
          }
        }]
      })
    } as any;
  };

  const provider = new GeminiProvider({});
  await provider.run({
    scenario: { id: "1", title: "test", ruleId: "1", prompt: "Test Prompt", sandboxFiles: {}, expectedAssertions: [] },
    sandboxDir: "tmp"
  });

  const promptText = capturedFetchBody.contents[0].parts[0].text;

  // Assert that the prompt contains actual newlines, not literal "\n" sequences
  expect(promptText).toContain('\n\nPROMPT:\n');
  expect(promptText).not.toContain('\\n\\nPROMPT:\\n');
  expect(promptText).toContain('Test Prompt');

  global.fetch = originalFetch;
});
