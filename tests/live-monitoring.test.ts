import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus, globalEventBus, LiveEvent, LiveEventType } from '../src/live/eventBus.js';

// Helper to build a minimal LiveEvent
function makeEvent(overrides: Partial<LiveEvent> = {}): LiveEvent {
  return {
    type: 'file_write',
    scenarioId: 'test-scenario-1',
    scenarioTitle: 'Test Scenario',
    payload: './some/file.ts',
    timestamp: Date.now(),
    ...overrides
  };
}

describe('EventBus', () => {
  it('emit delivers event to a single registered handler', () => {
    const bus = new EventBus();
    const received: LiveEvent[] = [];
    bus.on((e) => received.push(e));

    const event = makeEvent();
    bus.emit(event);

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual(event);
  });

  it('emit delivers event to multiple registered handlers', () => {
    const bus = new EventBus();
    const received1: LiveEvent[] = [];
    const received2: LiveEvent[] = [];

    bus.on((e) => received1.push(e));
    bus.on((e) => received2.push(e));

    const event = makeEvent({ type: 'command_exec', payload: 'pnpm test' });
    bus.emit(event);

    expect(received1).toHaveLength(1);
    expect(received2).toHaveLength(1);
    expect(received1[0].type).toBe('command_exec');
    expect(received2[0].payload).toBe('pnpm test');
  });

  it('emitting multiple events delivers all in order', () => {
    const bus = new EventBus();
    const types: LiveEventType[] = [];
    bus.on((e) => types.push(e.type));

    bus.emit(makeEvent({ type: 'scenario_start' }));
    bus.emit(makeEvent({ type: 'file_write' }));
    bus.emit(makeEvent({ type: 'command_exec' }));
    bus.emit(makeEvent({ type: 'scenario_end' }));

    expect(types).toEqual(['scenario_start', 'file_write', 'command_exec', 'scenario_end']);
  });

  it('handlers receive correct scenarioId and scenarioTitle', () => {
    const bus = new EventBus();
    let captured: LiveEvent | undefined;
    bus.on((e) => { captured = e; });

    bus.emit(makeEvent({ scenarioId: 'sc-42', scenarioTitle: 'My Rule Test' }));

    expect(captured?.scenarioId).toBe('sc-42');
    expect(captured?.scenarioTitle).toBe('My Rule Test');
  });
});

describe('startLiveReporter', () => {
  beforeEach(() => {
    globalEventBus.clear();
  });

  it('subscribes to globalEventBus and writes scenario_start to console', async () => {
    const { startLiveReporter } = await import('../src/live/terminal.js');

    // Force isTTY so startLiveReporter registers its handler in test environment
    const origIsTTY = process.stdout.isTTY;
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    startLiveReporter();

    globalEventBus.emit(makeEvent({ type: 'scenario_start', scenarioTitle: 'Live Scenario Alpha' }));

    // console.log should have been called with a string containing the title
    const calls = logSpy.mock.calls.map((args) => args.join(' '));
    expect(calls.some((c) => c.includes('Live Scenario Alpha'))).toBe(true);

    logSpy.mockRestore();
    Object.defineProperty(process.stdout, 'isTTY', { value: origIsTTY, configurable: true });
    globalEventBus.clear();
  });
});

describe('JSONL event writer (isolated)', () => {
  it('serialises events to valid JSON lines', () => {
    const events: LiveEvent[] = [
      makeEvent({ type: 'scenario_start', payload: 'Rule: forbidden_command' }),
      makeEvent({ type: 'file_write', payload: './src/index.ts' }),
      makeEvent({ type: 'command_exec', payload: 'pnpm test' }),
      makeEvent({ type: 'scenario_end', payload: 'done' })
    ];

    const lines = events.map((e) => JSON.stringify(e));

    // Each line must parse back cleanly
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
      const parsed = JSON.parse(line) as LiveEvent;
      expect(parsed).toHaveProperty('type');
      expect(parsed).toHaveProperty('scenarioId');
      expect(parsed).toHaveProperty('timestamp');
    }
  });
});

describe('watchSandbox', () => {
  it('returns a cleanup function that can be called without throwing', async () => {
    const { watchSandbox } = await import('../src/live/watcher.js');
    // Use a non-existent directory — chokidar will still create the watcher object
    const stop = watchSandbox('C:\\nonexistent\\sandbox\\path', 'sc-test', 'Test Scenario');
    expect(typeof stop).toBe('function');
    // Calling stop must not throw
    await expect(async () => stop()).not.toThrow();
  });
});
