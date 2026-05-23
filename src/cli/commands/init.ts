import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';

export function register(program: Command): void {
  program
    .command('init [dir]')
    .description('Initialize ruleprobe config')
    .option('--from-claude', 'Auto-detect instruction files (CLAUDE.md, AGENTS.md, .cursor/rules, etc.) from the target directory')
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
        provider: "mock",
        instructionFiles,
        reportDir: ".ruleprobe",
        failBelow: 70,
        keepSandbox: false
      }, null, 2));
      console.log(chalk.green(`Initialized ${configPath} with minimal config`));
    });
}
