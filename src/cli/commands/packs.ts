import { Command } from 'commander';
import chalk from 'chalk';
import { listPacks, searchPacks } from '../../packs/registry.js';

export function register(program: Command): void {
  program
    .command('packs')
    .description('List available built-in rule packs')
    .option('--search <tag>', 'Filter packs by tag or keyword')
    .action((options) => {
      const packs = options.search ? searchPacks(options.search) : listPacks();
      if (packs.length === 0) {
        console.log(chalk.yellow(`No packs found matching "${options.search}".`));
        return;
      }
      const header = options.search ? `\nPacks matching "${options.search}":\n` : '\nAvailable rule packs:\n';
      console.log(chalk.bold(header));
      for (const pack of packs) {
        console.log(`  ${chalk.cyan(pack.name.padEnd(20))} ${pack.description}`);
        console.log(`  ${chalk.gray('tags: ' + pack.tags.join(', '))}\n`);
      }
      console.log(`Run ${chalk.cyan('ruleprobe add <pack-name>')} to add rules to your CLAUDE.md`);
      console.log(`Run ${chalk.cyan('ruleprobe add-url <https://...>')} to load a community pack from a URL`);
    });
}
