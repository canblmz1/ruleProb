import { ProviderInput, ProviderResult, Config } from '../types/index.js';
import { execa } from 'execa';
import { writeFileSync } from 'fs';
import path from 'path';
import { getChangedFileContents, getChangedFiles } from '../sandbox/create.js';

export class ClaudeCodeProvider {
  name = 'claude-code';
  config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  async run(input: ProviderInput): Promise<ProviderResult> {
    const { scenario, sandboxDir } = input;

    try {
      await execa('claude', ['--version']);
    } catch {
      return {
        finalAnswer: 'Claude Code provider requires the claude CLI to be installed and authenticated.',
        changedFiles: [],
        changedFileContents: {},
        commands: [],
        rawOutput: 'Claude CLI was not found on PATH.',
        success: false
      };
    }

    const { getEnv } = await import('../config/env.js');
    const timeoutMs = this.config.providerTimeoutMs || parseInt(getEnv('RULEPROBE_PROVIDER_TIMEOUT_MS') || '120000', 10);

    const systemPrompt = `You are running inside a disposable RuleProbe sandbox.
Follow the repository instructions exactly.
Do not access files outside this repository.
Do not run destructive commands.
Complete the task by editing files only inside this sandbox.
At the end, summarize changed files and commands run.

Scenario:
${scenario.prompt}`;

    const promptPath = path.join(sandboxDir, '.ruleprobe_prompt.txt');
    writeFileSync(promptPath, systemPrompt, 'utf-8');

    let stdoutData = '';
    let stderrData = '';
    let success = false;

    try {
      const child = await execa('claude', ['-p', systemPrompt], {
        cwd: sandboxDir,
        timeout: timeoutMs,
        shell: false,
        env: { ...process.env },
        reject: false
      });

      stdoutData = child.stdout;
      stderrData = child.stderr;
      success = child.exitCode === 0;
    } catch (e: any) {
      stderrData += '\nExecution crashed or timed out: ' + e.message;
      success = false;
    }

    const rawOutput = sanitizeOutput(stdoutData + '\n' + stderrData);
    const changedFiles = await getChangedFiles(sandboxDir);
    const changedFileContents = await getChangedFileContents(sandboxDir, changedFiles);
    const commands = inferCommands(rawOutput);

    return {
      finalAnswer: rawOutput,
      changedFiles,
      changedFileContents,
      commands,
      rawOutput,
      success
    };
  }
}

function sanitizeOutput(text: string): string {
  if (!text) return '';
  return text
    .replace(/sk-or-v1-[A-Za-z0-9_-]+/g, '[REDACTED_OPENROUTER_KEY]')
    .replace(/sk-ant-[A-Za-z0-9_-]+/g, '[REDACTED_ANTHROPIC_KEY]')
    .replace(/(OPENROUTER_API_KEY|ANTHROPIC_API_KEY|GEMINI_API_KEY|OPENAI_API_KEY)\s*=?\s*['"]?[A-Za-z0-9_-]+['"]?/g, '$1=[REDACTED]');
}

// Extract commands the claude-code CLI likely ran by parsing the transcript.
// claude-code is not an action-bridge provider, so this is INFERENCE rather
// than direct evidence. Reports tag these as inferred.
//
// Sources we look at:
//   1. Lines that look like shell prompts:    "$ pnpm test"
//   2. Tool-use markers:                       "Running: pnpm test --watch"
//   3. Bare allowlisted command tokens:        "pnpm test"
//
// We deliberately bound the allowlist to the same commands the action
// executor permits, so the comparison is honest.
function inferCommands(text: string): string[] {
  const found = new Set<string>();
  if (!text) return [];

  const allowedHead = /^(pnpm|npm|yarn|bun|npx|node|vitest|playwright|tsc|biome|eslint|turbo|nx|cargo|go|python|pytest|bazel)\b/;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    // (1) shell-prompt style
    const shellMatch = line.match(/^[$#>]\s+(.+)$/);
    if (shellMatch && allowedHead.test(shellMatch[1])) {
      found.add(shellMatch[1].trim());
      continue;
    }

    // (2) tool-use / running prefix
    const runMatch = line.match(/^(?:Running|Executing|Ran|Will run):\s*(.+)$/i);
    if (runMatch && allowedHead.test(runMatch[1].trim())) {
      found.add(runMatch[1].trim());
      continue;
    }

    // (3) bare allowlisted prefix anywhere in the line
    const inlineRegex = /\b(pnpm|npm|yarn|bun|npx|node|vitest|playwright|tsc|biome|eslint|turbo|nx|cargo|go|python|pytest|bazel)(?:\s+[\w./:-]+)+/g;
    const inlineMatches = line.match(inlineRegex);
    if (inlineMatches) {
      for (const match of inlineMatches) {
        // Filter out things like `pnpm typecheck before final response.` by
        // keeping only the leading run-token sequence
        const cleaned = match.replace(/[.,:;]+$/, '').trim();
        if (cleaned.split(/\s+/).length <= 6) {
          found.add(cleaned);
        }
      }
    }
  }

  return Array.from(found);
}
