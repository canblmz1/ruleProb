/**
 * Creates Express route handlers with RuleProbe endpoints.
 * Usage:
 *   import { createExpressHandlers } from 'ruleprobe-ai/integrations/express';
 *   const handlers = createExpressHandlers({ dir: '/my/repo', provider: 'mock' });
 *   app.get('/ruleprobe/rules', handlers.handleRules);
 *   app.post('/ruleprobe/run', handlers.handleRun);
 *
 * Express is NOT a dependency of RuleProbe — it is a peer dependency here.
 * req and res are typed as `any` to avoid requiring @types/express.
 */

import { runComplianceCore, extractRulesCore } from './_core.js';

export interface RuleProbeRouterConfig {
  dir?: string;
  provider?: string;
}

export function createExpressHandlers(routerConfig: RuleProbeRouterConfig = {}) {
  async function handleRun(req: any, res: any): Promise<void> {
    try {
      const dir = (req.body?.dir as string) || routerConfig.dir || process.cwd();
      const providerName = (req.body?.provider as string) || routerConfig.provider || 'mock';
      const results = await runComplianceCore(dir, providerName);
      res.json({ ok: true, results, count: results.length });
    } catch (err: unknown) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  async function handleRules(req: any, res: any): Promise<void> {
    try {
      const dir = (req.query?.dir as string) || routerConfig.dir || process.cwd();
      const rules = await extractRulesCore(dir);
      res.json({ ok: true, rules, count: rules.length });
    } catch (err: unknown) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { handleRun, handleRules };
}
