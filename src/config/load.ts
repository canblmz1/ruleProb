import fs from 'fs-extra';
import { Config } from '../types/index.js';

export const defaultConfig: Config = {
  provider: "mock",
  instructionFiles: [
    "CLAUDE.md",
    "AGENTS.md",
    ".cursor/rules/*.mdc",
    ".github/copilot-instructions.md"
  ],
  reportDir: ".ruleprobe",
  failBelow: 70,
  keepSandbox: false,
};

export async function loadConfig(configPath?: string): Promise<Config> {
  const targetPath = configPath || "ruleprobe.config.json";
  if (await fs.pathExists(targetPath)) {
    try {
      const userConfig = await fs.readJson(targetPath);
      return { ...defaultConfig, ...userConfig };
    } catch (e) {
      console.warn(`Could not parse config at ${targetPath}, using defaults.`);
    }
  }
  return defaultConfig;
}
