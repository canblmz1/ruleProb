import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs-extra';
import { listPacks, getPack } from '../../packs/registry.js';

export function register(program: Command): void {
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
}
