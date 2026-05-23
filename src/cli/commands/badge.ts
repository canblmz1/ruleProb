import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import { Config } from '../../types/index.js';
import { writeBadgeFiles, writeShieldsEndpoint } from '../../badge/generate.js';

export function register(program: Command): void {
  program
    .command('badge')
    .description('Generate score and trend SVG badges')
    .option('--score <number>', 'Score value to render', '0')
    .option('--weighted-score <number>', 'Weighted score value', '0')
    .option('--report-dir <dir>', 'Output directory', '.ruleprobe')
    .option('--label <text>', 'Badge label', 'ruleprobe')
    .action(async (options) => {
      const score = parseInt(options.score, 10) || 0;
      const weightedScore = parseInt(options.weightedScore, 10) || 0;
      const config: Config = {
        provider: 'mock',
        instructionFiles: [],
        reportDir: options.reportDir,
        failBelow: 70,
        keepSandbox: false
      };
      const { scorePath } = await writeBadgeFiles(score, weightedScore, undefined, config);
      await writeShieldsEndpoint(score, config);
      console.log(chalk.green(`Badge written: ${scorePath}`));
      console.log(chalk.gray(`Shields.io endpoint: ${path.join(config.reportDir, 'badge.json')} — use https://img.shields.io/endpoint?url=<raw-url-to-badge.json>`));
    });
}
