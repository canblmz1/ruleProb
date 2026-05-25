import fs from 'fs-extra';
import path from 'path';
import yaml from 'js-yaml';
import { Scenario } from '../types/index.js';

export async function loadCustomScenarios(): Promise<Scenario[]> {
  const scenariosPath = path.join(process.cwd(), '.ruleprobe', 'scenarios.yaml');

  if (!(await fs.pathExists(scenariosPath))) {
    return [];
  }

  let raw: string;
  try {
    raw = await fs.readFile(scenariosPath, 'utf-8');
  } catch {
    console.warn('[ruleprobe] scenarios.yaml: could not read file, skipping custom scenarios.');
    return [];
  }

  let parsed: unknown;
  try {
    parsed = yaml.load(raw);
  } catch {
    console.warn('[ruleprobe] scenarios.yaml: invalid YAML, skipping custom scenarios.');
    return [];
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('scenarios' in parsed) ||
    !Array.isArray((parsed as Record<string, unknown>).scenarios)
  ) {
    console.warn('[ruleprobe] scenarios.yaml: missing or invalid "scenarios" array, skipping custom scenarios.');
    return [];
  }

  const rawScenarios = (parsed as Record<string, unknown>).scenarios as unknown[];
  const result: Scenario[] = [];

  for (let i = 0; i < rawScenarios.length; i++) {
    const entry = rawScenarios[i];

    if (typeof entry !== 'object' || entry === null) {
      console.warn(`[ruleprobe] scenarios.yaml: entry[${i}] is not an object, skipping.`);
      continue;
    }

    const e = entry as Record<string, unknown>;

    if (typeof e.id !== 'string' || !e.id) {
      console.warn(`[ruleprobe] scenarios.yaml: entry[${i}] missing required field "id", skipping.`);
      continue;
    }
    if (typeof e.ruleId !== 'string' || !e.ruleId) {
      console.warn(`[ruleprobe] scenarios.yaml: entry[${i}] (id: ${e.id}) missing required field "ruleId", skipping.`);
      continue;
    }
    if (typeof e.title !== 'string' || !e.title) {
      console.warn(`[ruleprobe] scenarios.yaml: entry[${i}] (id: ${e.id}) missing required field "title", skipping.`);
      continue;
    }
    if (typeof e.prompt !== 'string' || !e.prompt) {
      console.warn(`[ruleprobe] scenarios.yaml: entry[${i}] (id: ${e.id}) missing required field "prompt", skipping.`);
      continue;
    }
    if (!Array.isArray(e.expectedAssertions)) {
      console.warn(`[ruleprobe] scenarios.yaml: entry[${i}] (id: ${e.id}) missing required field "expectedAssertions" array, skipping.`);
      continue;
    }

    const sandboxFiles: Record<string, string> = {};
    if (typeof e.sandboxFiles === 'object' && e.sandboxFiles !== null && !Array.isArray(e.sandboxFiles)) {
      for (const [filePath, content] of Object.entries(e.sandboxFiles as Record<string, unknown>)) {
        if (typeof content === 'string') {
          sandboxFiles[filePath] = content;
        }
      }
    }

    result.push({
      id: e.id,
      ruleId: e.ruleId,
      title: e.title,
      prompt: e.prompt,
      sandboxFiles,
      expectedAssertions: e.expectedAssertions as Scenario['expectedAssertions'],
    });
  }

  return result;
}
