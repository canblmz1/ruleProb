import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';

const CI_WORKFLOW = `name: RuleProbe Compliance

on:
  push:
    branches: [main, master]
  pull_request:

permissions:
  contents: read
  pull-requests: write

jobs:
  ruleprobe:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: canblmz1/ruleProb@v1.6.0
        with:
          dir: .
          provider: mock
          fail-below: '70'
          comment: 'true'
`;

export function register(program: Command): void {
  program
    .command('init [dir]')
    .description('Initialize ruleprobe config')
    .option('--from-claude', 'Auto-detect instruction files (CLAUDE.md, AGENTS.md, .cursor/rules, etc.) from the target directory')
    .option('--provider <name>', 'Default provider for the generated config (default: mock)', 'mock')
    .option('--with-ci', 'Generate a GitHub Actions workflow file in the target directory')
    .action(async (dir: string | undefined, options) => {
      const targetDir = dir ? path.resolve(dir) : process.cwd();
      const defaultPatterns = ["CLAUDE.md", "AGENTS.md", ".cursor/rules/*.mdc", ".github/copilot-instructions.md"];

      let instructionFiles = defaultPatterns;
      if (options.fromClaude) {
        const glob = await import('fast-glob');
        const found = await glob.default(defaultPatterns, { cwd: targetDir, ignore: ['node_modules/**'] });
        if (found.length > 0) {
          instructionFiles = found;
          console.log(chalk.green(`Detected ${found.length} instruction file(s): ${found.join(', ')}`));
        } else {
          console.log(chalk.yellow('No instruction files detected; using default patterns.'));
        }
      }

      const configPath = path.join(targetDir, 'ruleprobe.config.json');
      await fs.writeFile(configPath, JSON.stringify({
        provider: options.provider,
        instructionFiles,
        reportDir: ".ruleprobe",
        failBelow: 70,
        keepSandbox: false
      }, null, 2));
      console.log(chalk.green(`Initialized ${configPath} with minimal config`));

      if (options.withCi) {
        const workflowDir = path.join(targetDir, '.github', 'workflows');
        await fs.ensureDir(workflowDir);
        const workflowPath = path.join(workflowDir, 'ruleprobe-compliance.yml');
        await fs.writeFile(workflowPath, CI_WORKFLOW, 'utf-8');
        console.log(chalk.green(`Created ${workflowPath}`));
        console.log(chalk.dim(`  Edit the workflow to set your preferred provider and fail-below threshold.`));
      }

      console.log(chalk.dim(`\n  Next steps:`));
      console.log(chalk.dim(`  1. ruleprobe list-rules ${dir || '.'}`));
      console.log(chalk.dim(`  2. ruleprobe run ${dir || '.'} --provider mock`));
    });
}
