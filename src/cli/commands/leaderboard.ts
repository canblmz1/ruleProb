import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';

export function register(program: Command): void {
  program
    .command('leaderboard')
    .description('Score OSS fixture files and show extraction quality leaderboard')
    .option('--corpus <path>', 'Path to corpus JSON', 'benchmarks/corpus.json')
    .option('--output <path>', 'Write Markdown leaderboard to this file (default: docs/leaderboard.md)')
    .option('--json', 'Output raw JSON instead of Markdown')
    .action(async (options) => {
      const { generateLeaderboard, formatLeaderboardMarkdown } = await import('../../leaderboard/generate.js');
      const corpusPath = path.resolve(options.corpus);
      if (!(await fs.pathExists(corpusPath))) {
        console.error(chalk.red(`Corpus not found: ${corpusPath}`));
        process.exit(1);
      }

      console.log(chalk.gray('Generating leaderboard from corpus fixtures...'));
      const report = await generateLeaderboard(corpusPath, process.cwd());

      if (options.json) {
        console.log(JSON.stringify(report, null, 2));
        return;
      }

      const md = formatLeaderboardMarkdown(report);
      const outPath = options.output ? path.resolve(options.output) : path.resolve('docs/leaderboard.md');
      await fs.ensureDir(path.dirname(outPath));
      await fs.writeFile(outPath, md, 'utf-8');

      console.log(chalk.bold('\nOSS Leaderboard\n'));
      for (const e of report.entries) {
        const badge = e.badge === 'green' ? chalk.green('●') : e.badge === 'yellow' ? chalk.yellow('●') : chalk.red('●');
        console.log(`  ${badge} ${e.repo.padEnd(25)} ${String(e.ruleCount).padStart(3)} rules  ${String(e.extractionScore).padStart(3)}%`);
      }
      console.log(chalk.gray(`\nFull report written to: ${outPath}`));
    });
}
