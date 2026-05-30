import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import { loadConfig } from '../../config/load.js';
import { routeExtraction } from '../../extractors/merge.js';
import { compareDeterministicToHybrid, formatRuleComparison } from '../../compare/extraction.js';
import { generateScenarios } from '../../scenarios/generate.js';
import { loadInstructionFilesForReadOnlyCommand } from './_shared.js';

export function register(program: Command): void {
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
    .option('--show-scenarios', 'Preview generated test scenarios for each rule')
    .option('--explain', 'Show extraction detail: assertions, source line, and severity for each rule')
    .option('--no-cache', 'Disable AI extraction cache')
    .option('--provider-timeout-ms <ms>', 'Override the default provider extraction timeout')
    .option('--lang <language>', 'Language profile: node (default), python, go, rust')
    .action(async (dir, options) => {
      const config = await loadConfig();
      if (options.extractor) config.extractor = options.extractor;
      if (options.provider) config.provider = options.provider;
      if (options.model) config.model = options.model;
      if (options.debugExtractor) config.debugExtractor = true;
      if (options.cache === false) config.useExtractionCache = false;
      if (options.providerTimeoutMs) config.providerTimeoutMs = parseInt(options.providerTimeoutMs, 10);
      const VALID_LANGS = ['node', 'python', 'go', 'rust'];
      if (options.lang && !VALID_LANGS.includes(options.lang)) {
        console.error(`Unknown language profile "${options.lang}". Valid options: ${VALID_LANGS.join(', ')}`);
        process.exit(1);
      }
      if (options.lang) config.lang = options.lang;

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

      if (options.showScenarios) {
        for (const rule of rules) {
          const scenarios = generateScenarios([rule]);
          const truncated = rule.text.length > 60 ? rule.text.substring(0, 57) + '...' : rule.text;
          console.log(chalk.bold(`\n[${rule.severity.toUpperCase()}/${rule.category}] ${truncated}`));
          if (scenarios.length === 0) {
            console.log(chalk.gray('  (no scenarios generated)'));
          } else {
            for (const scenario of scenarios) {
              console.log(chalk.cyan(`  Scenario: ${scenario.title}`));
              console.log(chalk.gray(`  Prompt:   ${scenario.prompt.length > 120 ? scenario.prompt.substring(0, 117) + '...' : scenario.prompt}`));
            }
          }
        }
        console.log(`\n${rules.length} rule(s) total`);
        return;
      }

      if (options.explain) {
        for (const rule of rules) {
          const badge = `[${rule.severity.toUpperCase()}/${rule.category}]`;
          console.log(chalk.bold(`\n${badge}`));
          console.log(chalk.white(`  Rule:    ${rule.text}`));
          console.log(chalk.gray(`  Source:  ${path.basename(rule.sourceFile)}:${rule.lineNumber ?? '?'}`));
          if (rule.assertions.length > 0) {
            console.log(chalk.cyan(`  Checks:`));
            for (const a of rule.assertions) {
              const detail = Object.entries(a)
                .filter(([k]) => k !== 'type')
                .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
                .join(', ');
              console.log(chalk.gray(`    ${a.type}${detail ? ' — ' + detail : ''}`));
            }
          }
        }
        console.log(`\n${rules.length} testable rule(s) shown with extraction detail`);
        return;
      }

      console.table(rules.map(r => ({
        Source: path.basename(r.sourceFile),
        Category: r.category,
        Severity: r.severity,
        Testable: r.testable,
        Rule: r.text.length > 50 ? r.text.substring(0, 47) + '...' : r.text
      })));

      const unverifiable = allRules.filter(r => !r.testable && r.unverifiableReason && r.unverifiableReason !== 'informational');
      if (unverifiable.length > 0) {
        console.log(chalk.yellow(`\n${unverifiable.length} unverifiable rule(s) detected (excluded from testing):`));
        for (const r of unverifiable) {
          console.log(chalk.gray(`  • ${r.text.slice(0, 80)}${r.text.length > 80 ? '…' : ''}`));
          console.log(chalk.dim(`    Reason: ${r.unverifiableReason}`));
        }
        console.log(chalk.dim('\n  Tip: Rewrite as concrete, measurable constraints to make them testable.'));
      }
    });
}
