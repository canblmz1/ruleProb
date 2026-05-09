import { Rule } from '../types/index.js';

export type LintSeverity = 'error' | 'warn' | 'info';

export interface LintIssue {
  ruleId: string;
  ruleText: string;
  sourceFile: string;
  line: number;
  severity: LintSeverity;
  code: string;
  message: string;
}

const STRONG_KEYWORDS = /\b(ALWAYS|NEVER|MUST(?: NOT)?|DO NOT|DON'T|FORBIDDEN|REQUIRED|never run|do not run)\b/i;
const VAGUE_PHRASES = /\b(be careful|try to|consider|ideally|where possible|if possible|generally|usually|make sure)\b/i;

export function lintRules(rules: Rule[]): LintIssue[] {
  const issues: LintIssue[] = [];
  const sigMap = new Map<string, Rule>();

  // R001: aggregate non-testable rules by file (one issue per file, not one per rule)
  const nonTestableByFile = new Map<string, Rule[]>();
  for (const rule of rules) {
    if (!rule.testable) {
      if (!nonTestableByFile.has(rule.sourceFile)) nonTestableByFile.set(rule.sourceFile, []);
      nonTestableByFile.get(rule.sourceFile)!.push(rule);
    }
  }
  for (const [, ntRules] of nonTestableByFile) {
    const count = ntRules.length;
    const first = ntRules[0];
    const lineList = ntRules.map(r => r.lineNumber ?? 1).join(', ');
    issues.push({
      ruleId: first.id,
      ruleText: count === 1 ? first.text : `${count} non-testable rules`,
      sourceFile: first.sourceFile,
      line: first.lineNumber ?? 1,
      severity: 'info',
      code: 'R001',
      message: count === 1
        ? `Rule is non-testable (category: ${first.category}). Consider rephrasing with ALWAYS/NEVER to make it enforceable.`
        : `${count} non-testable rules (lines: ${lineList}). Consider rephrasing with ALWAYS/NEVER to make them enforceable.`
    });
  }

  for (const rule of rules) {
    if (!rule.testable) continue;

    const file = rule.sourceFile;
    const line = rule.lineNumber ?? 1;
    const text = rule.text;

    // R002: vague language
    const vagueMatch = text.match(VAGUE_PHRASES);
    if (vagueMatch && !STRONG_KEYWORDS.test(text)) {
      issues.push({
        ruleId: rule.id,
        ruleText: text,
        sourceFile: file,
        line,
        severity: 'warn',
        code: 'R002',
        message: `Vague language detected ("${vagueMatch[0]}"). Use ALWAYS/NEVER for stronger enforcement.`
      });
    }

    // R003: very short rules (likely too vague)
    if (text.trim().length < 15) {
      issues.push({
        ruleId: rule.id,
        ruleText: text,
        sourceFile: file,
        line,
        severity: 'warn',
        code: 'R003',
        message: `Rule is very short (${text.trim().length} chars). Short rules are often too vague to be meaningful.`
      });
    }

    // R004: duplicate rule (same category + primary assertion value)
    const assertion = rule.assertions[0];
    if (assertion) {
      const key = buildSig(rule.category, assertion);
      if (sigMap.has(key)) {
        const prev = sigMap.get(key)!;
        issues.push({
          ruleId: rule.id,
          ruleText: text,
          sourceFile: file,
          line,
          severity: 'warn',
          code: 'R004',
          message: `Duplicate rule: same assertion as "${prev.text}" (${prev.sourceFile}:${prev.lineNumber ?? 1}). Remove one.`
        });
      } else {
        sigMap.set(key, rule);
      }
    }

    // R005: unknown category — extraction fallback
    if (rule.category === 'unknown') {
      issues.push({
        ruleId: rule.id,
        ruleText: text,
        sourceFile: file,
        line,
        severity: 'warn',
        code: 'R005',
        message: `Rule could not be classified into a known category. Add a keyword (ALWAYS/NEVER/Use/Avoid) to help extraction.`
      });
    }
  }

  return issues;
}

function buildSig(category: string, assertion: Rule['assertions'][0]): string {
  const a = assertion as any;
  const val = a.commandIncludes ?? a.pattern ?? a.manager ?? a.text ?? '';
  return `${category}:${String(val).toLowerCase()}`;
}

export function formatLintOutput(issues: LintIssue[], totalRules: number): string {
  if (issues.length === 0) {
    return `✓ ${totalRules} rule(s) checked — no issues found.\n`;
  }

  const errors = issues.filter(i => i.severity === 'error');
  const warns = issues.filter(i => i.severity === 'warn');
  const infos = issues.filter(i => i.severity === 'info');

  const lines: string[] = [];
  for (const issue of issues) {
    const icon = issue.severity === 'error' ? '✖' : issue.severity === 'warn' ? '⚠' : 'ℹ';
    const loc = `${issue.sourceFile}:${issue.line}`;
    lines.push(`${icon} [${issue.code}] ${loc}\n  ${issue.ruleText}\n  → ${issue.message}\n`);
  }

  lines.push(`${totalRules} rule(s) checked: ${errors.length} error(s), ${warns.length} warning(s), ${infos.length} info(s)`);
  return lines.join('\n');
}
