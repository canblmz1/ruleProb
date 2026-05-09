#!/usr/bin/env node
import "dotenv/config";
import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import { loadConfig } from '../config/load.js';
import { discoverInstructions } from '../instructions/discover.js';
import { routeExtraction } from '../extractors/merge.js';
import { normalizeProviderResult } from '../providers/normalize.js';
import { runBenchmark } from '../benchmark/run.js';
import { runAnalyze } from '../analyze/runAnalyze.js';
import { compareDeterministicToHybrid, formatRuleComparison } from '../compare/extraction.js';
import { compareWithBaseRef, formatBaseRefComparison } from '../compare/baseRef.js';
import { generateScenarios } from '../scenarios/generate.js';
import { createSandbox, cleanupSandbox, getChangedFileContentsAtHead } from '../sandbox/create.js';
import { MockProvider } from '../providers/mock.js';
import { DryRunProvider } from '../providers/dryRun.js';
import { OpenRouterProvider } from '../providers/openrouter.js';
import { OpenCodeGoProvider } from '../providers/opencodeGo.js';
import { renderProviderCapabilityMarkdown } from '../providers/capabilities.js';
import { evaluateResult } from '../evaluator/score.js';
import { writeJsonReport } from '../reporters/json.js';
import { writeMarkdownReport } from '../reporters/markdown.js';
import { writeHtmlReport } from '../reporters/html.js';
import { writeSarifReport } from '../reporters/sarif.js';
import { writeJUnitReport } from '../reporters/junit.js';
import { lintRules, formatLintOutput } from '../lint/analyze.js';
import { analyzeTokens, formatTokenReport } from '../tokens/analyze.js';
import { listPacks, getPack } from '../packs/registry.js';
import { runDoctor } from './doctor.js';
import { clearExtractionCache } from '../extractors/cache.js';
import { EvaluationResult, Provider, Config } from '../types/index.js';
import { writeBadgeFiles } from '../badge/generate.js';
import { appendHistory, loadHistory, computeTrendSummary, clearHistory, filterHistory } from '../history/track.js';
import fs from 'fs-extra';
import { watch as chokidarWatch } from 'chokidar';

const program = new Command();

program
  .name('ruleprobe')
  .description('Test AI coding agent instructions at runtime')
  .version('0.3.0');

program
  .command('init')
  .description('Initialize ruleprobe config')
  .action(async () => {
    await fs.writeFile('ruleprobe.config.json', JSON.stringify({
      provider: "mock",
      instructionFiles: ["CLAUDE.md", "AGENTS.md", ".cursor/rules/*.mdc", ".github/copilot-instructions.md"],
      reportDir: ".ruleprobe",
      failBelow: 70,
      keepSandbox: false
    }, null, 2));
    console.log(chalk.green('Initialized ruleprobe.config.json with minimal config'));
  });

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

program
  .command('doctor')
  .description('Run local diagnostics for RuleProbe (Node, pnpm, dist, shebang, env keys, .ruleprobe writeability)')
  .action(async () => {
    const result = await runDoctor({ cwd: process.cwd() });
    if (result.criticalFailures > 0) process.exit(1);
  });

program
  .command('clear-cache')
  .description('Remove cached AI extraction results from .ruleprobe/cache/')
  .action(async () => {
    const removed = await clearExtractionCache();
    console.log(chalk.green(`Cleared ${removed} cached extraction file(s).`));
  });

program
  .command('lint [dir]')
  .description('Check rule quality: detect vague, duplicate, or untestable rules')
  .option('--config <file>', 'Config file path')
  .option('--extractor <name>', 'Extractor: deterministic (default), hybrid, ai-assisted')
  .option('--strict', 'Exit with code 1 if any warnings are found (default: only errors)')
  .action(async (dir: string | undefined, options) => {
    if (dir) process.chdir(dir);
    const config = await loadConfig(options.config);
    if (options.extractor) config.extractor = options.extractor;

    const files = await discoverInstructions(config);
    if (files.length === 0) {
      console.log(chalk.yellow('No instruction files found. Run `ruleprobe init` to get started.'));
      return;
    }

    const { extractRules } = await import('../rules/extract.js');
    const rules = extractRules(files);

    const issues = lintRules(rules);
    const output = formatLintOutput(issues, rules.length);

    const hasErrors = issues.some(i => i.severity === 'error');
    const hasWarnings = issues.some(i => i.severity === 'warn');

    if (hasErrors) {
      console.error(chalk.red(output));
      process.exit(1);
    } else if (hasWarnings && options.strict) {
      console.error(chalk.yellow(output));
      process.exit(1);
    } else if (hasWarnings) {
      console.log(chalk.yellow(output));
    } else {
      console.log(chalk.green(output));
    }
  });

