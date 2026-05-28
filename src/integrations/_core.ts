import path from 'path';
import { loadConfig } from '../config/load.js';
import { discoverInstructions } from '../instructions/discover.js';
import { routeExtraction } from '../extractors/merge.js';
import { generateScenarios } from '../scenarios/generate.js';
import { MockProvider } from '../providers/mock.js';
import { DryRunProvider } from '../providers/dryRun.js';
import { normalizeProviderResult } from '../providers/normalize.js';
import { evaluateResult } from '../evaluator/score.js';
import { createSandbox, cleanupSandbox } from '../sandbox/create.js';
import type { Rule } from '../types/index.js';

export function normalizeDir(dir: string): string {
  return path.resolve(dir).split(path.sep).join('/');
}

export async function runComplianceCore(dir: string, providerName: string): Promise<object[]> {
  const normalizedDir = normalizeDir(dir);
  const config = await loadConfig();
  const files = await discoverInstructions({
    ...config,
    instructionFiles: [normalizedDir + '/CLAUDE.md', normalizedDir + '/AGENTS.md'],
  });
  const rules = await routeExtraction(files, config);
  const scenarios = generateScenarios(rules);
  const provider = providerName === 'dry-run' ? new DryRunProvider() : new MockProvider();
  const results: object[] = [];
  for (const scenario of scenarios.slice(0, 10)) {
    const sandboxDir = await createSandbox(scenario);
    const rawResult = await provider.run({ scenario, sandboxDir });
    const providerResult = normalizeProviderResult(rawResult);
    const evalResult = await evaluateResult(scenario, providerResult);
    results.push(evalResult);
    await cleanupSandbox(sandboxDir);
  }
  return results;
}

export async function extractRulesCore(dir: string): Promise<Rule[]> {
  const normalizedDir = normalizeDir(dir);
  const config = await loadConfig();
  const files = await discoverInstructions({
    ...config,
    instructionFiles: [normalizedDir + '/CLAUDE.md', normalizedDir + '/AGENTS.md'],
  });
  return routeExtraction(files, config);
}
