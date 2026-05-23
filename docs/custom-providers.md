# Custom Providers

RuleProbe supports custom providers via the `Provider` interface. A provider receives a scenario and sandbox directory, runs an AI agent, and returns a structured result.

## Install the package

```bash
npm install ruleprobe-ai
```

## Implement the interface

```typescript
import type { Provider, ProviderInput, ProviderResult } from 'ruleprobe-ai';

export class MyCustomProvider implements Provider {
  name = 'my-provider';

  async run(input: ProviderInput): Promise<ProviderResult> {
    const { scenario } = input;

    // Call your AI model here
    const response = await myAiClient.complete(scenario.prompt);

    return {
      kind: 'real',
      finalAnswer: response.text,
      changedFiles: [],
      changedFileContents: {},
      commands: [],
      rawOutput: response.text,
      success: true
    };
  }
}
```

## Use it programmatically

```typescript
import { loadConfig, discoverInstructions, extractRules, generateScenarios, createSandbox, cleanupSandbox, evaluateResult } from 'ruleprobe-ai';
import { MyCustomProvider } from './my-provider.js';

const config = await loadConfig('.');
const files = await discoverInstructions(config);
const rules = extractRules(files, config);
const scenarios = generateScenarios(rules);
const provider = new MyCustomProvider();

for (const scenario of scenarios) {
  const sandbox = await createSandbox(scenario);
  try {
    const result = await provider.run({ scenario, sandboxDir: sandbox });
    const evaluation = await evaluateResult(scenario, result);
    console.log(evaluation.status, evaluation.score);
  } finally {
    await cleanupSandbox(sandbox);
  }
}
```

## ProviderResult fields

| Field | Type | Description |
|-------|------|-------------|
| `kind` | `'real' \| 'dry-run'` | `'real'` for actual agent runs, `'dry-run'` to skip evaluation |
| `finalAnswer` | `string` | The agent's final text response |
| `changedFiles` | `string[]` | Relative paths of files the agent changed |
| `changedFileContents` | `Record<string, string \| null>` | File contents after change |
| `commands` | `string[]` | Shell commands the agent ran |
| `rawOutput` | `string` | Full raw output for evidence |
| `success` | `boolean` | Whether the agent completed without errors |

## Example: Claude API provider

```typescript
import { Anthropic } from '@anthropic-ai/sdk';
import type { Provider, ProviderInput, ProviderResult } from 'ruleprobe-ai';
import { normalizeProviderResult } from 'ruleprobe-ai';

export class ClaudeApiProvider implements Provider {
  name = 'claude-api';
  private client: Anthropic;

  constructor(apiKey?: string) {
    this.client = new Anthropic({ apiKey });
  }

  async run(input: ProviderInput): Promise<ProviderResult> {
    const { scenario } = input;

    const response = await this.client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: scenario.prompt
        }
      ]
    });

    const finalAnswer = response.content
      .filter(block => block.type === 'text')
      .map(block => (block as any).text)
      .join('\n');

    return normalizeProviderResult({
      kind: 'real',
      finalAnswer,
      success: true,
      rawOutput: JSON.stringify(response, null, 2)
    });
  }
}
```

## TypeScript support

The `Provider` interface is fully typed:

```typescript
// Automatically type-checks against the interface
class MyProvider implements Provider {
  name: string;  // required string
  run(input: ProviderInput): Promise<ProviderResult>  // required method
}
```

## Utility functions

Use `normalizeProviderResult()` to ensure your result meets the interface requirements:

```typescript
import { normalizeProviderResult } from 'ruleprobe-ai';

// Partial results are filled with defaults
const result = normalizeProviderResult({
  finalAnswer: "Done",
  success: true
  // changedFiles, commands, etc. default to []
});
```

## Error handling

If your provider encounters an error, return a failure result:

```typescript
async run(input: ProviderInput): Promise<ProviderResult> {
  try {
    const response = await this.callModel(input.scenario.prompt);
    return {
      kind: 'real',
      finalAnswer: response.text,
      success: true,
      changedFiles: [],
      changedFileContents: {},
      commands: [],
      rawOutput: response.text
    };
  } catch (error) {
    return {
      kind: 'real',
      finalAnswer: '',
      success: false,
      changedFiles: [],
      changedFileContents: {},
      commands: [],
      rawOutput: error.message
    };
  }
}
```

## Next steps

Once you have a custom provider:

1. Add it to your project's configuration or directly instantiate it
2. Pass it to the evaluation loop alongside `generateScenarios()` and `evaluateResult()`
3. Customize scenario data extraction and command parsing as needed for your agent's output format

For questions or issues, check [CONTRIBUTING.md](../CONTRIBUTING.md) or open an issue on GitHub.
