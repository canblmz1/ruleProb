import { ProviderInput, ProviderResult } from '../types/index.js';

export class DryRunProvider {
  name = 'dry-run';

  async run(input: ProviderInput): Promise<ProviderResult> {
    const { scenario, sandboxDir } = input;
    
    return {
      finalAnswer: "[DRY RUN] Would execute scenario: " + scenario.title,
      changedFiles: [],
      changedFileContents: {},
      commands: [],
      rawOutput: "Dry run completed without agent execution. Prompt:\n" + scenario.prompt,
      success: true
    };
  }
}
