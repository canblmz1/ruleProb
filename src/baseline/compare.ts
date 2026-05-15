import fs from 'fs-extra';
import path from 'path';
import { Config, EvaluationResult } from '../types/index.js';

export interface BaselineEntry {
  scenarioId: string;
  ruleId: string;
  status: EvaluationResult['status'];
  score: number;
  ruleText?: string;
  category?: string;
  severity?: string;
}

export interface BaselineData {
  version: 1;
  createdAt: string;
  results: BaselineEntry[];
}

export interface BaselineDelta {
  newPasses: EvaluationResult[];
  regressions: EvaluationResult[];
  improvements: EvaluationResult[];
  unchanged: EvaluationResult[];
}

const BASELINE_FILE = 'baseline.json';

export function getBaselinePath(config: Config): string {
  return path.join(config.reportDir, BASELINE_FILE);
}

export async function readBaseline(config: Config): Promise<BaselineData | null> {
  const baselinePath = getBaselinePath(config);
  if (!(await fs.pathExists(baselinePath))) {
    return null;
  }
  try {
    const data = await fs.readJson(baselinePath);
    if (!data || typeof data !== 'object' || data.version !== 1 || !Array.isArray(data.results)) {
      return null;
    }
    return data as BaselineData;
  } catch {
    return null;
  }
}

export async function writeBaseline(results: EvaluationResult[], config: Config): Promise<void> {
  const baselinePath = getBaselinePath(config);
  const data: BaselineData = {
    version: 1,
    createdAt: new Date().toISOString(),
    results: results.map(toBaselineEntry)
  };
  await fs.ensureDir(config.reportDir);
  await fs.writeJson(baselinePath, data, { spaces: 2 });
}

export function toBaselineEntry(result: EvaluationResult): BaselineEntry {
  return {
    scenarioId: result.scenarioId,
    ruleId: result.ruleId,
    status: result.status,
    score: result.score,
    ruleText: result.ruleText,
    category: result.category,
    severity: result.severity
  };
}

export function computeBaselineDelta(currentResults: EvaluationResult[], baseline: BaselineData | null): BaselineDelta {
  const delta: BaselineDelta = {
    newPasses: [],
    regressions: [],
    improvements: [],
    unchanged: []
  };

  if (!baseline) {
    return delta;
  }

  const baselineMap = new Map(baseline.results.map(r => [r.scenarioId, r]));

  for (const current of currentResults) {
    const previous = baselineMap.get(current.scenarioId);
    if (!previous) {
      // New scenario not in baseline — treat as new pass if it passes, otherwise regression
      if (current.status === 'PASS') {
        delta.newPasses.push(current);
      } else {
        delta.regressions.push(current);
      }
      continue;
    }

    if (current.status === previous.status && current.score === previous.score) {
      delta.unchanged.push(current);
      continue;
    }

    const previousRank = statusRank(previous.status);
    const currentRank = statusRank(current.status);

    if (currentRank > previousRank) {
      delta.improvements.push(current);
    } else if (currentRank < previousRank) {
      delta.regressions.push(current);
    } else {
      // Same rank but score changed (e.g., PARTIAL with different score)
      if (current.score > previous.score) {
        delta.improvements.push(current);
      } else if (current.score < previous.score) {
        delta.regressions.push(current);
      } else {
        delta.unchanged.push(current);
      }
    }
  }

  return delta;
}

function statusRank(status: EvaluationResult['status']): number {
  switch (status) {
    case 'PASS': return 3;
    case 'PARTIAL': return 2;
    case 'FAIL': return 1;
    case 'SKIPPED': return 0;
  }
}

export function formatBaselineDelta(delta: BaselineDelta): string {
  const lines: string[] = [];
  lines.push(`Baseline Comparison`);
  lines.push(`  New passes:      ${delta.newPasses.length}`);
  lines.push(`  Improvements:    ${delta.improvements.length}`);
  lines.push(`  Unchanged:       ${delta.unchanged.length}`);
  lines.push(`  Regressions:     ${delta.regressions.length}`);

  if (delta.regressions.length > 0) {
    lines.push(`\nRegressions:`);
    for (const r of delta.regressions) {
      lines.push(`  - [${r.status}] ${r.scenario.title}`);
    }
  }

  if (delta.newPasses.length > 0) {
    lines.push(`\nNew passes:`);
    for (const r of delta.newPasses) {
      lines.push(`  - [${r.status}] ${r.scenario.title}`);
    }
  }

  if (delta.improvements.length > 0) {
    lines.push(`\nImprovements:`);
    for (const r of delta.improvements) {
      lines.push(`  - [${r.status}] ${r.scenario.title}`);
    }
  }

  return lines.join('\n');
}
