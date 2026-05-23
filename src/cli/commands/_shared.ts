import path from 'path';
import fs from 'fs-extra';
import { Config } from '../../types/index.js';
import { discoverInstructions } from '../../instructions/discover.js';

export async function loadInstructionFilesForReadOnlyCommand(
  target: string | undefined,
  config: Config
): Promise<{ path: string; content: string }[]> {
  if (!target) return discoverInstructions(config);

  const resolved = path.resolve(target);
  if (await fs.pathExists(resolved)) {
    const stat = await fs.stat(resolved);
    if (stat.isFile()) {
      return [{ path: resolved, content: await fs.readFile(resolved, 'utf-8') }];
    }
  }

  process.chdir(target);
  return discoverInstructions(config);
}
