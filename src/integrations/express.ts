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

import { loadConfig } from '../config/load.js';
import { discoverInstructions } from '../instructions/discover.js';
import { routeExtraction } from '../extractors/merge.js';
import { generateScenarios } from '../scenarios/generate.js';
import { MockProvider } from '../providers/mock.js';
import { DryRunProvider } from '../providers/dryRun.js';
import { normalizeProviderResult } from '../providers/normalize.js';
import { evaluateResult } from '../evaluator/score.js';
import { createSandbox, cleanupSandbox } from '../sandbox/create.js';

export interface RuleProbeRouterConfig {
  dir?: string;
  provider?: string;
}

export function createExpressHandlers(routerConfig: RuleProbeRouterConfig = {}) {
  async function handleRun(req: any, res: any): Promise<void> {
    try {
      const dir = (req.body?.dir as string) || routerConfig.dir || process.cwd();
      const providerName = (req.body?.provider as string) || routerConfig.provider || 'mock';

      const config = await loadConfig();
      const files = await discoverInstructions({
        ...config,
        instructionFiles: [dir + '/CLAUDE.md', dir + '/AGENTS.md'],
      });
      const rules = await routeExtraction(files, config);
      const scenarios = generateScenarios(rules);

      const provider = providerName === 'dry-run' ? new DryRunProvider() : new MockProvider();

      const results = [];
      for (const scenario of scenarios.slice(0, 10)) {
        const sandboxDir = await createSandbox(scenario);
        const rawResult = await provider.run({ scenario, sandboxDir });
        const providerResult = normalizeProviderResult(rawResult);
        const evalResult = await evaluateResult(scenario, providerResult);
        results.push(evalResult);
        await cleanupSandbox(sandboxDir);
      }

      res.json({ ok: true, results, count: results.length });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  }

  async function handleRules(req: any, res: any): Promise<void> {
    try {
      const dir = (req.query?.dir as string) || routerConfig.dir || process.cwd();
      const config = await loadConfig();
      const files = await discoverInstructions({
        ...config,
        instructionFiles: [dir + '/CLAUDE.md', dir + '/AGENTS.md'],
      });
      const rules = await routeExtraction(files, config);
      res.json({ ok: true, rules, count: rules.length });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  }

  return { handleRun, handleRules };
}
