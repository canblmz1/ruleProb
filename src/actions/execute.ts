import path from 'path';
import fs from 'fs-extra';
import { execa } from 'execa';
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
      const safeRelativePath = getSafeRelativePath(action.path, sandboxDir);
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

      // Symlink escape guard: parent directory'nin realpath'i sandbox dışına çıkıyor mu?
      // path.resolve() symlink'leri takip etmez; fs.realpath() gerekli.
      if (action.type === 'write_file' || action.type === 'append_file') {
        const parentDir = path.dirname(fullPath);
        let realParent: string;
        let realSandbox: string;
        try {
          realParent = await resolveExistingAncestor(parentDir);
          realSandbox = await fs.realpath(sandboxDir);
        } catch {
          // realpath başarısız olursa path.resolve fallback (mevcut davranış korunur)
          realParent = path.resolve(parentDir);
          realSandbox = path.resolve(sandboxDir);
        }
        if (!realParent.startsWith(realSandbox + path.sep) && realParent !== realSandbox) {
          result.errors.push(`BLOCKED: symlink escape attempt: ${action.path}`);
          result.evidence.push(`- Blocked symlink escape: ${action.path}`);
          result.success = false;
          return;
        }
      }

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
      if (!isCommandAllowed(action.command)) {
        const blk = `BLOCKED: ${action.command}`;
        result.commands.push(blk);
        result.errors.push(`Blocked dangerous command: ${action.command}`);
        result.evidence.push(`- Blocked command: ${action.command} because it is forbidden`);
        result.success = false;
        return;
      }

      try {
        const timeout = parseInt(getEnv('RULEPROBE_ACTION_TIMEOUT_MS') || `${DEFAULT_ACTION_TIMEOUT_MS}`, 10);
        const [cmd, ...args] = action.command.trim().split(/\s+/);
        await execa(cmd, args, { shell: false, cwd: sandboxDir, timeout, reject: false });
        result.commands.push(action.command);
        result.evidence.push(`- Ran allowed command: ${action.command}`);
      } catch (err: any) {
        result.commands.push(action.command);
        result.evidence.push(`- Ran allowed command (failed execution): ${action.command}`);
      }
    }
  } catch (err: any) {
    result.errors.push(`Error executing ${action.type}: ${err.message}`);
    result.success = false;
  }
}

function getSafeRelativePath(requestedPath: string, sandboxDir?: string): string | null {
  if (path.isAbsolute(requestedPath)) return null;
  const normalized = path.normalize(requestedPath);
  if (normalized.startsWith('..') || normalized.startsWith('/') || normalized.startsWith('\\')) {
    return null;
  }
  // Defense-in-depth: if sandboxDir is provided, verify the resolved path stays inside it.
  if (sandboxDir) {
    const resolvedFull = path.resolve(sandboxDir, normalized);
    const resolvedSandbox = path.resolve(sandboxDir);
    if (!resolvedFull.startsWith(resolvedSandbox + path.sep) && resolvedFull !== resolvedSandbox) {
      return null;
    }
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

/**
 * Var olan en yakın ancestor dizini bul ve realpath'ini döndür.
 * Parent henüz yoksa (ensureDir öncesi) create edilecek, o yüzden yukarı çıkarız.
 */
async function resolveExistingAncestor(dir: string): Promise<string> {
  let current = dir;
  while (true) {
    if (await fs.pathExists(current)) {
      return await fs.realpath(current);
    }
    const parent = path.dirname(current);
    if (parent === current) break; // filesystem root
    current = parent;
  }
  return dir;
}

// Reject any command containing shell metacharacters before allowlist/denylist checks.
// This prevents injection via `pnpm test; rm -rf /`, `pnpm test && curl x`, etc.
// Note: ^ is a metacharacter in cmd.exe (Windows). Including it as defense-in-depth
// even though shell:false is used by execa (which already prevents shell injection).
const SHELL_OPERATOR_REGEX = /[;&|`$><(){}[\]!\\^]/;

// Defense-in-depth deny list for known destructive command names.
const FORBIDDEN_CMD_REGEX = /\b(rm|sudo|curl|wget|bash|sh|powershell|pwsh|cmd|chmod|chown|mkfs|dd|nc|netcat|ssh|scp|git\s+push|git\s+commit|git\s+reset|git\s+clean|git\s+rm|git\s+checkout|pnpm\s+publish|npm\s+publish|yarn\s+publish|bun\s+publish|pnpm\s+add|npm\s+install|yarn\s+add|bun\s+install)\b/;

function isCommandAllowed(command: string): boolean {
  // Block shell metacharacters first — prevents operator-chained injection
  if (SHELL_OPERATOR_REGEX.test(command)) {
    return false;
  }

  // Deny list for destructive command names
  if (FORBIDDEN_CMD_REGEX.test(command)) {
    return false;
  }

  // Strict allow list: only known safe command prefixes
  const allowList = [
    /^pnpm test\b/,
    /^pnpm typecheck\b/,
    /^pnpm build\b/,
    /^pnpm lint\b/,
    /^vitest\b/,
    /^npm test\b/,
    /^npm run test\b/,
    /^npm run build\b/,
    /^yarn test\b/
  ];

  return allowList.some(regex => regex.test(command.trim()));
}
