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

const KNOWN_PROVIDERS = ['mock', 'dry-run', 'gemini', 'openrouter', 'claude-code', 'opencode-go'];

function validateConfig(config: Config): Config {
  if (typeof config.failBelow === 'number' && (config.failBelow < 0 || config.failBelow > 100)) {
    console.warn(`[ruleprobe] config: failBelow must be 0–100, got ${config.failBelow}. Resetting to 70.`);
    config.failBelow = 70;
  }
  if (config.provider && !KNOWN_PROVIDERS.includes(config.provider)) {
    console.warn(`[ruleprobe] config: unknown provider "${config.provider}". Known providers: ${KNOWN_PROVIDERS.join(', ')}.`);
  }
  return config;
}

export async function loadConfig(configPath?: string): Promise<Config> {
  const targetPath = configPath || "ruleprobe.config.json";
  if (await fs.pathExists(targetPath)) {
    try {
      const userConfig = await fs.readJson(targetPath);
      return validateConfig({ ...defaultConfig, ...userConfig });
    } catch (e) {
      console.warn(`Could not parse config at ${targetPath}, using defaults.`);
    }
  }
  return defaultConfig;
}
