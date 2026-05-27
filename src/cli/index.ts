import "dotenv/config";
import { Command } from 'commander';
import { createRequire } from 'module';
const _require = createRequire(import.meta.url);
const _pkg = _require('../../package.json') as { version: string };

import { register as registerInit } from './commands/init.js';
import { register as registerReport } from './commands/report.js';
import { register as registerDoctor } from './commands/doctor.js';
import { register as registerClearCache } from './commands/clear-cache.js';
import { register as registerLint } from './commands/lint.js';
import { register as registerAnalyzeTokens } from './commands/analyze-tokens.js';
import { register as registerPacks } from './commands/packs.js';
import { register as registerAdd } from './commands/add.js';
import { register as registerAddUrl } from './commands/add-url.js';
import { register as registerHistory } from './commands/history.js';
import { register as registerBadge } from './commands/badge.js';
import { register as registerListRules } from './commands/list-rules.js';
import { register as registerCompare } from './commands/compare.js';
import { register as registerProviders } from './commands/providers.js';
import { register as registerBenchmark } from './commands/benchmark.js';
import { register as registerAnalyze } from './commands/analyze.js';
import { register as registerRun } from './commands/run.js';
import { register as registerLeaderboard } from './commands/leaderboard.js';
import { register as registerFeedback } from './commands/feedback.js';
import { register as registerUpgrade } from './commands/upgrade.js';
import { register as registerAdvise } from './commands/advise.js';

const program = new Command();

program
  .name('ruleprobe')
  .description('Test AI coding agent instructions at runtime')
  .version(_pkg.version);

registerInit(program);
registerReport(program);
registerDoctor(program);
registerClearCache(program);
registerLint(program);
registerAnalyzeTokens(program);
registerPacks(program);
registerAdd(program);
registerAddUrl(program);
registerHistory(program);
registerBadge(program);
registerListRules(program);
registerCompare(program);
registerProviders(program);
registerBenchmark(program);
registerAnalyze(program);
registerRun(program);
registerLeaderboard(program);
registerFeedback(program);
registerUpgrade(program);
registerAdvise(program);

program.parse(process.argv);