program
  .command('analyze-tokens [dir]')
  .description('Estimate token cost of your instruction files and identify expensive rules')
  .option('--config <file>', 'Config file path')
  .action(async (dir: string | undefined, options) => {
    if (dir) process.chdir(dir);
    const config = await loadConfig(options.config);
    const files = await discoverInstructions(config);
    if (files.length === 0) {
      console.log(chalk.yellow('No instruction files found.'));
      return;
    }
    const { extractRules } = await import('../rules/extract.js');
    const rules = extractRules(files);
    const report = analyzeTokens(files, rules);
    const output = formatTokenReport(report);
    const hasWarnings = report.warnings.length > 0;
    console.log(hasWarnings ? chalk.yellow(output) : chalk.green(output));
  });

program
  .command('packs')
  .description('List available built-in rule packs')
  .action(() => {
    const packs = listPacks();
    console.log(chalk.bold('\nAvailable rule packs:\n'));
    for (const pack of packs) {
      console.log(`  ${chalk.cyan(pack.name.padEnd(20))} ${pack.description}`);
      console.log(`  ${chalk.gray('tags: ' + pack.tags.join(', '))}\n`);
    }
    console.log(`Run ${chalk.cyan('ruleprobe add <pack-name>')} to add rules to your CLAUDE.md`);
  });

program
  .command('add <pack>')
  .description('Add a built-in rule pack to your CLAUDE.md (or AGENTS.md)')
  .option('--file <path>', 'Target instruction file', 'CLAUDE.md')
  .option('--dry-run', 'Preview rules without writing')
  .action(async (packName: string, options) => {
    const pack = getPack(packName);
    if (!pack) {
      const available = listPacks().map(p => p.name).join(', ');
      console.error(chalk.red(`Unknown pack: "${packName}". Available: ${available}`));
      process.exit(1);
    }

    const preview = pack.rules.join('\n');
    if (options.dryRun) {
      console.log(chalk.bold(`\nPreview — ${pack.name} (${pack.rules.length} rules):\n`));
      console.log(preview);
      return;
    }

    const target = options.file;
    const exists = await fs.pathExists(target);
    const header = `\n## ${pack.name} rules (added by ruleprobe add)\n`;
    const block = header + preview + '\n';

    if (exists) {
      await fs.appendFile(target, block, 'utf-8');
    } else {
      await fs.writeFile(target, block.trimStart(), 'utf-8');
    }

    console.log(chalk.green(`✓ Added ${pack.rules.length} rule(s) from "${pack.name}" to ${target}`));
    console.log(chalk.gray(`  Run "ruleprobe list-rules ." to verify extraction.`));
  });

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
    console.log(chalk.green(`Badge written: ${scorePath}`));
  });

