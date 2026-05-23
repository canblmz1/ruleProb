import { Command } from 'commander';
import chalk from 'chalk';
import { runBenchmark } from '../../benchmark/run.js';

export function register(program: Command): void {
  program
    .command('benchmark')
    .description('Run benchmark corpus limits')
    .option('--fixtures-only', 'Only run against local fixtures')
    .option('--clone', 'Clone real repositories (requires network)')
    .option('--provider <provider>', 'Provider to use for runtime validation')
    .action(async (options) => {
      try {
        await runBenchmark(options);
      } catch (error) {
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });
}
