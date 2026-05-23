import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import { loadConfig } from '../../config/load.js';
import { loadHistory, computeTrendSummary, clearHistory, filterHistory } from '../../history/track.js';

export function register(program: Command): void {
  program
    .command('history [subcommand]')
    .description('View or manage run history. Subcommands: clear')
    .option('--provider <name>', 'Filter history by provider (e.g. mock, gemini)')
    .option('--branch <name>', 'Filter history by git branch')
    .option('--dir <dir>', 'Project directory (default: current)', '.')
    .action(async (subcommand: string | undefined, options) => {
      const config = await loadConfig(path.resolve(options.dir));
      if (subcommand === 'clear') {
        await clearHistory(config);
        console.log(chalk.green('Run history cleared.'));
        return;
      }
      const all = await loadHistory(config);
      const filtered = filterHistory(all, { provider: options.provider, branch: options.branch });
      if (filtered.length === 0) {
        console.log(chalk.yellow('No history entries found' + (options.provider || options.branch ? ' matching those filters' : '') + '.'));
        return;
      }
      const trend = computeTrendSummary(filtered);
      console.log(chalk.bold(`\nRun History${options.provider ? ` [provider: ${options.provider}]` : ''}${options.branch ? ` [branch: ${options.branch}]` : ''}`));
      console.log(`  Runs:    ${trend.runs}`);
      console.log(`  Best:    ${trend.bestScore}/100`);
      console.log(`  Worst:   ${trend.worstScore}/100`);
      console.log(`  Average: ${trend.averageScore}/100`);
      const streakEmoji = trend.streak.type === 'up' ? '↑' : trend.streak.type === 'down' ? '↓' : '→';
      console.log(`  Streak:  ${streakEmoji} ${trend.streak.count} run(s) ${trend.streak.type}\n`);
      const last10 = filtered.slice(-10).reverse();
      for (const e of last10) {
        const dir = e.score > (filtered[filtered.indexOf(e) + 1]?.score ?? e.score) ? chalk.green('↑') :
                    e.score < (filtered[filtered.indexOf(e) + 1]?.score ?? e.score) ? chalk.red('↓') : chalk.gray('→');
        const ts = new Date(e.timestamp).toLocaleString();
        console.log(`  ${dir} ${e.score}/100  ${chalk.gray(ts)}  ${e.provider}/${e.extractor}  ${e.branch ?? ''}`);
      }
    });
}
