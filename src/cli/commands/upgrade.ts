import { Command } from 'commander';
import chalk from 'chalk';
import { createRequire } from 'module';

export function register(program: Command): void {
  program
    .command('upgrade')
    .description('Check for a newer version of ruleprobe-ai on npm')
    .action(async () => {
      const require = createRequire(import.meta.url);
      const { version: current } = require('../../../package.json');

      console.log(chalk.dim(`Current version: ${current}`));
      console.log(chalk.dim('Checking npm for latest version...'));

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        const res = await fetch('https://registry.npmjs.org/ruleprobe-ai/latest', {
          signal: controller.signal,
          headers: { Accept: 'application/json' }
        });
        clearTimeout(timeoutId);

        if (!res.ok) {
          console.log(chalk.yellow(`Could not reach npm registry (HTTP ${res.status}).`));
          return;
        }

        const data = await res.json() as { version: string };
        const latest = data.version;

        if (latest === current) {
          console.log(chalk.green(`\n  You're up to date! (${current})\n`));
        } else {
          console.log(chalk.yellow(`\n  Update available: ${current} → ${chalk.bold(latest)}`));
          console.log(`  Run: ${chalk.cyan('npm install -g ruleprobe-ai@latest')}\n`);
        }
      } catch (e: any) {
        if (e.name === 'AbortError') {
          console.log(chalk.yellow('npm registry check timed out.'));
        } else {
          console.log(chalk.yellow(`Could not check npm: ${e.message}`));
        }
      }
    });
}
