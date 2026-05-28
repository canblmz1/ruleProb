import { test, expect, vi } from 'vitest';

vi.mock('../src/config/load.js', () => ({ loadConfig: vi.fn(async () => ({})) }));
vi.mock('../src/instructions/discover.js', () => ({ discoverInstructions: vi.fn(async () => []) }));
vi.mock('../src/extractors/merge.js', () => ({ routeExtraction: vi.fn(async () => []) }));
vi.mock('../src/advisor/repoScan.js', () => ({
  scanRepo: vi.fn(async () => ({
    packageManager: 'pnpm',
    testRunner: 'vitest',
    linters: [],
    frequentDirs: [],
    hasLockfile: true,
  })),
}));
vi.mock('../src/advisor/suggest.js', () => ({ suggestRules: vi.fn(() => []) }));
vi.mock('ink', () => ({
  render: vi.fn(),
  useInput: vi.fn(),
  useApp: vi.fn(() => ({ exit: vi.fn() })),
  Box: vi.fn(),
  Text: vi.fn(),
}));
vi.mock('react', () => ({
  default: { createElement: vi.fn(() => null) },
  createElement: vi.fn(() => null),
  useState: vi.fn(() => [1, vi.fn()]),
}));

test('gui command is registered', async () => {
  const { Command } = await import('commander');
  const { register } = await import('../src/cli/commands/gui.js');
  const program = new Command();
  program.exitOverride();
  register(program);
  const guiCmd = program.commands.find((c: any) => c.name() === 'gui');
  expect(guiCmd).toBeDefined();
  expect(guiCmd!.description()).toContain('TUI');
});

test('App component file exists and exports App', async () => {
  // Verify the module exists and exports something named App
  // We do not render it to avoid Ink TTY requirements in CI
  const mod = await import('../src/tui/App.js');
  expect(typeof mod.App).toBe('function');
});
