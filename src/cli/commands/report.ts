import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';

export function register(program: Command): void {
  program
    .command('report')
    .description('Show latest report path')
    .action(async () => {
      const reportPath = path.resolve('.ruleprobe/report.md');
      if (await fs.pathExists(reportPath)) {
        console.log(chalk.green(`Report is available at: ${reportPath}`));
      } else {
        console.log(chalk.yellow(`No report found. Run ruleprobe run first.`));
      }
    });
}
