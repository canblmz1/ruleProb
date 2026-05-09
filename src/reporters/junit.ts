import { EvaluationResult, Config } from '../types/index.js';
import fs from 'fs-extra';
import path from 'path';

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function writeJUnitReport(results: EvaluationResult[], config: Config): Promise<string> {
  const failures = results.filter(r => r.status === 'FAIL').length;
  const skipped = results.filter(r => r.status === 'SKIPPED').length;
  const errors = 0;

  const testcases = results.map(r => {
    const name = escapeXml(r.scenario.title);
    const classname = escapeXml(r.category ?? 'unknown');
    const open = `    <testcase name="${name}" classname="${classname}" time="0">`;

    if (r.status === 'FAIL') {
      const msg = escapeXml(`Expected: ${r.expected} | Actual: ${r.actual}`);
      const body = escapeXml(r.evidence);
      return `${open}\n      <failure message="${msg}">${body}</failure>\n    </testcase>`;
    }
    if (r.status === 'PARTIAL') {
      const msg = escapeXml(`Partial: ${r.actual}`);
      return `${open}\n      <failure message="${msg}" type="partial"/>\n    </testcase>`;
    }
    if (r.status === 'SKIPPED') {
      return `${open}\n      <skipped/>\n    </testcase>`;
    }
    return `${open}\n    </testcase>`;
  }).join('\n');

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuites name="RuleProbe" tests="${results.length}" failures="${failures}" errors="${errors}" skipped="${skipped}" time="0">`,
    `  <testsuite name="RuleProbe" tests="${results.length}" failures="${failures}" errors="${errors}" skipped="${skipped}" time="0">`,
    testcases,
    '  </testsuite>',
    '</testsuites>'
  ].join('\n');

  const outPath = path.join(config.reportDir, 'report.xml');
  await fs.ensureDir(config.reportDir);
  await fs.writeFile(outPath, xml, 'utf-8');
  return outPath;
}
