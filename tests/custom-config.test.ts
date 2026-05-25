import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

let tmpDir: string;
let origCwd: string;

beforeEach(async () => {
  origCwd = process.cwd();
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ruleprobe-cfg-'));
  process.chdir(tmpDir);
});

afterEach(async () => {
  process.chdir(origCwd);
  await fs.remove(tmpDir);
});

// --- loadSeverityWeights ---

describe('loadSeverityWeights', () => {
  it('returns defaults when .ruleprobe/weights.yaml is absent', async () => {
    const { loadSeverityWeights } = await import('../src/config/weights.js');
    const weights = await loadSeverityWeights();
    expect(weights).toEqual({ high: 3, medium: 2, low: 1 });
  });

  it('merges custom weights over defaults', async () => {
    await fs.ensureDir(path.join(tmpDir, '.ruleprobe'));
    await fs.writeFile(
      path.join(tmpDir, '.ruleprobe', 'weights.yaml'),
      'severity:\n  high: 5\n  medium: 2\n  low: 1\n',
      'utf-8'
    );
    const { loadSeverityWeights } = await import('../src/config/weights.js');
    const weights = await loadSeverityWeights();
    expect(weights.high).toBe(5);
    expect(weights.medium).toBe(2);
    expect(weights.low).toBe(1);
  });

  it('ignores invalid (non-positive) values and uses defaults for those keys', async () => {
    await fs.ensureDir(path.join(tmpDir, '.ruleprobe'));
    await fs.writeFile(
      path.join(tmpDir, '.ruleprobe', 'weights.yaml'),
      'severity:\n  high: -1\n  medium: 3\n  low: "bad"\n',
      'utf-8'
    );
    const { loadSeverityWeights } = await import('../src/config/weights.js');
    const weights = await loadSeverityWeights();
    // invalid keys fall back to default
    expect(weights.high).toBe(3);   // default, because -1 is not positive
    expect(weights.medium).toBe(3); // overridden by valid value
    expect(weights.low).toBe(1);    // default, because "bad" is not a number
  });
});

// --- loadCustomScenarios ---

describe('loadCustomScenarios', () => {
  it('returns [] when .ruleprobe/scenarios.yaml is absent', async () => {
    const { loadCustomScenarios } = await import('../src/config/customScenarios.js');
    const scenarios = await loadCustomScenarios();
    expect(scenarios).toEqual([]);
  });

  it('parses valid scenarios correctly', async () => {
    await fs.ensureDir(path.join(tmpDir, '.ruleprobe'));
    await fs.writeFile(
      path.join(tmpDir, '.ruleprobe', 'scenarios.yaml'),
      [
        'scenarios:',
        '  - id: my-custom-scenario',
        '    ruleId: custom-rule-1',
        '    title: My custom test',
        '    prompt: "Do the task following the repo instructions."',
        '    expectedAssertions:',
        '      - type: required_command',
        '        commandIncludes: pnpm test',
        '    sandboxFiles:',
        '      src/index.ts: "// sandbox\\n"',
      ].join('\n'),
      'utf-8'
    );
    const { loadCustomScenarios } = await import('../src/config/customScenarios.js');
    const scenarios = await loadCustomScenarios();
    expect(scenarios).toHaveLength(1);
    expect(scenarios[0].id).toBe('my-custom-scenario');
    expect(scenarios[0].ruleId).toBe('custom-rule-1');
    expect(scenarios[0].title).toBe('My custom test');
    expect(scenarios[0].prompt).toBe('Do the task following the repo instructions.');
    expect(scenarios[0].expectedAssertions).toHaveLength(1);
    expect(scenarios[0].sandboxFiles['src/index.ts']).toBe('// sandbox\n');
  });

  it('skips scenarios missing required fields and keeps valid ones', async () => {
    await fs.ensureDir(path.join(tmpDir, '.ruleprobe'));
    await fs.writeFile(
      path.join(tmpDir, '.ruleprobe', 'scenarios.yaml'),
      [
        'scenarios:',
        '  - id: valid-scenario',
        '    ruleId: rule-1',
        '    title: Valid',
        '    prompt: Do it.',
        '    expectedAssertions: []',
        '  - ruleId: rule-2',
        '    title: Missing id',
        '    prompt: Do it.',
        '    expectedAssertions: []',
        '  - id: missing-assertions',
        '    ruleId: rule-3',
        '    title: No assertions',
        '    prompt: Do it.',
      ].join('\n'),
      'utf-8'
    );
    const { loadCustomScenarios } = await import('../src/config/customScenarios.js');
    const scenarios = await loadCustomScenarios();
    expect(scenarios).toHaveLength(1);
    expect(scenarios[0].id).toBe('valid-scenario');
  });
});