program
  .command('list-rules')
  .argument('[dir]', 'Directory to scan')
  .description('List extracted rules tabularly')
  .option('--extractor <type>', 'deterministic | ai-assisted | hybrid')
  .option('--provider <provider>', 'Provider for ai-assisted mode')
  .option('--model <model>', 'Model to use for providers that support it')
  .option('--compare <modes>', 'Compare extraction modes, currently deterministic,hybrid')
  .option('--debug-extractor', 'Print debug stats for extraction mode')
  .option('--show-informational', 'List testable: false rules')
  .option('--no-cache', 'Disable AI extraction cache')
  .option('--provider-timeout-ms <ms>', 'Override the default provider extraction timeout')
  .action(async (dir, options) => {
    const config = await loadConfig();
    if (options.extractor) config.extractor = options.extractor;
    if (options.provider) config.provider = options.provider;
    if (options.model) (config as any).model = options.model;
    if (options.debugExtractor) (config as any).debugExtractor = true;
    if (options.cache === false) (config as any).useExtractionCache = false;
    if (options.providerTimeoutMs) config.providerTimeoutMs = parseInt(options.providerTimeoutMs, 10);

    const files = await loadInstructionFilesForReadOnlyCommand(dir, config);
    if (options.compare) {
      const requestedModes = String(options.compare).split(/[,\s]+/).map(mode => mode.trim()).filter(Boolean);
      if (requestedModes.includes('deterministic') && requestedModes.includes('hybrid')) {
        const comparison = await compareDeterministicToHybrid(files, config);
        console.log(formatRuleComparison(comparison));
        return;
      }
      console.error(chalk.red('Only --compare deterministic,hybrid is supported in v0.3.'));
      process.exit(1);
    }

    const allRules = await routeExtraction(files, config);
    const rules = options.showInformational ? allRules : allRules.filter(r => r.testable);

    console.table(rules.map(r => ({
      Source: path.basename(r.sourceFile),
      Category: r.category,
      Severity: r.severity,
      Testable: r.testable,
      Rule: r.text.length > 50 ? r.text.substring(0, 47) + '...' : r.text
    })));
  });

program
  .command('compare')
  .argument('[dir]', 'Directory to scan')
  .description('Compare deterministic vs hybrid extraction, or branch vs base ref')
  .option('--provider <provider>', 'Provider for hybrid ai-assisted candidates')
  .option('--model <model>', 'Model to use for providers that support it')
  .option('--extractor <type>', 'Extractor mode for base-ref comparison (used only with --base)')
  .option('--base <ref>', 'Compare current extraction with the same files at <ref> (e.g. main, origin/main, HEAD~1)')
  .option('--debug-extractor', 'Print debug stats for extraction mode')
  .option('--no-cache', 'Disable AI extraction cache')
  .action(async (dir, options) => {
    const config = await loadConfig();
    if (options.provider) config.provider = options.provider;
    if (options.model) config.model = options.model;
    if (options.extractor) config.extractor = options.extractor;
    if (options.debugExtractor) (config as any).debugExtractor = true;
    if (options.cache === false) (config as any).useExtractionCache = false;

    const cwd = dir ? path.resolve(dir) : process.cwd();
    const files = await loadInstructionFilesForReadOnlyCommand(dir, config);
    if (files.length === 0) {
      console.log(chalk.yellow('No instruction files found to compare.'));
      return;
    }

    if (options.base) {
      const result = await compareWithBaseRef(files, config, options.base, cwd);
      console.log(formatBaseRefComparison(result));
      return;
    }

    const comparison = await compareDeterministicToHybrid(files, config);
    console.log(formatRuleComparison(comparison));
  });

program
  .command('providers')
  .description('Show provider capability matrix')
  .action(() => {
    console.log(renderProviderCapabilityMarkdown());
  });

