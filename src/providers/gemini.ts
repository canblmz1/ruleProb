import { getChangedFileContents, getChangedFiles } from '../sandbox/create.js';
import { getEnv } from '../config/env.js';
import { parseActionPlan } from '../actions/parse.js';
import { executeActionPlan } from '../actions/execute.js';
import type { ProviderResult, ProviderInput, ExecutorResult } from '../types/index.js';

export class GeminiProvider {
  name = 'gemini';
  config: any;

  constructor(config: any) {
    this.config = config;
  }

  async run(input: ProviderInput): Promise<ProviderResult> {
    const { scenario, sandboxDir } = input;

    const apiKey = getEnv('GEMINI_API_KEY');
    if (!apiKey) {
      return {
        finalAnswer: '',
        changedFiles: [],
        changedFileContents: {},
        commands: [],
        success: false,
        rawOutput: 'Gemini provider requires GEMINI_API_KEY. Set it in your environment or .env file.'
      };
    }

    const model = this.config.model || getEnv('GEMINI_MODEL') || 'gemini-2.5-flash';
    const timeoutMs = this.config.providerTimeoutMs || parseInt(getEnv('RULEPROBE_PROVIDER_TIMEOUT_MS') || '60000', 10);

    const systemPrompt = `You are a coding agent runner evaluating rules inside a disposable test sandbox.
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
        rawOutput += 'Sandbox execution bypassed via --no-execute-actions.\\n';
      }

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: systemPrompt + '\\n\\nPROMPT:\\n' + scenario.prompt
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0,
            responseMimeType: 'application/json'
          }
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const jsonText = await response.text();
      rawOutput += `HTTP ${response.status} ${response.statusText}\n${jsonText}`;

      if (!response.ok) {
        throw new Error(`Gemini API returned HTTP ${response.status}`);
      }

      let direct;
      try {
        direct = JSON.parse(jsonText);
      } catch {
        throw new Error('Invalid root JSON from API');
      }

      let content = direct.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const markdownRegex = /```(?:json)?\s*([\s\S]*?)```/;
      const match = content.match(markdownRegex);
      if (match && match[1]) content = match[1];

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
      rawOutput += `\\nError: ${e.message}`;
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
