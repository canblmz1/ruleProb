import fs from 'fs-extra';
import chalk from 'chalk';
import { loadConfig } from '../config/load.js';
import { discoverInstructions } from '../instructions/discover.js';
import { runAIAssistedExtractionCached } from '../extractors/cache.js';

export async function runAnalyze(dir: string | undefined, options: any) {
  if (dir) process.chdir(dir);

  const config = await loadConfig(options.config);

  // Merge CLI options on top of file/default config in a documented order:
  // file < CLI flags. analyze always forces extractor = ai-assisted at the
  // end so users get extraction-only behavior even if their config says
  // hybrid.
  if (options.provider) config.provider = options.provider;
  if (options.model) config.model = options.model;
  if (options.providerTimeoutMs) config.providerTimeoutMs = parseInt(options.providerTimeoutMs, 10);
  if (options.noCache) config.useExtractionCache = false;
  if (options.debugExtractor) config.debugExtractor = true;
  // extractor flag is accepted as a hint but analyze always enforces ai-assisted below.
  config.extractor = 'ai-assisted';

  const files = await discoverInstructions(config);
  if (files.length === 0) {
    console.log(chalk.yellow('No instruction files found to analyze.'));
    return;
  }

  console.log(chalk.blue('RuleProbe Analysis Started'));
  console.log(`Found ${files.length} instruction files.`);
  console.log(`Provider: ${config.provider}  Model: ${config.model || '(default)'}  Cache: ${config.useExtractionCache === false ? 'disabled' : 'enabled'}`);

  const rules = await runAIAssistedExtractionCached(files, config);

  let md = `# RuleProbe Analysis\n\nProvider: ${config.provider}\nModel: ${config.model || '(default)'}\nCache: ${config.useExtractionCache === false ? 'disabled' : 'enabled'}\n\nInstruction files:\n${files.map(file => `- ${file.path}`).join('\n')}\n\nExtractor mode:\n- ai-assisted (analyze enforces this)\n\nRules:\n`;

  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    md += `${i + 1}. ${rule.category} - ${rule.text}\n`;
    if (rule.assertions && rule.assertions.length > 0) {
      md += `   Expected: ${JSON.stringify(rule.assertions)}\n`;
    }
  }

  md += `\nRejected candidates:\n- (Detailed logging deferred, check terminal output traces)\n`;

  await fs.ensureDir('.ruleprobe');
  await fs.writeJson('.ruleprobe/analysis.json', rules, { spaces: 2 });
  await fs.writeFile('.ruleprobe/analysis.md', md);

  console.log(chalk.green('Analysis generated in .ruleprobe/analysis.md'));
}
