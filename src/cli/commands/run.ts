import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';
import { watch as chokidarWatch } from 'chokidar';
import { loadConfig } from '../../config/load.js';
import { discoverInstructions } from '../../instructions/discover.js';
import { routeExtraction } from '../../extractors/merge.js';
import { normalizeProviderResult } from '../../providers/normalize.js';
import { generateScenarios } from '../../scenarios/generate.js';
import { createSandbox, cleanupSandbox } from '../../sandbox/create.js';
import { MockProvider } from '../../providers/mock.js';
import { DryRunProvider } from '../../providers/dryRun.js';
import { OpenRouterProvider } from '../../providers/openrouter.js';
import { OpenCodeGoProvider } from '../../providers/opencodeGo.js';
import { evaluateResult } from '../../evaluator/score.js';
import { writeJsonReport } from '../../reporters/json.js';
import { writeMarkdownReport } from '../../reporters/markdown.js';
import { writeHtmlReport } from '../../reporters/html.js';
import { writeSarifReport } from '../../reporters/sarif.js';
import { writeJUnitReport } from '../../reporters/junit.js';
import { writePrCommentReport } from '../../reporters/prComment.js';
import { writeBadgeFiles, writeShieldsEndpoint } from '../../badge/generate.js';
import { appendHistory } from '../../history/track.js';
import { readBaseline, writeBaseline, computeBaselineDelta, formatBaselineDelta, BaselineDelta } from '../../baseline/compare.js';
import { EvaluationResult, Provider, Config } from '../../types/index.js';
import { startLiveReporter, watchSandbox, globalEventBus } from '../../live/index.js';

