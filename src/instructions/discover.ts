import glob from 'fast-glob';
import fs from 'fs-extra';
import { Config } from '../types/index.js';
import { parseFrontmatter, InstructionFrontmatter } from './frontmatter.js';

export interface DiscoveredFile {
  path: string;
  content: string;
  frontmatter?: InstructionFrontmatter;
}

export async function discoverInstructions(config: Config): Promise<DiscoveredFile[]> {
  const patterns = config.instructionFiles || [];

  const files = await glob(patterns, {
    cwd: process.cwd(),
    absolute: true,
    ignore: ['node_modules/**']
  });

  const discovered: DiscoveredFile[] = [];

  for (const filePath of files) {
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      if (!raw.trim()) continue;

      const { frontmatter, body } = parseFrontmatter(raw);
      discovered.push({ path: filePath, content: body || raw, frontmatter });
    } catch {
      console.warn(`Warning: Could not read instruction file ${filePath}`);
    }
  }

  return discovered;
}
