import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import { loadConfig } from '../../config/load.js';
import { loadHistory, computeTrendSummary, clearHistory, filterHistory } from '../../history/track.js';

const SPARK_CHARS = ' ▁▂▃▄▅▆▇█';

function sparkline(scores: number[]): string {
  if (scores.length === 0) return '';
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const range = max - min || 1;
  return scores.map(s => {
    const idx = Math.round(((s - min) / range) * (SPARK_CHARS.length - 1));
    return SPARK_CHARS[idx];
  }).join('');
}

function scoreColor(score: number): (s: string) => string {
  if (score >= 80) return chalk.green;
  if (score >= 60) return chalk.yellow;
  return chalk.red;
}

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
      const scores = filtered.map(e => e.score);
      const spark = sparkline(scores.slice(-40));
      const streakEmoji = trend.streak.type === 'up' ? chalk.green('↑') : trend.streak.type === 'down' ? chalk.red('↓') : chalk.gray('→');

      console.log(chalk.bold(`\nRun History${options.provider ? ` [provider: ${options.provider}]` : ''}${options.branch ? ` [branch: ${options.branch}]` : ''}`));
      console.log(`  Runs:    ${trend.runs}`);
      console.log(`  Best:    ${chalk.green(trend.bestScore + '/100')}  Worst: ${chalk.red(trend.worstScore + '/100')}  Avg: ${scoreColor(trend.averageScore)(trend.averageScore + '/100')}`);
      console.log(`  Streak:  ${streakEmoji} ${trend.streak.count} run(s) ${trend.streak.type}`);
      if (spark) {
        console.log(`  Trend:   ${chalk.cyan(spark)}  (last ${Math.min(scores.length, 40)} runs)`);
      }
      console.log('');

      const last10 = filtered.slice(-10).reverse();
      for (let i = 0; i < last10.length; i++) {
        const e = last10[i];
        const prevScore = last10[i + 1]?.score ?? e.score;
        const dir = e.score > prevScore ? chalk.green('↑') : e.score < prevScore ? chalk.red('↓') : chalk.gray('→');
        const ts = new Date(e.timestamp).toLocaleString();
        const scoreStr = scoreColor(e.score)(`${e.score}/100`);
        const failStr = e.failed > 0 ? chalk.red(` ${e.failed} fail`) : '';
        console.log(`  ${dir} ${scoreStr}  ${chalk.gray(ts)}  ${e.provider}/${e.extractor}${failStr}  ${chalk.dim(e.branch ?? '')}`);
      }
    });
}
