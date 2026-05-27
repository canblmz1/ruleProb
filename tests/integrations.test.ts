import { test, expect, vi } from 'vitest';
import { createExpressHandlers } from '../src/integrations/express.js';
import { createNextHandlers } from '../src/integrations/next.js';

// Mock all heavy dependencies so tests are fast and don't touch the filesystem
vi.mock('../src/config/load.js', () => ({
  loadConfig: vi.fn(async () => ({ extractor: 'deterministic' })),
}));

vi.mock('../src/instructions/discover.js', () => ({
  discoverInstructions: vi.fn(async () => []),
}));

vi.mock('../src/extractors/merge.js', () => ({
  routeExtraction: vi.fn(async () => [
    {
      id: 'r1',
      category: 'forbidden_command',
      text: 'NEVER run pnpm test',
      severity: 'high',
      assertions: [{ type: 'forbidden_command', commandIncludes: 'pnpm test' }],
      source: 'CLAUDE.md',
      line: 1,
    },
  ]),
}));

vi.mock('../src/scenarios/generate.js', () => ({
  generateScenarios: vi.fn(() => []),
}));

vi.mock('../src/providers/mock.js', () => ({
  MockProvider: vi.fn().mockImplementation(() => ({
    name: 'mock',
    run: vi.fn(async () => ({
      success: true,
      finalAnswer: 'ok',
      changedFiles: [],
      changedFileContents: {},
      commands: [],
      rawOutput: 'mock output',
    })),
  })),
}));

vi.mock('../src/providers/dryRun.js', () => ({
  DryRunProvider: vi.fn().mockImplementation(() => ({
    name: 'dry-run',
    run: vi.fn(async () => ({
      kind: 'dry-run',
      success: true,
      finalAnswer: 'dry run',
      changedFiles: [],
      changedFileContents: {},
      commands: [],
      rawOutput: 'dry run output',
    })),
  })),
}));

vi.mock('../src/providers/normalize.js', () => ({
  normalizeProviderResult: vi.fn((r: any) => r),
}));

vi.mock('../src/evaluator/score.js', () => ({
  evaluateResult: vi.fn(async (_s: any, _p: any) => ({ status: 'PASS', score: 1 })),
}));

vi.mock('../src/sandbox/create.js', () => ({
  createSandbox: vi.fn(async () => '/tmp/sandbox'),
  cleanupSandbox: vi.fn(async () => {}),
}));

// ── createExpressHandlers ─────────────────────────────────────────────────────

test('createExpressHandlers returns object with handleRun and handleRules functions', () => {
  const handlers = createExpressHandlers({ dir: '/test', provider: 'mock' });
  expect(typeof handlers.handleRun).toBe('function');
  expect(typeof handlers.handleRules).toBe('function');
});

test('handleRules returns JSON with ok:true and rules array', async () => {
  const handlers = createExpressHandlers({ dir: '/test', provider: 'mock' });

  const req = { query: {}, body: {} };
  let statusCode = 200;
  let responseBody: any = null;

  const res = {
    json: vi.fn((body: any) => {
      responseBody = body;
    }),
    status: vi.fn((_code: number) => {
      statusCode = _code;
      return { json: vi.fn((body: any) => { responseBody = body; }) };
    }),
  };

  await handlers.handleRules(req, res);

  expect(res.json).toHaveBeenCalled();
  expect(responseBody).toMatchObject({ ok: true });
  expect(Array.isArray(responseBody.rules)).toBe(true);
  expect(typeof responseBody.count).toBe('number');
});

test('handleRun returns JSON with ok:true and results array (no scenarios)', async () => {
  const handlers = createExpressHandlers({ dir: '/test', provider: 'mock' });

  const req = { body: { dir: '/test', provider: 'mock' } };
  let responseBody: any = null;

  const res = {
    json: vi.fn((body: any) => { responseBody = body; }),
    status: vi.fn((_code: number) => ({ json: vi.fn((body: any) => { responseBody = body; }) })),
  };

  await handlers.handleRun(req, res);

  expect(res.json).toHaveBeenCalled();
  expect(responseBody).toMatchObject({ ok: true });
  expect(Array.isArray(responseBody.results)).toBe(true);
});

test('Express handleRules returns 500 with ok:false on error', async () => {
  const { routeExtraction } = await import('../src/extractors/merge.js');
  (routeExtraction as any).mockRejectedValueOnce(new Error('extraction failure'));

  const handlers = createExpressHandlers({ dir: '/test', provider: 'mock' });

  const req = { query: {}, body: {} };
  let statusCode = 200;
  let responseBody: any = null;

  const res = {
    json: vi.fn(),
    status: vi.fn((code: number) => {
      statusCode = code;
      return {
        json: vi.fn((body: any) => { responseBody = body; }),
      };
    }),
  };

  await handlers.handleRules(req, res);

  expect(statusCode).toBe(500);
  expect(responseBody).toMatchObject({ ok: false });
  expect(typeof responseBody.error).toBe('string');
});

// ── createNextHandlers ────────────────────────────────────────────────────────

test('createNextHandlers returns object with run and rules functions', () => {
  const handlers = createNextHandlers({ dir: '/test', provider: 'mock' });
  expect(typeof handlers.run).toBe('function');
  expect(typeof handlers.rules).toBe('function');
});

// ── serve command is registered in the CLI ────────────────────────────────────

test('serve command is registered in the CLI', async () => {
  const { Command } = await import('commander');
  const { register } = await import('../src/cli/commands/serve.js');

  const program = new Command();
  program.exitOverride(); // prevent process.exit in tests
  register(program);

  const serveCmd = program.commands.find((c: any) => c.name() === 'serve');
  expect(serveCmd).toBeDefined();
  expect(serveCmd!.description()).toContain('HTTP API');
});