export function register(program: Command): void {
  program
    .command('run')
    .description('Run all regression tests')
    .argument('[dir]', 'Directory to test')
    .option('--provider <provider>', 'Provider to run tests with (mock, dry-run, claude-code, openrouter, gemini, opencode-go, anthropic, openai, ollama)')
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
    .option('--baseline', 'Save or compare against a baseline run')
    .option('--fail-on-regression', 'Exit with code 1 if any scenario regressed vs baseline')
    .option('--lang <language>', 'Language profile: node (default), python, go, rust')
    .option('--demo', 'Demo mode: use mock provider with realistic PASS/FAIL mix, no API key needed')
    .option('--no-custom-scenarios', 'Skip loading .ruleprobe/scenarios.yaml')
    .option('--adaptive-weights', 'Boost severity weights for high-failure categories based on run history')
    .option('--live', 'Stream sandbox file-change and command-execution events to terminal in real time')
    .action(async (dir, options) => {
      const runId = Date.now();

      if (options.demo) {
        console.log(chalk.bold.cyan('\n  ╔══════════════════════════════════════╗'));
        console.log(chalk.bold.cyan('  ║        RULEPROBE DEMO MODE           ║'));
        console.log(chalk.bold.cyan('  ║  No API key needed · mock provider   ║'));
        console.log(chalk.bold.cyan('  ╚══════════════════════════════════════╝\n'));
        // Force mock provider and inject demoMode flag for wider failure band
        options.provider = 'mock';
        options._demoMode = true;
      }

      if (dir) process.chdir(dir);
      const baseConfig = await loadConfig(options.config);
      if (options.model) baseConfig.model = options.model;
      if (options.extractor) baseConfig.extractor = options.extractor;
      if (options.debugExtractor) baseConfig.debugExtractor = true;
      if (options.executeActions === false) baseConfig.noExecuteActions = true;
      if (options.cache === false) baseConfig.useExtractionCache = false;
      if (options.providerTimeoutMs) baseConfig.providerTimeoutMs = parseInt(options.providerTimeoutMs, 10);
      if (options.reportDir) baseConfig.reportDir = options.reportDir;
      if (options.failBelow) baseConfig.failBelow = parseInt(options.failBelow, 10);
      if (options.regressionThreshold) baseConfig.regressionThreshold = parseInt(options.regressionThreshold, 10);
      if (options.keepSandbox) baseConfig.keepSandbox = options.keepSandbox;
      if (options.baseline) baseConfig.baseline = true;
      if (options.failOnRegression) baseConfig.failOnRegression = true;
      const VALID_LANGS = ['node', 'python', 'go', 'rust'];
      if (options.lang && !VALID_LANGS.includes(options.lang)) {
        console.error(`Unknown language profile "${options.lang}". Valid options: ${VALID_LANGS.join(', ')}`);
        process.exit(1);
      }
      if (options.lang) baseConfig.lang = options.lang;

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
        await executeRun(baseConfig, providerList[0], { writeReports: true, generateBadge: options.badge, demoMode: !!options._demoMode, loadCustomScenarios: options.customScenarios !== false, adaptiveWeights: !!options.adaptiveWeights, live: !!options.live });
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
}

async function executeRun(
  config: Config,
  providerName: string,
  opts: { writeReports?: boolean; generateBadge?: boolean; demoMode?: boolean; loadCustomScenarios?: boolean; adaptiveWeights?: boolean; live?: boolean } = {}
): Promise<EvaluationResult[]> {
  console.log(chalk.blue('RuleProbe Runner Started'));

  // Live monitoring setup
  let liveJsonlPath: string | undefined;
  if (opts.live) {
    startLiveReporter();
    liveJsonlPath = path.join(config.reportDir, 'live-events.jsonl');
    await fs.ensureDir(config.reportDir);
    await fs.writeFile(liveJsonlPath, '', 'utf-8');
    // Append every event as a JSON line
    globalEventBus.on(async (event) => {
      try {
        await fs.appendFile(liveJsonlPath!, JSON.stringify(event) + '\n', 'utf-8');
      } catch {
        // non-fatal: live event log write failed, continue
      }
    });
    console.log(chalk.dim(`Live events: ${liveJsonlPath}\n`));
  }

  const files = await discoverInstructions(config);

  if (files.length === 0) {
    console.log(chalk.yellow('No testable rules found.'));
    return [];
  }

  console.log(`Found instruction files:\n${files.map(f => `- ${f.path}`).join('\n')}\n`);

  const rules = await routeExtraction(files, config);
  const testableRuleCount = rules.filter(r => r.testable).length;
  console.log(`Extracted ${testableRuleCount} testable rules (${rules.length} total).`);

  const baseScenarios = generateScenarios(rules);

  let allScenarios = baseScenarios;
  if (opts.loadCustomScenarios !== false) {
    const { loadCustomScenarios } = await import('../../config/customScenarios.js');
    const customScenarios = await loadCustomScenarios();
    if (customScenarios.length > 0) {
      console.log(`Loaded ${customScenarios.length} custom scenario(s) from .ruleprobe/scenarios.yaml.`);
    }
    allScenarios = [...baseScenarios, ...customScenarios];
  }

  console.log(`Generated ${allScenarios.length} sandbox scenarios.\n`);

  console.log(`Running provider: ${providerName}\n`);

  let provider: Provider;
  if (providerName === 'dry-run') {
     provider = new DryRunProvider();
  } else if (providerName === 'openrouter') {
     provider = new OpenRouterProvider(config);
  } else if (providerName === 'gemini') {
     const { GeminiProvider } = await import('../../providers/gemini.js');
     provider = new GeminiProvider(config);
  } else if (providerName === 'claude-code') {
     const { ClaudeCodeProvider } = await import('../../providers/claudeCode.js');
     provider = new ClaudeCodeProvider(config);
  } else if (providerName === 'opencode-go') {
     provider = new OpenCodeGoProvider(config);
  } else if (providerName === 'anthropic') {
     const { AnthropicProvider } = await import('../../providers/anthropic.js');
     provider = new AnthropicProvider(config);
  } else if (providerName === 'openai') {
     const { OpenAIProvider } = await import('../../providers/openai.js');
     provider = new OpenAIProvider(config);
  } else if (providerName === 'ollama') {
     const { OllamaProvider } = await import('../../providers/ollama.js');
     provider = new OllamaProvider(config);
  } else if (providerName === 'mock') {
     provider = new MockProvider({ demoMode: opts.demoMode });
  } else {
     const KNOWN_PROVIDERS = ['mock', 'dry-run', 'gemini', 'openrouter', 'claude-code', 'opencode-go', 'anthropic', 'openai', 'ollama'];
     console.error(chalk.red(`Unknown provider: "${providerName}". Valid providers: ${KNOWN_PROVIDERS.join(', ')}`));
     process.exit(1);
  }

  const results: EvaluationResult[] = [];

  for (const scenario of allScenarios) {
    const sandboxDir = await createSandbox(scenario);

    let stopWatcher: (() => void) | undefined;
    if (opts.live) {
      globalEventBus.emit({
        type: 'scenario_start',
        scenarioId: scenario.id,
        scenarioTitle: scenario.title,
        payload: scenario.title,
        timestamp: Date.now()
      });
      stopWatcher = watchSandbox(sandboxDir, scenario.id, scenario.title);
    }

    const rawProviderResult = await provider.run({ scenario, sandboxDir });
    const providerResult = normalizeProviderResult(rawProviderResult);

    if (opts.live) {
      // Emit command_exec events post-hoc (commands already ran inside provider.run)
      for (const cmd of (providerResult.commands ?? [])) {
        globalEventBus.emit({
          type: 'command_exec',
          scenarioId: scenario.id,
          scenarioTitle: scenario.title,
          payload: cmd,
          timestamp: Date.now()
        });
      }
      stopWatcher?.();
      globalEventBus.emit({
        type: 'scenario_end',
        scenarioId: scenario.id,
        scenarioTitle: scenario.title,
        payload: 'done',
        timestamp: Date.now()
      });
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

  const scorableResults = results.filter(r => r.status !== 'SKIPPED');
  const overallScore = scorableResults.length > 0
    ? Math.round(scorableResults.reduce((acc, r) => acc + r.score, 0) / scorableResults.length)
    : 0;
  const finalScore = isNaN(overallScore) ? 0 : overallScore;

  const skippedCount = results.filter(r => r.status === 'SKIPPED').length;
  const evaluatedCount = results.length - skippedCount;
  const coveragePct = results.length > 0 ? Math.round((evaluatedCount / results.length) * 100) : 0;
  console.log(`Overall score: ${finalScore}/100`);
  console.log(`Rule coverage: ${evaluatedCount}/${results.length} evaluated (${coveragePct}%)  Skipped: ${skippedCount}\n`);

  const skippedCodePatternCount = results.filter(r =>
    r.status === 'SKIPPED' &&
    (r.category === 'code_pattern_forbidden' || r.category === 'code_pattern_required')
  ).length;
  if (skippedCodePatternCount > 0) {
    console.log(chalk.yellow(`Tip: ${skippedCodePatternCount} code pattern rule(s) were skipped (no file content available).`));
    console.log(chalk.yellow(`     Re-run with --provider claude-code or --provider openrouter to evaluate them.\n`));
  }

  const { loadSeverityWeights } = await import('../../config/weights.js');
  const severityWeights = await loadSeverityWeights();

  let finalWeights = severityWeights;
  if (opts.adaptiveWeights) {
    const { loadAdaptiveWeights } = await import('../../weights/adaptive.js');
    const adaptive = await loadAdaptiveWeights(config.reportDir, severityWeights);
    finalWeights = adaptive.weights;
    if (adaptive.source === 'adaptive') {
      console.log(chalk.dim(`Adaptive weights active (${adaptive.runsAnalyzed} runs analyzed)`));
    }
  }

  if (opts.writeReports) {
    let delta: BaselineDelta | undefined;
    if (config.baseline) {
      const baseline = await readBaseline(config);
      delta = computeBaselineDelta(results, baseline);
      console.log(chalk.bold('\nBaseline Comparison'));
      console.log(formatBaselineDelta(delta));
      if (config.failOnRegression && delta.regressions.length > 0) {
        console.error(chalk.red(`\n${delta.regressions.length} regression(s) detected vs baseline.`));
        process.exit(1);
      }
      await writeBaseline(results, config);
      console.log(chalk.green(`\nBaseline updated: ${config.reportDir}/baseline.json`));
    }

    await writeJsonReport(results, config, delta, finalWeights);
    await writeMarkdownReport(results, config, delta, finalWeights, rules);
    await writeHtmlReport(results, config, delta, finalWeights);
    const sarifPath = await writeSarifReport(results, config);
    const junitPath = await writeJUnitReport(results, config);
    const prCommentPath = await writePrCommentReport(results, config, delta, finalWeights);

    console.log(`Reports written:\n- ${config.reportDir}/report.json\n- ${config.reportDir}/report.md\n- ${config.reportDir}/report.html\n- ${sarifPath}\n- ${junitPath}\n- ${prCommentPath}\n`);

    const trend = await appendHistory({
      score: finalScore,
      weightedScore: buildReportProofModel(results, config, finalWeights).weightedScore,
      totalRules: results.length,
      passed: results.filter(r => r.status === 'PASS').length,
      partial: results.filter(r => r.status === 'PARTIAL').length,
      failed: results.filter(r => r.status === 'FAIL').length,
      skipped: results.filter(r => r.status === 'SKIPPED').length
    }, config);

    if (opts.generateBadge) {
      const { scorePath, trendPath } = await writeBadgeFiles(finalScore, trend.history[trend.history.length - 1]?.weightedScore || finalScore, trend, config);
      await writeShieldsEndpoint(finalScore, config, { pct: coveragePct });
      console.log(`Badges written:\n- ${scorePath}${trendPath ? `\n- ${trendPath}` : ''}\n`);
    }

    if (config.failBelow !== undefined && finalScore < config.failBelow) {
      console.error(chalk.red(`Score ${finalScore} is below required threshold ${config.failBelow}`));
      process.exit(1);
    }

    const regressionThreshold = config.regressionThreshold;
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
    return { scenarioId: sid, title: first?.scenario.title || sid, category: first?.scenario.ruleCategory || '', cells };
  });

  const overallScores = providerNames.map(name => {
    const results = allResults[name];
    const score = Math.round(results.reduce((acc, r) => acc + r.score, 0) / (results.length || 1)) || 0;
    return { name, score };
  });

  // Category-level breakdown: which provider is best per category
  const categories = [...new Set(rows.map(r => r.category).filter(Boolean))];
  const categoryLeaders: string[] = [];
  for (const cat of categories) {
    const catRows = rows.filter(r => r.category === cat);
    const catScores = providerNames.map(name => {
      const score = Math.round(catRows.reduce((acc, r) => acc + (r.cells[name]?.score ?? 0), 0) / (catRows.length || 1));
      return { name, score };
    });
    catScores.sort((a, b) => b.score - a.score);
    if (catScores.length > 1 && catScores[0].score > catScores[1].score) {
      categoryLeaders.push(`- **${catScores[0].name}** leads on \`${cat}\` (${catScores[0].score} vs ${catScores[1].score})`);
    }
  }

  const lines = [
    '# RuleProbe Multi-Provider Comparison',
    '',
    `Run ID: ${runId}`,
    `Date: ${new Date().toISOString()}`,
    '',
    '## Overall Scores',
    ...overallScores.map(o => `- **${o.name}**: ${o.score}/100`),
    '',
    ...(categoryLeaders.length > 0 ? ['## Category Leaders', ...categoryLeaders, ''] : []),
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

  // HTML comparison report
  const statusColor: Record<string, string> = { PASS: '#22c55e', FAIL: '#ef4444', PARTIAL: '#f59e0b', SKIPPED: '#94a3b8', 'N/A': '#cbd5e1' };
  const statusEmoji: Record<string, string> = { PASS: '✅', FAIL: '❌', PARTIAL: '⚠️', SKIPPED: '➖', 'N/A': '—' };
  const scoreBar = (score: number) => `<div style="background:#e2e8f0;border-radius:4px;height:8px;width:100%;"><div style="background:#6366f1;width:${score}%;height:8px;border-radius:4px;"></div></div>`;

  const htmlLines = [
    '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">',
    '<title>RuleProbe Multi-Provider Comparison</title>',
    '<style>body{font-family:system-ui,sans-serif;margin:2rem;color:#1e293b;background:#f8fafc;}',
    'h1{color:#4f46e5;}table{border-collapse:collapse;width:100%;margin-top:1rem;}',
    'th{background:#4f46e5;color:white;padding:8px 12px;text-align:left;font-size:13px;}',
    'td{padding:7px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;}',
    'tr:hover td{background:#f1f5f9;}.score-cell{font-weight:bold;}.chip{display:inline-block;padding:2px 8px;border-radius:12px;font-size:12px;font-weight:600;color:white;}',
    '.leader{background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:8px 14px;margin:4px 0;font-size:13px;}',
    '</style></head><body>',
    '<h1>🔬 RuleProbe Multi-Provider Comparison</h1>',
    `<p style="color:#64748b">Run <code>${runId}</code> &mdash; ${new Date().toLocaleString()}</p>`,
    '<h2>Overall Scores</h2>',
    '<table><tr><th>Provider</th><th>Score</th><th style="width:200px">Bar</th></tr>',
    ...overallScores.map(o => `<tr><td><strong>${o.name}</strong></td><td class="score-cell">${o.score}/100</td><td>${scoreBar(o.score)}</td></tr>`),
    '</table>',
    ...(categoryLeaders.length > 0 ? [
      '<h2>Category Leaders</h2>',
      ...categoryLeaders.map(l => `<div class="leader">${l.replace(/\*\*/g, '').replace(/`([^`]+)`/g, '<code>$1</code>')}</div>`),
    ] : []),
    '<h2>Per-Scenario Results</h2>',
    '<table><tr><th>Scenario</th>',
    ...providerNames.map(n => `<th>${n}</th>`),
    '</tr>',
    ...rows.map(row => {
      const cells = providerNames.map(name => {
        const c = row.cells[name];
        const col = statusColor[c.status] ?? '#cbd5e1';
        const em = statusEmoji[c.status] ?? '—';
        return `<td><span class="chip" style="background:${col}">${em} ${c.status}</span></td>`;
      });
      return `<tr><td>${row.title}</td>${cells.join('')}</tr>`;
    }),
    '</table>',
    '<p style="color:#94a3b8;font-size:12px;margin-top:2rem">Generated by RuleProbe</p>',
    '</body></html>'
  ];

  const htmlPath = path.join(config.reportDir, `comparison-${runId}.html`);
  await fs.writeFile(htmlPath, htmlLines.join('\n'), 'utf-8');
  console.log(chalk.green(`Comparison HTML report written: ${htmlPath}`));
}

// Avoid circular import: inline lightweight proof model builder for history
function buildReportProofModel(results: EvaluationResult[], _config: Config, weights: Record<string, number> = { high: 3, medium: 2, low: 1 }) {
  const scorable = results.filter(r => r.status !== 'SKIPPED');
  const overallScore = scorable.length > 0
    ? Math.round(scorable.reduce((acc, r) => acc + r.score, 0) / scorable.length)
    : 0;
  let weightedSum = 0;
  let totalWeight = 0;
  for (const r of scorable) {
    const w = weights[r.severity] ?? weights['medium'] ?? 2;
    weightedSum += r.score * w;
    totalWeight += w;
  }
  const weightedScore = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
  return { finalScore: overallScore, weightedScore };
}
