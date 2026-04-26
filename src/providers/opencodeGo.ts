import { ProviderInput, ProviderResult, Config } from '../types/index.js';
import { parseActionPlan } from '../actions/parse.js';
import { executeActionPlan } from '../actions/execute.js';
import { getChangedFileContents, getChangedFiles } from '../sandbox/create.js';
import { getEnv } from '../config/env.js';

// OpenCode Go runtime/extraction provider.
//
// Documented surface (https://opencode.ai/docs/go/):
//   - OpenAI-compatible Zen endpoint: https://opencode.ai/zen/go/v1/chat/completions
//   - Model id format:                opencode-go/<model-id>     (e.g. opencode-go/kimi-k2.6)
//
// What is NOT in OpenCode docs at the time of writing:
//   - Explicit auth header format. We follow the universal OpenAI-compatible
//     convention (`Authorization: Bearer <key>`), since OpenCode Zen exposes
//     an OpenAI-compatible v1 endpoint.
//   - Documented default model. RuleProbe therefore requires the user to set
//     OPENCODE_GO_MODEL explicitly so the integration cannot silently invent a
//     vendor/model that does not exist on the user's plan.
export class OpenCodeGoProvider {
  name = 'opencode-go';
  config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  async run(input: ProviderInput): Promise<ProviderResult> {
    const { scenario, sandboxDir } = input;

    const apiKey = getEnv('OPENCODE_GO_API_KEY');
    const model = this.config.model || getEnv('OPENCODE_GO_MODEL');
    const baseUrl = getEnv('OPENCODE_GO_BASE_URL') || 'https://opencode.ai/zen/go/v1';
    const timeoutMs = this.config.providerTimeoutMs
      || parseInt(getEnv('OPENCODE_GO_TIMEOUT_MS') || getEnv('RULEPROBE_PROVIDER_TIMEOUT_MS') || '60000', 10);

    if ((this.config as any).debugExtractor) {
      console.log('\n--- OPENCODE_GO PROVIDER DEBUG ---');
      console.log(`OpenCode Go API key visible: ${apiKey ? 'yes' : 'no'}`);
      console.log(`OpenCode Go model: ${model || '(not set)'}`);
      console.log(`OpenCode Go base URL: ${baseUrl}`);
      console.log(`OpenCode Go timeout (ms): ${timeoutMs}`);
      console.log('-----------------------------------\n');
    }

    if (!apiKey) {
      return {
        finalAnswer: '',
        changedFiles: [],
        changedFileContents: {},
        commands: [],
        rawOutput: 'OpenCode Go provider requires OPENCODE_GO_API_KEY. Subscribe to OpenCode Go (https://opencode.ai/docs/go/) and set OPENCODE_GO_API_KEY in your environment or .env file.',
        success: false
      };
    }

    if (!model) {
      return {
        finalAnswer: '',
        changedFiles: [],
        changedFileContents: {},
        commands: [],
        rawOutput: 'OpenCode Go provider requires OPENCODE_GO_MODEL or --model. RuleProbe does not assume a default OpenCode Go model since model availability depends on your subscription. Pass e.g. --model opencode-go/kimi-k2.6.',
        success: false
      };
    }

    let systemPrompt = 'You are being tested for repository instruction compliance. Follow the repository rules exactly.';
    if (!this.config.noExecuteActions) {
      systemPrompt = `You are being tested in a sandbox.
Do not return prose first.
Return only valid JSON matching this schema:
{
  "actions": [
    { "type": "write_file", "path": "relative/path.ts", "content": "..." },
    { "type": "run_command", "command": "pnpm test" }
  ],
  "finalAnswer": "..."
}

Rules:
- Use only relative paths.
- Do not access files outside the sandbox.
- Do not use dangerous commands.
- Prefer minimal changes.
- Follow repository instructions exactly.`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    let requestSent = false;
    let responseReceived = false;
    let parseSucceeded = false;
    let usedFallback = false;

    try {
      requestSent = true;
      const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'X-Title': 'RuleProbe'
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: scenario.prompt }
          ],
          temperature: 0.2
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      responseReceived = true;

      const jsonText = sanitizeProviderText(await response.text());
      let rawOutput = `HTTP ${response.status} ${response.statusText}\n${jsonText}`;
      let finalAnswer = '';

      if (response.ok) {
        try {
          const parsed = JSON.parse(jsonText);
          finalAnswer = parsed.choices?.[0]?.message?.content || '';
          parseSucceeded = !!finalAnswer;
        } catch {
          parseSucceeded = false;
        }
      }

      const providerResult: ProviderResult = {
        finalAnswer,
        changedFiles: [],
        changedFileContents: {},
        commands: [],
        rawOutput,
        success: response.ok
      };

      if (!this.config.noExecuteActions && finalAnswer) {
        const plan = parseActionPlan(finalAnswer);
        if (plan) {
          const execResult = await executeActionPlan(sandboxDir, plan);
          providerResult.finalAnswer = plan.finalAnswer || finalAnswer;
          providerResult.commands = execResult.commands;

          const gitChangedFiles = await getChangedFiles(sandboxDir);
          providerResult.changedFiles = Array.from(new Set([...execResult.changedFiles, ...gitChangedFiles]));
          providerResult.changedFileContents = await getChangedFileContents(sandboxDir, providerResult.changedFiles);

          if (execResult.evidence.length > 0) {
            providerResult.rawOutput += '\n\nEvidence:\n' + execResult.evidence.join('\n');
          }
          if (execResult.errors.length > 0) {
            providerResult.success = false;
            providerResult.rawOutput += '\n\nErrors:\n' + execResult.errors.join('\n');
          }
        } else {
          usedFallback = true;
          providerResult.success = false;
          providerResult.rawOutput += '\n\nErrors:\nCould not parse structured action plan from OpenCode Go response.';
        }
      }

      if ((this.config as any).debugExtractor) {
        console.log(`OpenCode Go request sent: ${requestSent ? 'yes' : 'no'}`);
        console.log(`OpenCode Go response received: ${responseReceived ? 'yes' : 'no'}`);
        console.log(`OpenCode Go parse success: ${parseSucceeded ? 'yes' : 'no'}`);
        console.log(`OpenCode Go fallback used: ${usedFallback ? 'yes' : 'no'}`);
      }

      return providerResult;
    } catch (e: any) {
      clearTimeout(timeoutId);
      return {
        finalAnswer: '',
        changedFiles: [],
        changedFileContents: {},
        commands: [],
        rawOutput: `OpenCode Go fetch failed: ${e?.message || 'Unknown error'}`,
        success: false
      };
    }
  }
}

function sanitizeProviderText(text: string): string {
  return text
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, '[REDACTED_KEY]')
    .replace(/(OPENCODE_GO_API_KEY|OPENCODE_API_KEY)\s*=?\s*['"]?[A-Za-z0-9_-]+['"]?/g, '$1=[REDACTED]');
}
