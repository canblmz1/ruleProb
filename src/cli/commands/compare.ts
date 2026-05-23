import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import { loadConfig } from '../../config/load.js';
import { compareDeterministicToHybrid, formatRuleComparison } from '../../compare/extraction.js';
import { compareWithBaseRef, formatBaseRefComparison } from '../../compare/baseRef.js';
import { loadInstructionFilesForReadOnlyCommand } from './_shared.js';

export function register(program: Command): void {
  program
    .command('compare')
    .argument('[dir]', 'Directory to scan')
    .description('Compare deterministic vs hybrid extraction, or branch vs base ref')
    .option('--provider <provider>', 'Provider for hybrid ai-assisted candidates')
    .option('--model <model>', 'Model to use for providers that support it')
    .option('--extractor <type>', 'Extractor mode for base-ref comparison (used only with --base)')
    .option('--base <ref>', 'Compare current extraction with the same files at <ref> (e.g. main, origin/main, HEAD~1)')
    .option('--debug-extractor', 'Print debug stats for extraction mode')
    .option('--no-cache', 'Disable AI extraction cache')
    .action(async (dir, options) => {
      const config = await loadConfig();
      if (options.provider) config.provider = options.provider;
      if (options.model) config.model = options.model;
      if (options.extractor) config.extractor = options.extractor;
      if (options.debugExtractor) config.debugExtractor = true;
      if (options.cache === false) config.useExtractionCache = false;

      const cwd = dir ? path.resolve(dir) : process.cwd();
      const files = await loadInstructionFilesForReadOnlyCommand(dir, config);
      if (files.length === 0) {
        console.log(chalk.yellow('No instruction files found to compare.'));
        return;
      }

      if (options.base) {
        const result = await compareWithBaseRef(files, config, options.base, cwd);
        console.log(formatBaseRefComparison(result));
        return;
      }

      const comparison = await compareDeterministicToHybrid(files, config);
      console.log(formatRuleComparison(comparison));
    });
}
