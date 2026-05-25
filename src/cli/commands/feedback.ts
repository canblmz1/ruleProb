import { Command } from 'commander';
import chalk from 'chalk';

export function register(program: Command): void {
  program
    .command('feedback')
    .description('Get help, report a bug, or contribute to RuleProbe')
    .action(() => {
      console.log(chalk.bold('\n  RuleProbe — Community & Feedback\n'));
      console.log(`  ${chalk.cyan('Bug reports & feature requests')}`)
      console.log(`    https://github.com/canblmz1/ruleProb/issues\n`);
      console.log(`  ${chalk.cyan('Contributing (first PR welcome!)')}`);
      console.log(`    Read CONTRIBUTING.md in any checkout, or:`);
      console.log(`    https://github.com/canblmz1/ruleProb/blob/main/CONTRIBUTING.md\n`);
      console.log(`  ${chalk.cyan('Show your support')}`);
      console.log(`    ⭐  Star on GitHub: https://github.com/canblmz1/ruleProb\n`);
      console.log(`  ${chalk.dim('To share a quick note, open an issue with the label "feedback".')}`);
      console.log();
    });
}
