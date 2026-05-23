import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig } from '../../config/load.js';
import { discoverInstructions } from '../../instructions/discover.js';
import { analyzeTokens, formatTokenReport } from '../../tokens/analyze.js';

export function register(program: Command): void {
  program
    .command('analyze-tokens [dir]')
    .description('Estimate token cost of your instruction files and identify expensive rules')
    .option('--config <file>', 'Config file path')
    .action(async (dir: string | undefined, options) => {
      if (dir) process.chdir(dir);
      const config = await loadConfig(options.config);
      const files = await discoverInstructions(config);
      if (files.length === 0) {
        console.log(chalk.yellow('No instruction files found.'));
        return;
      }
      const { extractRules } = await import('../../rules/extract.js');
      const rules = extractRules(files);
      // Use provider-specific chars-per-token ratio for more accurate estimates.
      // Claude's tokenizer is slightly more efficient (~3.5 chars/token) vs GPT (~4).
      const PROVIDER_CHARS_PER_TOKEN: Record<string, number> = { 'claude-code': 3.5 };
      const charsPerToken = PROVIDER_CHARS_PER_TOKEN[config.provider] ?? 4;
      const report = analyzeTokens(files, rules, charsPerToken);
      const output = formatTokenReport(report);
      const hasWarnings = report.warnings.length > 0;
      console.log(hasWarnings ? chalk.yellow(output) : chalk.green(output));
    });
}
