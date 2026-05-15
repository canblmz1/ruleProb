import { EvaluationResult, Config } from '../types/index.js';
import fs from 'fs-extra';
import path from 'path';

const SARIF_SCHEMA = 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Documents/CommitteeSpecifications/2.1.0/sarif-schema-2.1.0.json';
const RULEPROBE_REPO_URL = 'https://github.com/ruleprobe/ruleprobe';

function severityToLevel(severity: string, status: string): 'error' | 'warning' | 'note' | 'none' {
  if (status === 'PASS') return 'note';
  if (status === 'SKIPPED') return 'none';
  if (severity === 'high') return 'error';
  if (severity === 'medium') return 'warning';
  return 'note';
}

export async function writeSarifReport(results: EvaluationResult[], config: Config): Promise<string> {
  const rules = results.map(r => ({
    id: r.ruleId,
    name: r.scenario.title.replace(/\s+/g, '_'),
    shortDescription: { text: r.ruleText || r.scenario.title },
    helpUri: RULEPROBE_REPO_URL,
    properties: {
      category: r.category,
      severity: r.severity,
    }
  }));

  const sarifResults = results.map(r => {
    const level = severityToLevel(r.severity, r.status);
    const sourceFile = r.sourceFile
      ? path.relative(process.cwd(), r.sourceFile).replace(/\\/g, '/')
      : 'CLAUDE.md';

    const result: Record<string, unknown> = {
      ruleId: r.ruleId,
      level,
      message: {
        text: `[${r.status}] ${r.scenario.title}: ${r.actual}${r.skipReason ? ` (skip reason: ${r.skipReason})` : ''}`
      },
      locations: [{
        physicalLocation: {
          artifactLocation: { uri: sourceFile, uriBaseId: '%SRCROOT%' },
          region: { startLine: r.sourceLine ?? 1 }
        }
      }]
    };

    if (r.status === 'FAIL' || r.status === 'PARTIAL') {
      result['properties'] = {
        expected: r.expected,
        actual: r.actual,
        evidence: r.evidence,
      };
    }

    return result;
  });

  const sarif = {
    $schema: SARIF_SCHEMA,
    version: '2.1.0',
    runs: [{
      tool: {
        driver: {
          name: 'RuleProbe',
          version: '0.3.0',
          informationUri: RULEPROBE_REPO_URL,
          rules
        }
      },
      results: sarifResults,
      artifacts: [],
    }]
  };

  const outPath = path.join(config.reportDir, 'report.sarif');
  await fs.ensureDir(config.reportDir);
  await fs.writeFile(outPath, JSON.stringify(sarif, null, 2), 'utf-8');
  return outPath;
}
