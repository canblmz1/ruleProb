import fs from 'fs-extra';
import path from 'path';
import yaml from 'js-yaml';

const DEFAULT_WEIGHTS: Record<string, number> = { high: 3, medium: 2, low: 1 };

export async function loadSeverityWeights(): Promise<Record<string, number>> {
  const weightsPath = path.join(process.cwd(), '.ruleprobe', 'weights.yaml');

  if (!(await fs.pathExists(weightsPath))) {
    return { ...DEFAULT_WEIGHTS };
  }

  let raw: string;
  try {
    raw = await fs.readFile(weightsPath, 'utf-8');
  } catch {
    console.warn('[ruleprobe] weights.yaml: could not read file, using defaults.');
    return { ...DEFAULT_WEIGHTS };
  }

  let parsed: unknown;
  try {
    parsed = yaml.load(raw);
  } catch {
    console.warn('[ruleprobe] weights.yaml: invalid YAML, using defaults.');
    return { ...DEFAULT_WEIGHTS };
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('severity' in parsed) ||
    typeof (parsed as Record<string, unknown>).severity !== 'object' ||
    (parsed as Record<string, unknown>).severity === null
  ) {
    console.warn('[ruleprobe] weights.yaml: missing or invalid "severity" key, using defaults.');
    return { ...DEFAULT_WEIGHTS };
  }

  const severityBlock = (parsed as Record<string, unknown>).severity as Record<string, unknown>;
  const merged: Record<string, number> = { ...DEFAULT_WEIGHTS };
  let hasInvalid = false;

  for (const [key, value] of Object.entries(severityBlock)) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      console.warn(`[ruleprobe] weights.yaml: severity.${key} is not a positive number (got ${JSON.stringify(value)}), skipping.`);
      hasInvalid = true;
      continue;
    }
    merged[key] = value;
  }

  if (hasInvalid) {
    console.warn('[ruleprobe] weights.yaml: some invalid values were ignored, defaults used for those keys.');
  }

  return merged;
}
