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
import { runDoctor } from './doctor.js';
import { clearExtractionCache } from '../extractors/cache.js';
import { EvaluationResult, Provider } from '../types/index.js';
import fs from 'fs-extra';

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
  .option('--model <model>', 'Model to use for providers that support it')
  .option('--config <path>', 'Config file path')
  .option('--extractor <type>', 'deterministic | ai-assisted | hybrid')
  .option('--debug-extractor', 'Print debug stats for extraction mode')
  .option('--no-execute-actions', 'Do not structurally block or execute sandbox maneuvers')
  .option('--no-cache', 'Disable AI extraction cache')
  .option('--provider-timeout-ms <ms>', 'Override the default provider execution timeout explicitly')
  .option('--report-dir <dir>', 'Report output directory')
  .option('--fail-below <score>', 'Fail if total score is below target')
  .option('--keep-sandbox', 'Keep sandbox on completion')
  .action(async (dir, options) => {
    if (dir) process.chdir(dir);
    const config = await loadConfig(options.config);
    if (options.provider) config.provider = options.provider;
    if (options.model) config.model = options.model;
    if (options.extractor) config.extractor = options.extractor;
    if (options.debugExtractor) (config as any).debugExtractor = true;
    if (options.executeActions === false) config.noExecuteActions = true;
    if (options.cache === false) (config as any).useExtractionCache = false;
    if (options.providerTimeoutMs) config.providerTimeoutMs = parseInt(options.providerTimeoutMs, 10);
    if (options.reportDir) config.reportDir = options.reportDir;
    if (options.failBelow) config.failBelow = parseInt(options.failBelow, 10);
    if (options.keepSandbox) config.keepSandbox = options.keepSandbox;

    console.log(chalk.blue('RuleProbe Runner Started'));
    const files = await discoverInstructions(config);

    if (files.length === 0) {
      console.log(chalk.yellow('No testable rules found.'));
      process.exit(0);
    }

    console.log(`Found instruction files:\n${files.map(f => `- ${f.path}`).join('\n')}\n`);

    const rules = await routeExtraction(files, config);
    const testableRuleCount = rules.filter(r => r.testable).length;
    console.log(`Extracted ${testableRuleCount} testable rules (${rules.length} total).`);

    const scenarios = generateScenarios(rules);
    console.log(`Generated ${scenarios.length} sandbox scenarios.\n`);

    console.log(`Running provider: ${config.provider}\n`);

    let provider: Provider;
    if (config.provider === 'dry-run') {
       provider = new DryRunProvider();
    } else if (config.provider === 'openrouter') {
       provider = new OpenRouterProvider(config);
    } else if (config.provider === 'gemini') {
       const { GeminiProvider } = await import('../providers/gemini.js');
       provider = new GeminiProvider(config);
    } else if (config.provider === 'claude-code') {
       const { ClaudeCodeProvider } = await import('../providers/claudeCode.js');
       provider = new ClaudeCodeProvider(config);
    } else if (config.provider === 'opencode-go') {
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

    await writeJsonReport(results, config);
    await writeMarkdownReport(results, config);
    await writeHtmlReport(results, config);

    console.log(`Reports written:\n- ${config.reportDir}/report.json\n- ${config.reportDir}/report.md\n- ${config.reportDir}/report.html\n`);

    if (config.failBelow !== undefined && finalScore < config.failBelow) {
      console.error(chalk.red(`Score ${finalScore} is below required threshold ${config.failBelow}`));
      process.exit(1);
    }
  });

program.parse(process.argv);

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
