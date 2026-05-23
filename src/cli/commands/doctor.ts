import { Command } from 'commander';
import { runDoctor } from '../doctor.js';

export function register(program: Command): void {
  program
    .command('doctor')
    .description('Run local diagnostics for RuleProbe (Node, pnpm, dist, shebang, env keys, .ruleprobe writeability)')
    .option('--json', 'Output diagnostics as JSON for CI integration')
    .action(async (options) => {
      const result = await runDoctor({ cwd: process.cwd(), json: !!options.json });
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      }
      if (result.criticalFailures > 0) process.exit(1);
    });
}
