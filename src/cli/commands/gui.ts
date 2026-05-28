import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import { render } from 'ink';
import React from 'react';
import { loadConfig } from '../../config/load.js';
import { discoverInstructions } from '../../instructions/discover.js';
import { routeExtraction } from '../../extractors/merge.js';
import { scanRepo } from '../../advisor/repoScan.js';
import { suggestRules } from '../../advisor/suggest.js';
import type { HistoryInsight } from '../../advisor/types.js';
import { App } from '../../tui/App.js';

/** Minimal HistoryInsight default when no run history is available. */
const DEFAULT_HISTORY: HistoryInsight = {
  failureRate: 0,
  trend: 'stable',
  totalRuns: 0,
};

export function register(program: Command): void {
  program
    .command('gui [dir]')
    .description('Launch interactive TUI (rules, scenarios, advisor suggestions)')
    .action(async (dir?: string) => {
      const targetDir = dir ? path.resolve(dir) : process.cwd();

      if (!process.stdout.isTTY) {
        console.error(chalk.red('Error: ruleprobe gui requires a TTY terminal'));
        process.exit(1);
      }

      // Pre-load data before rendering so the TUI renders immediately
      try {
        const config = await loadConfig();
        if (dir) {
          process.chdir(targetDir);
        }
        const files = await discoverInstructions(config);
        const rules = await routeExtraction(files, config);
        const scanResult = await scanRepo(targetDir);
        const suggestions = suggestRules(scanResult, DEFAULT_HISTORY, rules);

        render(React.createElement(App, { dir: targetDir, rules, suggestions }));
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(chalk.red('Error:'), message);
        process.exit(1);
      }
    });
}
