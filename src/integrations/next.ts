/**
 * Creates Next.js API route handlers for RuleProbe.
 * Usage in pages/api/ruleprobe/run.ts:
 *   import { createNextHandlers } from 'ruleprobe-ai/integrations/next';
 *   export default createNextHandlers({ provider: 'mock' }).run;
 *
 * Next.js is NOT a dependency of RuleProbe.
 * req and res are typed as `any` to avoid requiring Next.js types.
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

export interface NextHandlerConfig {
  dir?: string;
  provider?: string;
}

export function createNextHandlers(config: NextHandlerConfig = {}) {
  async function run(req: any, res: any): Promise<void> {
    try {
      const dir = (req.body?.dir as string) || config.dir || process.cwd();
      const providerName = (req.body?.provider as string) || config.provider || 'mock';

      const appConfig = await loadConfig();
      const files = await discoverInstructions({
        ...appConfig,
        instructionFiles: [dir + '/CLAUDE.md', dir + '/AGENTS.md'],
      });
      const rules = await routeExtraction(files, appConfig);
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

      res.status(200).json({ ok: true, results, count: results.length });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  }

  async function rules(req: any, res: any): Promise<void> {
    try {
      const dir = (req.query?.dir as string) || config.dir || process.cwd();
      const appConfig = await loadConfig();
      const files = await discoverInstructions({
        ...appConfig,
        instructionFiles: [dir + '/CLAUDE.md', dir + '/AGENTS.md'],
      });
      const extractedRules = await routeExtraction(files, appConfig);
      res.status(200).json({ ok: true, rules: extractedRules, count: extractedRules.length });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  }

  return { run, rules };
}
