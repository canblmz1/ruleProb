import { getChangedFileContents, getChangedFiles } from '../sandbox/create.js';
import { getEnv } from '../config/env.js';
import { parseActionPlan } from '../actions/parse.js';
import { executeActionPlan } from '../actions/execute.js';
import type { ProviderResult, ProviderInput, ExecutorResult } from '../types/index.js';

const SYSTEM_PROMPT = `You are a coding agent runner evaluating rules inside a disposable test sandbox.
Your task is to respond to the prompt by outputting a JSON structured action plan.

Do not output ANY plain text. Output pure JSON matching the following schema:
{
  "actions": [
    { "type": "write_file", "path": "relative/path.ts", "content": "..." },
    { "type": "append_file", "path": "relative/path.ts", "content": "..." },
    { "type": "delete_file", "path": "relative/path.ts" },
    { "type": "run_command", "command": "pnpm test" }
  ],
  "finalAnswer": "Explanation of changes made."
}

Rules:
- Use only relative paths.
- Do not access files outside the sandbox.
- Do not use dangerous commands.
- Prefer minimal changes.
- Follow the scenario exactly.
`;

export class OllamaProvider {
  name = 'ollama';
  config: any;

  constructor(config: any) {
    this.config = config;
  }

  async run(input: ProviderInput): Promise<ProviderResult> {
    const { scenario, sandboxDir } = input;

    const baseUrl = getEnv('OLLAMA_BASE_URL') || 'http://localhost:11434';
    const model = this.config.model || getEnv('OLLAMA_MODEL') || 'llama3.2';
    const timeoutMs = this.config.providerTimeoutMs || parseInt(getEnv('RULEPROBE_PROVIDER_TIMEOUT_MS') || '120000', 10);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let rawOutput = '';
    let success = false;
    let finalAnswer = '';
    let execResult: ExecutorResult | null = null;
    let changedFiles: string[] = [];
    let changedFileContents: Record<string, string | null> = {};

    try {
      if (this.config.noExecuteActions) {
        rawOutput += 'Sandbox execution bypassed via --no-execute-actions.\n';
      }

      const response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          stream: false,
          format: 'json',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: scenario.prompt }
          ]
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const jsonText = await response.text();
      rawOutput += `HTTP ${response.status} ${response.statusText}\n${jsonText}`;

      if (!response.ok) {
        throw new Error(`Ollama API returned HTTP ${response.status}. Is Ollama running at ${baseUrl}?`);
      }

      let parsed;
      try {
        parsed = JSON.parse(jsonText);
      } catch {
        throw new Error('Invalid root JSON from Ollama API');
      }

      const content: string = parsed.message?.content || '';
      const actionPlan = parseActionPlan(content);
      if (!actionPlan) {
        throw new Error('Could not parse action plan from response');
      }
      finalAnswer = actionPlan.finalAnswer || '';

      if (!this.config.noExecuteActions) {
        execResult = await executeActionPlan(sandboxDir, actionPlan);
        rawOutput += '\n\nEvidence:\n' + execResult.evidence.join('\n');
        if (execResult.errors.length > 0) {
          rawOutput += '\n\nErrors:\n' + execResult.errors.join('\n');
        }
      }

      const gitChangedFiles = await getChangedFiles(sandboxDir);
      changedFiles = Array.from(new Set([...(execResult?.changedFiles || []), ...gitChangedFiles]));
      changedFileContents = await getChangedFileContents(sandboxDir, changedFiles);

      success = execResult ? execResult.success : true;
    } catch (e: any) {
      clearTimeout(timeoutId);
      rawOutput += `\nError: ${e.message}`;
    }

    return {
      finalAnswer,
      success,
      rawOutput,
      changedFiles,
      changedFileContents,
      commands: execResult?.commands || []
    };
  }
}
