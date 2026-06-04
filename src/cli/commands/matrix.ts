import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig } from '../../config/load.js';
import { executeRun } from './run.js';
import { buildMatrix } from '../../matrix/build.js';
import { writeMatrixReports } from '../../reporters/matrix.js';
import type { EvaluationResult } from '../../types/index.js';

const STATUS_COLOR: Record<string, (s: string) => string> = {
  PASS: (s) => chalk.green(s),
  PARTIAL: (s) => chalk.yellow(s),
  FAIL: (s) => chalk.red(s),
  SKIPPED: (s) => chalk.dim(s),
};

const STATUS_CHAR: Record<string, string> = {
  PASS: '✓',
  PARTIAL: '~',
  FAIL: '✗',
  SKIPPED: '–',
};

export function register(program: Command): void {
  program
    .command('matrix [dir]')
    .description('Run all providers against the same rules and produce a rule×model compliance grid')
    .requiredOption('--providers <list>', 'Comma-separated list of providers (e.g., mock,gemini,anthropic)')
    .option('--model <model>', 'Model name for providers that support it')
    .option('--config <path>', 'Config file path')
    .option('--extractor <type>', 'deterministic | ai-assisted | hybrid')
    .option('--fail-below <score>', 'Exit 1 if the best provider score is below this threshold')
    .option('--report-dir <dir>', 'Report output directory')
    .action(async (dir, options) => {
      const runId = Date.now();

      if (dir) process.chdir(dir);
      const baseConfig = await loadConfig(options.config);
      if (options.model) baseConfig.model = options.model;
      if (options.extractor) baseConfig.extractor = options.extractor;
      if (options.reportDir) baseConfig.reportDir = options.reportDir;

      const providerList: string[] = String(options.providers)
        .split(/[,\s]+/)
        .map((p: string) => p.trim())
        .filter(Boolean);

      if (providerList.length < 2) {
        console.error(chalk.red('matrix requires at least 2 providers. Use --providers mock,gemini'));
        process.exit(1);
      }

      console.log(chalk.bold.blue(`\nRuleProbe Matrix — ${providerList.join(' vs ')}\n`));

      const allResults: Record<string, EvaluationResult[]> = {};

      for (const providerName of providerList) {
        console.log(chalk.cyan(`Running provider: ${providerName}...`));
        try {
          allResults[providerName] = await executeRun(baseConfig, providerName, {
            writeReports: false,
            quiet: true,
          });
          const score = allResults[providerName].length > 0
            ? Math.round(allResults[providerName].reduce((a, r) => a + r.score, 0) / allResults[providerName].length)
            : 0;
          console.log(chalk.cyan(`  ${providerName}: ${score}/100`));
        } catch (e: any) {
          console.error(chalk.red(`  ${providerName} failed: ${e.message}`));
          allResults[providerName] = [];
        }
      }

      const matrix = buildMatrix(allResults);

      // Print console grid
      console.log(chalk.bold('\n┌── Rule × Provider Grid ──────────────────────────────┐'));

      // Header row
      const colWidth = 12;
      const providerHeaders = matrix.providers.map(p => p.slice(0, colWidth - 2).padEnd(colWidth)).join(' ');
      console.log(chalk.bold(`  ${'Rule'.padEnd(50)}  ${providerHeaders}`));
      console.log('  ' + '─'.repeat(50 + 2 + colWidth * matrix.providers.length));

      for (const row of matrix.rows) {
        const truncated = (row.ruleText ?? row.ruleId).slice(0, 50).padEnd(50);
        const cells = matrix.providers.map(p => {
          const cell = row.cells[p];
          const st = cell?.status ?? 'SKIPPED';
          const char = STATUS_CHAR[st] ?? '?';
          const score = cell ? `${cell.score}`.padStart(3) : '  –';
          const colored = (STATUS_COLOR[st] ?? ((s: string) => s))(`${char}${score}`);
          return colored.padEnd(colWidth);
        }).join(' ');
        console.log(`  ${truncated}  ${cells}`);
      }

      console.log('  ' + '─'.repeat(50 + 2 + colWidth * matrix.providers.length));

      // Provider scores summary
      console.log(chalk.bold('\n  Provider Scores:'));
      for (const p of matrix.providers) {
        const score = matrix.providerScores[p];
        const color = score >= 80 ? chalk.green : score >= 60 ? chalk.yellow : chalk.red;
        console.log(`    ${p.padEnd(20)} ${color(`${score}/100`)}`);
      }

      // Hard rules callout
      if (matrix.hardRules.length > 0) {
        console.log(chalk.bold.yellow('\n  ⚠ Rules with large cross-model spread (consider rewriting):'));
        for (const h of matrix.hardRules.slice(0, 5)) {
          const t = h.ruleText.slice(0, 70);
          console.log(chalk.yellow(`    [spread ${h.spread}pts] ${t}`));
        }
      }

      await writeMatrixReports(matrix, baseConfig.reportDir, runId);
      console.log('');

      // Fail-below check: exit 1 if the BEST provider score is below threshold
      if (options.failBelow) {
        const threshold = parseInt(options.failBelow, 10);
        const bestScore = Math.max(...Object.values(matrix.providerScores));
        if (bestScore < threshold) {
          console.error(chalk.red(`Best provider score (${bestScore}) is below --fail-below ${threshold}`));
          process.exit(1);
        }
      }
    });
}
