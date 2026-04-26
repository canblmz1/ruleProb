import { ProviderInput, ProviderResult } from '../types/index.js';
import path from 'path';
import fs from 'fs-extra';
import { getChangedFileContents, getChangedFiles } from '../sandbox/create.js';

// The mock provider is a deterministic simulation used for CI smoke tests and
// documentation screenshots. It is intentionally NOT a perfect green-path
// producer: it produces a mixed PASS/FAIL/SKIPPED distribution so that the
// resulting reports reflect the real interpretive surface of the tool.
//
// Selection is deterministic by scenario.id hash so the same scenarios always
// produce the same outcomes (no flaky CI).
export class MockProvider {
  name = 'mock';

  async run(input: ProviderInput): Promise<ProviderResult> {
    const { scenario, sandboxDir } = input;

    const category = scenario.expectedAssertions[0]?.type;
    const bucket = hashBucket(scenario.id);

    const result: ProviderResult = {
      finalAnswer: 'I have completed the task and will mention everything.',
      changedFiles: [],
      changedFileContents: {},
      commands: [],
      rawOutput: `Mock run completed deterministically. bucket=${bucket}`,
      success: true
    };

    // Deterministic outcome map:
    //   bucket 0..7 => "compliant" behavior  (PASS, ~80%)
    //   bucket 8    => "non-compliant"        (FAIL, ~10%)
    //   bucket 9    => "ambiguous / no-op"    (often SKIPPED or FAIL, ~10%)
    const compliant = bucket <= 7;
    const nonCompliant = bucket === 8;

    if (category === 'package_manager_required') {
      const manager = (scenario.expectedAssertions[0] as any).manager || 'pnpm';
      if (compliant) {
        result.commands.push(`${manager} test`);
      } else if (nonCompliant) {
        result.commands.push('npm test');
        result.rawOutput += '\nSimulated violation: used a forbidden package manager.';
      }
    } else if (category === 'forbidden_file_change') {
      if (nonCompliant) {
        const pattern = (scenario.expectedAssertions[0] as any)?.pattern || 'src/generated/schema.ts';
        const targetFile = mockPathFromPattern(pattern);
        const fullPath = path.join(sandboxDir, targetFile);
        await fs.ensureDir(path.dirname(fullPath));
        await fs.writeFile(fullPath, '// simulated forbidden edit\nexport const leak = true;\n', 'utf-8');
        result.rawOutput += `\nSimulated violation: wrote ${targetFile}.`;
      }
    } else if (category === 'required_command') {
      const cmd = (scenario.expectedAssertions[0] as any).commandIncludes || 'pnpm test';
      if (compliant) {
        result.commands.push(cmd);
      } else if (nonCompliant) {
        result.rawOutput += '\nSimulated non-compliance: required command was omitted.';
      }
    } else if (category === 'forbidden_command') {
      if (nonCompliant) {
        const cmd = (scenario.expectedAssertions[0] as any).commandIncludes || 'git commit';
        result.commands.push(cmd);
        result.rawOutput += `\nSimulated violation: ran ${cmd}.`;
      }
    } else if (category === 'code_pattern_forbidden') {
      const pattern = (scenario.expectedAssertions[0] as any)?.pattern || 'any';
      const targetFile = 'src/index.ts';
      const fullPath = path.join(sandboxDir, targetFile);
      await fs.ensureDir(path.dirname(fullPath));
      if (compliant) {
        await fs.writeFile(fullPath, 'let i: number = 0;\n', 'utf-8');
      } else if (nonCompliant) {
        await fs.writeFile(fullPath, `let value: ${pattern} = undefined;\n`, 'utf-8');
        result.rawOutput += `\nSimulated violation: introduced forbidden pattern '${pattern}'.`;
      }
      // bucket 9 => no file edit => SKIPPED
    } else if (category === 'code_pattern_required') {
      const targetFile = 'src/index.ts';
      const fullPath = path.join(sandboxDir, targetFile);
      const requiredPattern = (scenario.expectedAssertions[0] as any)?.pattern || 'required-pattern';
      await fs.ensureDir(path.dirname(fullPath));
      if (compliant) {
        const content = requiredPattern === 'unknown'
          ? 'const value: unknown = "ok";\nexport { value };\n'
          : `// required pattern: ${requiredPattern}\nexport const marker = ${JSON.stringify(requiredPattern)};\n`;
        await fs.writeFile(fullPath, content, 'utf-8');
      } else if (nonCompliant) {
        await fs.writeFile(fullPath, '// did not add the required pattern\nexport const other = 1;\n', 'utf-8');
        result.rawOutput += `\nSimulated non-compliance: omitted required pattern '${requiredPattern}'.`;
      }
      // bucket 9 => no file edit => SKIPPED
    } else if (category === 'required_file_change') {
      const pattern = (scenario.expectedAssertions[0] as any)?.pattern || 'test';
      if (compliant) {
        const targetFile = mockPathFromPattern(pattern);
        const fullPath = path.join(sandboxDir, targetFile);
        await fs.ensureDir(path.dirname(fullPath));
        await fs.writeFile(fullPath, `// changed for pattern ${pattern}\nexport const ok = true;\n`, 'utf-8');
      } else if (nonCompliant) {
        const fullPath = path.join(sandboxDir, 'src/unrelated.ts');
        await fs.ensureDir(path.dirname(fullPath));
        await fs.writeFile(fullPath, 'export const unrelated = 1;\n', 'utf-8');
        result.rawOutput += `\nSimulated non-compliance: did not touch required pattern '${pattern}'.`;
      }
    } else if (category === 'final_answer_contains') {
      const phrase = (scenario.expectedAssertions[0] as any)?.text || 'test results';
      if (compliant) {
        result.finalAnswer = `I have completed the task. I mention changed files and ${phrase}.`;
      } else if (nonCompliant) {
        result.finalAnswer = 'I have completed the task.';
        result.rawOutput += '\nSimulated non-compliance: omitted required phrase.';
      }
    } else if (category === 'final_answer_not_contains') {
      const phrase = (scenario.expectedAssertions[0] as any)?.text || 'ready to deploy';
      if (compliant) {
        result.finalAnswer = 'The change is complete locally.';
      } else if (nonCompliant) {
        result.finalAnswer = `Change applied and ${phrase}.`;
        result.rawOutput += `\nSimulated violation: used forbidden phrase '${phrase}'.`;
      }
    }

    const changedFiles = await getChangedFiles(sandboxDir);
    result.changedFiles = changedFiles;
    result.changedFileContents = await getChangedFileContents(sandboxDir, changedFiles);

    return result;
  }
}

// Deterministic hash -> 0..9 bucket.
function hashBucket(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return hash % 10;
}

function mockPathFromPattern(pattern: string): string {
  const normalized = String(pattern || '').replace(/\\/g, '/').trim().toLowerCase();
  if (!normalized || normalized === 'test' || normalized === 'tests') return 'tests/add.test.ts';
  if (normalized === 'package.json') return 'package.json';
  if (normalized.includes('docs')) return 'docs/guide.md';
  if (normalized.includes('generated')) return 'src/generated/schema.ts';
  if (normalized.includes('/')) {
    return normalized
      .replace(/\*\*\/?/g, '')
      .replace(/\*/g, 'sample')
      .replace(/\?/g, 'x');
  }
  return `src/${normalized.replace(/[^a-z0-9_-]+/g, '-') || 'file'}.txt`;
}
