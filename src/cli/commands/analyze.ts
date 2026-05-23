import { Command } from 'commander';
import { runAnalyze } from '../../analyze/runAnalyze.js';

export function register(program: Command): void {
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
}
