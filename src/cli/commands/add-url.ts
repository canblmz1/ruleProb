import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs-extra';
import { fetchRemotePack } from '../../packs/registry.js';

export function register(program: Command): void {
  program
    .command('add-url <url>')
    .description('Add a community rule pack from a remote HTTPS URL (JSON or plain-text lines)')
    .option('--file <path>', 'Target instruction file', 'CLAUDE.md')
    .option('--dry-run', 'Preview rules without writing')
    .action(async (url: string, options) => {
      let pack;
      try {
        pack = await fetchRemotePack(url);
      } catch (err: unknown) {
        console.error(chalk.red(`Failed to load remote pack: ${err instanceof Error ? err.message : String(err)}`));
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
      const header = `\n## ${pack.name} rules (added by ruleprobe add-url)\n`;
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
