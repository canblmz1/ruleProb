import fs from 'fs-extra';
import path from 'path';
import { execa } from 'execa';
import { Scenario } from '../types/index.js';
import os from 'os';

export async function createSandbox(scenario: Scenario): Promise<string> {
  const tmpDir = os.tmpdir();
  const sandboxDir = path.join(tmpDir, `ruleprobe-sandbox-${scenario.id}-${Date.now()}`);
  
  await fs.ensureDir(sandboxDir);

  for (const [filePath, content] of Object.entries(scenario.sandboxFiles)) {
    const fullPath = path.join(sandboxDir, filePath);
    await fs.ensureDir(path.dirname(fullPath));
    await fs.writeFile(fullPath, content, 'utf-8');
  }

  // Init git to track changes
  try {
    await execa('git', ['init'], { cwd: sandboxDir });
    await execa('git', ['add', '.'], { cwd: sandboxDir });
    await execa('git', [
      '-c', 'user.name=RuleProbe',
      '-c', 'user.email=ruleprobe@example.com',
      'commit',
      '-m', 'Initial commit',
      '--allow-empty',
      '--author=RuleProbe <ruleprobe@example.com>'
    ], { cwd: sandboxDir });
  } catch (e) {
    console.warn("Failed to initialize git in sandbox. Ensure git is installed.");
  }

  return sandboxDir;
}

export async function cleanupSandbox(sandboxDir: string): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await fs.rm(sandboxDir, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 100
      });
      return;
    } catch {
      if (attempt < 2) {
        await new Promise(resolve => setTimeout(resolve, 100 * (attempt + 1)));
      }
    }
  }

  console.warn(`Failed to cleanup sandbox: ${sandboxDir}`);
}

export async function getChangedFiles(sandboxDir: string): Promise<string[]> {
  try {
    const { stdout } = await execa('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: sandboxDir });
    if (!stdout.trim()) return [];

    const changed = new Set<string>();
    for (const line of stdout.split('\n').map(entry => entry.replace(/\r$/, '')).filter(Boolean)) {
      const rawPath = line.slice(3).trim();
      const finalPath = rawPath.includes(' -> ') ? rawPath.split(' -> ').pop() || rawPath : rawPath;
      const normalized = finalPath.replace(/\\/g, '/');
      if (normalized === '.ruleprobe_prompt.txt' || normalized.startsWith('.ruleprobe/')) {
        continue;
      }
      changed.add(normalized);
    }

    return Array.from(changed);
  } catch (e) {
    return [];
  }
}

export async function getChangedFileContents(
  sandboxDir: string,
  changedFiles: string[]
): Promise<Record<string, string | null>> {
  const contents: Record<string, string | null> = {};

  for (const changedFile of changedFiles) {
    const fullPath = path.join(sandboxDir, changedFile);
    try {
      if (await fs.pathExists(fullPath)) {
        contents[changedFile] = await fs.readFile(fullPath, 'utf-8');
      } else {
        contents[changedFile] = null;
      }
    } catch {
      contents[changedFile] = null;
    }
  }

  return contents;
}

// Read the contents of `changedFiles` as they were at HEAD (the seed commit
// produced by createSandbox). Used by reporters to render diff-grounded
// snippets. Returns null for files added after HEAD (no base content) or
// files that cannot be read at HEAD.
export async function getChangedFileContentsAtHead(
  sandboxDir: string,
  changedFiles: string[]
): Promise<Record<string, string | null>> {
  const contents: Record<string, string | null> = {};

  for (const changedFile of changedFiles) {
    try {
      const result = await execa('git', ['show', `HEAD:${changedFile}`], { cwd: sandboxDir, reject: false });
      if (result.exitCode === 0) {
        contents[changedFile] = result.stdout;
      } else {
        contents[changedFile] = null;
      }
    } catch {
      contents[changedFile] = null;
    }
  }

  return contents;
}

// Compute a small unified-diff-like before/after preview for a file. Pure-text,
// no patch parsing — just the leading lines of the after-content with hints
// about lines that were not in the before content.
export function diffGroundedSnippet(beforeContent: string | null, afterContent: string | null, maxLines = 12): string {
  if (typeof afterContent !== 'string') return '(file removed)';
  const beforeSet = new Set(
    typeof beforeContent === 'string'
      ? beforeContent.replace(/\r\n/g, '\n').split('\n')
      : []
  );
  const afterLines = afterContent.replace(/\r\n/g, '\n').split('\n');
  const annotated: string[] = [];
  let shown = 0;
  for (const line of afterLines) {
    if (shown >= maxLines) {
      annotated.push('... (snippet truncated)');
      break;
    }
    if (beforeSet.has(line)) {
      annotated.push(`  ${line}`);
    } else {
      annotated.push(`+ ${line}`);
    }
    shown++;
  }
  if (typeof beforeContent === 'string') {
    const afterSet = new Set(afterLines);
    let shownRemoved = 0;
    for (const line of beforeContent.replace(/\r\n/g, '\n').split('\n')) {
      if (shownRemoved >= 4) break;
      if (line && !afterSet.has(line)) {
        annotated.push(`- ${line}`);
        shownRemoved++;
      }
    }
  }
  return annotated.join('\n');
}
