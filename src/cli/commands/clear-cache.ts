import { Command } from 'commander';
import chalk from 'chalk';
import { clearExtractionCache } from '../../extractors/cache.js';

export function register(program: Command): void {
  program
    .command('clear-cache')
    .description('Remove cached AI extraction results from .ruleprobe/cache/')
    .action(async () => {
      const { removed, cacheDir } = await clearExtractionCache();
      console.log(chalk.green(`Cleared ${removed} cached extraction file(s) from ${cacheDir}`));
    });
}