program
  .command('benchmark')
  .description('Run benchmark corpus limits')
  .option('--fixtures-only', 'Only run against local fixtures')
  .option('--clone', 'Clone real repositories (requires network)')
  .option('--provider <provider>', 'Provider to use for runtime validation')
  .action(async (options) => {
    try {
      await runBenchmark(options);
    } catch (error) {
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

program
  .command('analyze')
  .argument('[dir]', 'Directory to scan')
  .option('--provider <provider>', 'Provider to run analysis with')
  .option('--model <model>', 'Model to use for providers that support it')
  .option('--config <path>', 'Config file path')
  .option('--extractor <type>', 'Extractor mode hint (analyze always enforces ai-assisted)')
  .option('--provider-timeout-ms <ms>', 'Override the default provider execution timeout')
  .option('--no-cache', 'Disable AI extraction cache')
  .option('--debug-extractor', 'Print debug stats for extraction mode')
  .description('Run optional AI analysis emitting JSON rule candidates safely without evaluating tests')
  .action(async (dir, options) => {
    if (options.cache === false) options.noCache = true;
    await runAnalyze(dir, options);
  });

program
  .command('run')
  .description('Run all regression tests')
  .argument('[dir]', 'Directory to test')
  .option('--provider <provider>', 'Provider to run tests with (mock, dry-run, claude-code, openrouter, gemini, opencode-go)')
  .option('--providers <list>', 'Comma-separated list of providers to compare (e.g., mock,gemini)')
  .option('--model <model>', 'Model to use for providers that support it')
  .option('--config <path>', 'Config file path')
  .option('--extractor <type>', 'deterministic | ai-assisted | hybrid')
  .option('--debug-extractor', 'Print debug stats for extraction mode')
  .option('--no-execute-actions', 'Do not structurally block or execute sandbox maneuvers')
  .option('--no-cache', 'Disable AI extraction cache')
  .option('--provider-timeout-ms <ms>', 'Override the default provider execution timeout explicitly')
  .option('--report-dir <dir>', 'Report output directory')
  .option('--fail-below <score>', 'Fail if total score is below target')
  .option('--regression-threshold <pct>', 'Fail if score dropped more than N points vs last run')
  .option('--keep-sandbox', 'Keep sandbox on completion')
  .option('--watch', 'Watch instruction files and re-run on changes')
  .option('--watch-delay <ms>', 'Debounce delay in ms for watch mode (default: 500)', '500')
  .option('--badge', 'Generate SVG score and trend badges')
  .action(async (dir, options) => {
    const runId = Date.now();

    if (dir) process.chdir(dir);
    const baseConfig = await loadConfig(options.config);
    if (options.model) baseConfig.model = options.model;
    if (options.extractor) baseConfig.extractor = options.extractor;
    if (options.debugExtractor) (baseConfig as any).debugExtractor = true;
    if (options.executeActions === false) baseConfig.noExecuteActions = true;
    if (options.cache === false) (baseConfig as any).useExtractionCache = false;
    if (options.providerTimeoutMs) baseConfig.providerTimeoutMs = parseInt(options.providerTimeoutMs, 10);
    if (options.reportDir) baseConfig.reportDir = options.reportDir;
    if (options.failBelow) baseConfig.failBelow = parseInt(options.failBelow, 10);
    if (options.regressionThreshold) (baseConfig as any).regressionThreshold = parseInt(options.regressionThreshold, 10);
    if (options.keepSandbox) baseConfig.keepSandbox = options.keepSandbox;

    const providerList = options.providers
      ? String(options.providers).split(/[,\s]+/).map((p: string) => p.trim()).filter(Boolean)
      : options.provider
        ? [options.provider]
        : [baseConfig.provider];

    async function doRun() {
      if (providerList.length > 1) {
        console.log(chalk.blue(`Running multi-provider comparison: ${providerList.join(', ')}\n`));
        const allResults: Record<string, EvaluationResult[]> = {};
        for (const providerName of providerList) {
          console.log(chalk.cyan(`--- Provider: ${providerName} ---`));
          const results = await executeRun(baseConfig, providerName);
          allResults[providerName] = results;
          const score = Math.round(results.reduce((acc, r) => acc + r.score, 0) / (results.length || 1)) || 0;
          console.log(chalk.cyan(`Provider ${providerName} score: ${score}/100\n`));
        }
        await writeComparisonReport(allResults, baseConfig, runId);
        return;
      }
      await executeRun(baseConfig, providerList[0], { writeReports: true, generateBadge: options.badge });
    }

    await doRun();

    if (options.watch) {
      const watchDelay = parseInt(options.watchDelay || '500', 10);
      console.log(chalk.blue(`\nWatching for changes... (Ctrl+C to stop)`));

      const globs = baseConfig.instructionFiles.map(p => path.resolve(p));
      const watcher = chokidarWatch(globs, {
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: watchDelay, pollInterval: 50 }
      });

      let running = false;
      watcher.on('change', async (changedPath) => {
        if (running) return;
        running = true;
        const rel = path.relative(process.cwd(), changedPath);
        console.log(chalk.yellow(`\n[watch] ${rel} changed — re-running...`));
        try {
          await doRun();
        } finally {
          running = false;
          console.log(chalk.blue('\nWatching for changes... (Ctrl+C to stop)'));
        }
      });

      watcher.on('error', (err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(chalk.red(`[watch] Watcher error: ${msg}`));
      });

      process.on('SIGINT', () => {
        watcher.close();
        process.exit(0);
      });

      await new Promise(() => {});
    }
  });

program.parse(process.argv);

async function executeRun(
  config: Config,
  providerName: string,
  opts: { writeReports?: boolean; generateBadge?: boolean } = {}
): Promise<EvaluationResult[]> {
  console.log(chalk.blue('RuleProbe Runner Started'));
  const files = await discoverInstructions(config);

  if (files.length === 0) {
    console.log(chalk.yellow('No testable rules found.'));
    return [];
  }

  console.log(`Found instruction files:\n${files.map(f => `- ${f.path}`).join('\n')}\n`);

  const rules = await routeExtraction(files, config);
  const testableRuleCount = rules.filter(r => r.testable).length;
  console.log(`Extracted ${testableRuleCount} testable rules (${rules.length} total).`);

  const scenarios = generateScenarios(rules);
  console.log(`Generated ${scenarios.length} sandbox scenarios.\n`);

  console.log(`Running provider: ${providerName}\n`);

  let provider: Provider;
  if (providerName === 'dry-run') {
     provider = new DryRunProvider();
  } else if (providerName === 'openrouter') {
     provider = new OpenRouterProvider(config);
  } else if (providerName === 'gemini') {
     const { GeminiProvider } = await import('../providers/gemini.js');
     provider = new GeminiProvider(config);
  } else if (providerName === 'claude-code') {
     const { ClaudeCodeProvider } = await import('../providers/claudeCode.js');
     provider = new ClaudeCodeProvider(config);
  } else if (providerName === 'opencode-go') {
     provider = new OpenCodeGoProvider(config);
  } else {
     provider = new MockProvider();
  }

  const results: EvaluationResult[] = [];

  for (const scenario of scenarios) {
    const sandboxDir = await createSandbox(scenario);
    const rawProviderResult = await provider.run({ scenario, sandboxDir });
    const providerResult = normalizeProviderResult(rawProviderResult);
    try {
      const baseline = await getChangedFileContentsAtHead(sandboxDir, providerResult.changedFiles);
      (providerResult as any).baselineFileContents = baseline;
    } catch {
      // baseline capture is best-effort
    }
    const evalResult = await evaluateResult(scenario, providerResult);
    results.push(evalResult);

    const statusColor = evalResult.status === 'PASS' || evalResult.status === 'SKIPPED' ? chalk.green : evalResult.status === 'PARTIAL' ? chalk.yellow : chalk.red;
    console.log(`${statusColor(evalResult.status.padEnd(7))} ${scenario.title}`);

    const firstAssertion = scenario.expectedAssertions[0];
    if (firstAssertion) {
       const expectedVal = (firstAssertion as any).value || (firstAssertion as any).manager || (firstAssertion as any).commandIncludes || (firstAssertion as any).pattern || (firstAssertion as any).text || firstAssertion.type;
       console.log(`      Expected: ${expectedVal}`);
    }
    if (evalResult.assertionResults.length > 0) {
      console.log(`      Actual: ${evalResult.assertionResults[0].evidence}`);
    }
    console.log('');

    if (!config.keepSandbox) {
      await cleanupSandbox(sandboxDir);
    }
  }

  const overallScore = Math.round(results.reduce((acc, r) => acc + r.score, 0) / (results.length || 1));
  const finalScore = isNaN(overallScore) ? 0 : overallScore;

  console.log(`Overall score: ${finalScore}/100\n`);

  if (opts.writeReports) {
    await writeJsonReport(results, config);
    await writeMarkdownReport(results, config);
    await writeHtmlReport(results, config);
    const sarifPath = await writeSarifReport(results, config);
    const junitPath = await writeJUnitReport(results, config);

    console.log(`Reports written:\n- ${config.reportDir}/report.json\n- ${config.reportDir}/report.md\n- ${config.reportDir}/report.html\n- ${sarifPath}\n- ${junitPath}\n`);

    const trend = await appendHistory({
      score: finalScore,
      weightedScore: buildReportProofModel(results, config).weightedScore,
      totalRules: results.length,
      passed: results.filter(r => r.status === 'PASS').length,
      partial: results.filter(r => r.status === 'PARTIAL').length,
      failed: results.filter(r => r.status === 'FAIL').length,
      skipped: results.filter(r => r.status === 'SKIPPED').length
    }, config);

    if (opts.generateBadge) {
      const { scorePath, trendPath } = await writeBadgeFiles(finalScore, trend.history[trend.history.length - 1]?.weightedScore || finalScore, trend, config);
      console.log(`Badges written:\n- ${scorePath}${trendPath ? `\n- ${trendPath}` : ''}\n`);
    }

    if (config.failBelow !== undefined && finalScore < config.failBelow) {
      console.error(chalk.red(`Score ${finalScore} is below required threshold ${config.failBelow}`));
      process.exit(1);
    }

    const regressionThreshold = (config as any).regressionThreshold;
    if (regressionThreshold !== undefined && trend.previousScore !== null) {
      const drop = trend.previousScore - finalScore;
      if (drop >= regressionThreshold) {
        console.error(chalk.red(`\n⚠️  Regression detected: score dropped ${drop} points (${trend.previousScore} → ${finalScore}), threshold is ${regressionThreshold}`));
        process.exit(1);
      }
    }
  }

  return results;
}

async function writeComparisonReport(
  allResults: Record<string, EvaluationResult[]>,
  config: Config,
  runId: number
) {
  const providerNames = Object.keys(allResults);
  const scenarioIds = [...new Set(Object.values(allResults).flat().map(r => r.scenarioId))];

  const rows = scenarioIds.map(sid => {
    const first = Object.values(allResults).flat().find(r => r.scenarioId === sid);
    const cells: Record<string, { status: string; score: number }> = {};
    for (const name of providerNames) {
      const result = allResults[name].find(r => r.scenarioId === sid);
      cells[name] = result ? { status: result.status, score: result.score } : { status: 'N/A', score: 0 };
    }
    return { scenarioId: sid, title: first?.scenario.title || sid, cells };
  });

  const overallScores = providerNames.map(name => {
    const results = allResults[name];
    const score = Math.round(results.reduce((acc, r) => acc + r.score, 0) / (results.length || 1)) || 0;
    return { name, score };
  });

  const lines = [
    '# RuleProbe Multi-Provider Comparison',
    '',
    `Run ID: ${runId}`,
    `Date: ${new Date().toISOString()}`,
    '',
    '## Overall Scores',
    ...overallScores.map(o => `- **${o.name}**: ${o.score}/100`),
    '',
    '## Per-Scenario Results',
    '',
    '| Scenario | ' + providerNames.join(' | ') + ' |',
    '| ' + ['---', ...providerNames.map(() => '---')].join(' | ') + ' |',
    ...rows.map(row => {
      const cells = providerNames.map(name => {
        const c = row.cells[name];
        const emoji = c.status === 'PASS' ? '✅' : c.status === 'FAIL' ? '❌' : c.status === 'PARTIAL' ? '⚠️' : '➖';
        return `${emoji} ${c.status}`;
      });
      return `| ${row.title} | ${cells.join(' | ')} |`;
    }),
    '',
    '---',
    '*Generated by RuleProbe*'
  ];

  const outPath = path.join(config.reportDir, `comparison-${runId}.md`);
  await fs.ensureDir(config.reportDir);
  await fs.writeFile(outPath, lines.join('\n'), 'utf-8');
  console.log(chalk.green(`Comparison report written: ${outPath}`));
}

// Avoid circular import: inline lightweight proof model builder for history
function buildReportProofModel(results: EvaluationResult[], config: Config) {
  const overallScore = Math.round(results.reduce((acc, r) => acc + r.score, 0) / (results.length || 1)) || 0;
  const weights: Record<string, number> = { high: 3, medium: 2, low: 1 };
  let weightedSum = 0;
  let totalWeight = 0;
  for (const r of results) {
    const w = weights[r.severity] ?? weights.medium;
    weightedSum += r.score * w;
    totalWeight += w;
  }
  const weightedScore = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
  return { finalScore: overallScore, weightedScore };
}

async function loadInstructionFilesForReadOnlyCommand(target: string | undefined, config: any): Promise<{ path: string; content: string }[]> {
  if (!target) return discoverInstructions(config);

  const resolved = path.resolve(target);
  if (await fs.pathExists(resolved)) {
    const stat = await fs.stat(resolved);
    if (stat.isFile()) {
      return [{ path: resolved, content: await fs.readFile(resolved, 'utf-8') }];
    }
  }

  process.chdir(target);
  return discoverInstructions(config);
}
