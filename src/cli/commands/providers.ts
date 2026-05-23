import { Command } from 'commander';
import { renderProviderCapabilityMarkdown, providerCapabilities } from '../../providers/capabilities.js';

export function register(program: Command): void {
  program
    .command('providers')
    .description('Show provider capability matrix')
    .option('--json', 'Output provider matrix as JSON')
    .action((options) => {
      if (options.json) {
        console.log(JSON.stringify(providerCapabilities, null, 2));
      } else {
        console.log(renderProviderCapabilityMarkdown());
      }
    });
}
