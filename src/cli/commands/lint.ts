import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig } from '../../config/load.js';
import { discoverInstructions } from '../../instructions/discover.js';
import { lintRules, formatLintOutput } from '../../lint/analyze.js';

export function register(program: Command): void {
  program
    .command('lint [dir]')
    .description('Check rule quality: detect vague, duplicate, or untestable rules')
    .option('--config <file>', 'Config file path')
    .option('--extractor <name>', 'Extractor: deterministic (default), hybrid, ai-assisted')
    .option('--strict', 'Exit with code 1 if any warnings are found (default: only errors)')
    .action(async (dir: string | undefined, options) => {
      if (dir) process.chdir(dir);
      const config = await loadConfig(options.config);
      if (options.extractor) config.extractor = options.extractor;

      const files = await discoverInstructions(config);
      if (files.length === 0) {
        console.log(chalk.yellow('No instruction files found. Run `ruleprobe init` to get started.'));
        return;
      }

      const { extractRules } = await import('../../rules/extract.js');
      const rules = extractRules(files);

      const issues = lintRules(rules);
      const output = formatLintOutput(issues, rules.length);

      const hasErrors = issues.some(i => i.severity === 'error');
      const hasWarnings = issues.some(i => i.severity === 'warn');

      if (hasErrors) {
        console.error(chalk.red(output));
        process.exit(1);
      } else if (hasWarnings && options.strict) {
        console.error(chalk.yellow(output));
        process.exit(1);
      } else if (hasWarnings) {
        console.log(chalk.yellow(output));
      } else {
        console.log(chalk.green(output));
      }
    });
}
