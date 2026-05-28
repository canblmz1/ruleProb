/**
 * Creates Next.js API route handlers for RuleProbe.
 * Usage in pages/api/ruleprobe/run.ts:
 *   import { createNextHandlers } from 'ruleprobe-ai/integrations/next';
 *   export default createNextHandlers({ provider: 'mock' }).run;
 *
 * Next.js is NOT a dependency of RuleProbe.
 * req and res are typed as `any` to avoid requiring Next.js types.
 */

import { runComplianceCore, extractRulesCore } from './_core.js';

export interface NextHandlerConfig {
  dir?: string;
  provider?: string;
}

export function createNextHandlers(config: NextHandlerConfig = {}) {
  async function run(req: any, res: any): Promise<void> {
    try {
      const dir = (req.body?.dir as string) || config.dir || process.cwd();
      const providerName = (req.body?.provider as string) || config.provider || 'mock';
      const results = await runComplianceCore(dir, providerName);
      res.status(200).json({ ok: true, results, count: results.length });
    } catch (err: unknown) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  async function rules(req: any, res: any): Promise<void> {
    try {
      const dir = (req.query?.dir as string) || config.dir || process.cwd();
      const extractedRules = await extractRulesCore(dir);
      res.status(200).json({ ok: true, rules: extractedRules, count: extractedRules.length });
    } catch (err: unknown) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { run, rules };
}
