import path from 'path';
import fs from 'fs-extra';
import { execa } from 'execa';
import { parse as shellParse } from 'shell-quote';
import { ActionPlan, ExecutorResult, AgentAction } from '../types/index.js';
import { getEnv } from '../config/env.js';

const DEFAULT_ACTION_TIMEOUT_MS = 3000;

export async function executeActionPlan(sandboxDir: string, plan: ActionPlan): Promise<ExecutorResult> {
  const result: ExecutorResult = {
    success: true,
    changedFiles: [],
    commands: [],
    errors: [],
    evidence: []
  };

  for (const action of plan.actions) {
    await executeSingleAction(sandboxDir, action, result);
  }

  return result;
}

async function executeSingleAction(sandboxDir: string, action: AgentAction, result: ExecutorResult) {
  try {
    if (action.type === 'write_file' || action.type === 'append_file' || action.type === 'delete_file') {
      const safeRelativePath = getSafeRelativePath(action.path);
      if (!safeRelativePath) {
        result.errors.push(`BLOCKED: path traversal or unsafe absolute path: ${action.path}`);
        result.evidence.push(`- Blocked risky path: ${action.path}`);
        result.success = false;
        return;
      }

      if (isForbiddenPath(safeRelativePath)) {
        result.errors.push(`BLOCKED: forbidden directory write: ${action.path}`);
        result.evidence.push(`- Blocked write to forbidden path: ${action.path}`);
        result.success = false;
        return;
      }

      const fullPath = path.join(sandboxDir, safeRelativePath);

      if (action.type === 'write_file') {
        await fs.ensureDir(path.dirname(fullPath));
        await fs.writeFile(fullPath, action.content, 'utf-8');
        result.changedFiles.push(safeRelativePath);
        result.evidence.push(`- Applied action: write_file ${safeRelativePath}`);
      } else if (action.type === 'append_file') {
        await fs.ensureDir(path.dirname(fullPath));
        await fs.appendFile(fullPath, action.content, 'utf-8');
        result.changedFiles.push(safeRelativePath);
        result.evidence.push(`- Applied action: append_file ${safeRelativePath}`);
      } else if (action.type === 'delete_file') {
        if (await fs.pathExists(fullPath)) {
          await fs.remove(fullPath);
          result.changedFiles.push(safeRelativePath);
          result.evidence.push(`- Applied action: delete_file ${safeRelativePath}`);
        } else {
          result.evidence.push(`- Ignored delete_file, path not found: ${safeRelativePath}`);
        }
      }

    } else if (action.type === 'run_command') {
      const parsedCommand = parseAndValidateAllowedCommand(action.command);
      if (!parsedCommand) {
        const blk = `BLOCKED: ${action.command}`;
        result.commands.push(blk);
        result.errors.push(`Blocked dangerous command: ${action.command}`);
        result.evidence.push(`- Blocked command: ${action.command} because it is forbidden`);
        result.success = false;
        return;
      }

      try {
        const timeout = parseInt(getEnv('RULEPROBE_ACTION_TIMEOUT_MS') || `${DEFAULT_ACTION_TIMEOUT_MS}`, 10);
        await execa(parsedCommand.file, parsedCommand.args, { shell: false, cwd: sandboxDir, timeout, reject: false });
        result.commands.push(action.command);
        result.evidence.push(`- Ran allowed command: ${action.command}`);
      } catch (err: any) {
        // It failed to run, but we still log it
        result.commands.push(action.command);
        result.evidence.push(`- Ran allowed command (failed execution): ${action.command}`);
      }
    }
  } catch (err: any) {
    result.errors.push(`Error executing ${action.type}: ${err.message}`);
    result.success = false;
  }
}

function getSafeRelativePath(requestedPath: string): string | null {
  if (path.isAbsolute(requestedPath)) return null;
  const normalized = path.normalize(requestedPath);
  if (normalized.startsWith('..') || normalized.startsWith('/') || normalized.startsWith('\\')) {
    return null;
  }
  return normalized;
}

function isForbiddenPath(relPath: string): boolean {
  const parts = relPath.split(path.sep);
  if (parts.includes('node_modules') || parts.includes('.git') || parts.includes('.ruleprobe')) {
    return true;
  }
  return false;
}

// Defense-in-depth deny list. Even if structured allow-listing blocks unknown
// commands, reject obviously dangerous tool names up front.
const FORBIDDEN_CMD_REGEX = /\b(rm|sudo|curl|wget|bash|sh|powershell|pwsh|cmd|chmod|chown|mkfs|dd|nc|netcat|ssh|scp|git|pnpm\s+publish|npm\s+publish|yarn\s+publish|bun\s+publish|pnpm\s+add|npm\s+install|yarn\s+add|bun\s+install)\b/;

function parseAndValidateAllowedCommand(command: string): { file: string; args: string[] } | null {
  const trimmed = command.trim();
  if (!trimmed || FORBIDDEN_CMD_REGEX.test(trimmed)) {
    return null;
  }

  const parsed = shellParse(trimmed);
  const argv: string[] = [];
  for (const token of parsed) {
    if (typeof token !== 'string') return null;
    argv.push(token);
  }

  if (argv.length === 0) return null;
  const [file, ...args] = argv;

  // Strict structured allow list
  const isAllowed =
    (file === 'pnpm' && ['test', 'typecheck', 'build', 'lint'].includes(args[0] || '')) ||
    (file === 'vitest') ||
    (file === 'npm' && ((args[0] === 'test') || (args[0] === 'run' && (args[1] === 'test' || args[1] === 'build')))) ||
    (file === 'yarn' && args[0] === 'test');

  if (!isAllowed) return null;
  return { file, args };
}
