import glob from 'fast-glob';
import fs from 'fs-extra';
import { Config } from '../types/index.js';

export interface DiscoveredFile {
  path: string;
  content: string;
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
      const content = await fs.readFile(filePath, 'utf-8');
      if (content.trim()) {
        discovered.push({ path: filePath, content });
      }
    } catch (error) {
      console.warn(`Warning: Could not read instruction file ${filePath}`);
    }
  }

  return discovered;
}
