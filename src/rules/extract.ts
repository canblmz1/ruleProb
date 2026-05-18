import { Rule, Assertion, RuleCategory } from '../types/index.js';

export function extractRules(files: {path: string, content: string}[]): Rule[] {
  const rules: Rule[] = [];
  // Reset the shared createRule counter so each extractRules() call starts IDs at rule-1,
  // giving stable, predictable IDs regardless of call order or test parallelism.
  createRule = createRuleFactory();

  for (const file of files) {
    const lines = file.content.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        
        if (!trimmed.startsWith('-') && !trimmed.startsWith('*') && !/^\d+\./.test(trimmed)) {
          continue;
        }
        
        const cleanLine = trimmed.replace(/^[\-\*\d\.]+\s*/, '');
        const lineRules = processLineForRules(cleanLine, file.path, i + 1, line);
        rules.push(...lineRules);
    }
  }

  return rules;
}

const KEYWORD_REGEX = /\b(ALWAYS|NEVER|MUST(?: NOT)?|DO(?: NOT)?|DON'T|Avoid|Use|Ensure|Prefer|Required|Forbidden|No need to|Do not use|never run|do not run|must include|typecheck passes)\b/i;
const COMMAND_START_REGEX = /^(pnpm|npm|yarn|bun|npx|node|vitest|playwright|docker|git|bazel|cargo|go|python|pytest|eslint|biome|tsc|turbo|nx)(\s|$)/i;

function processLineForRules(cleanLine: string, sourceFile: string, lineNumber: number, rawLine: string): Rule[] {
  const rules: Rule[] = [];
  
  // Specific complex rule splits
  if (/NEVER run [`'"]?pnpm test[`'"]?/i.test(cleanLine) && /Use [`'"]?vitest/i.test(cleanLine)) {
    const forbiddenPart = cleanLine.split(/Use|Instead|but/i)[0].trim();
    // Re-prefix "Use " so KEYWORD_REGEX + extractCommandRules still triggers on the tail fragment.
    const requiredTail = cleanLine.split(/Use|Instead|but/i).slice(1).join(' ').trim();
    const requiredPart = requiredTail ? `Use ${requiredTail}` : requiredTail;
    if (forbiddenPart) rules.push(...extractAllFromFrag(forbiddenPart, sourceFile, lineNumber, rawLine));
    if (requiredPart) rules.push(...extractAllFromFrag(requiredPart, sourceFile, lineNumber, rawLine));
  } else {
    // Basic multi-sentence split
    const parts = cleanLine.split(/(?<=[.!?])\s+/);
    for (const part of parts) {
        rules.push(...extractAllFromFrag(part, sourceFile, lineNumber, rawLine));
    }
  }

  if (rules.length === 0 && (cleanLine.toLowerCase().includes('mention') || cleanLine.toLowerCase().includes('explain'))) {
    rules.push(createRule(sourceFile, lineNumber, rawLine, cleanLine, 'final_answer_required', 'medium', [{ type: 'final_answer_contains', text: 'mention' }]));
  }

  // Deduplication
  const seen = new Set();
  const deduped: Rule[] = [];
  for (const rule of rules) {
    let sig = rule.category;
    if (rule.assertions && rule.assertions.length > 0) {
      const a = rule.assertions[0];
      if ('commandIncludes' in a) sig += ':' + (a as any).commandIncludes;
      if ('pattern' in a) sig += ':' + (a as any).pattern;
      if ('manager' in a) sig += ':' + (a as any).manager;
      if ('forbiddenManagers' in a && Array.isArray((a as any).forbiddenManagers)) {
        sig += ':forbid=' + (a as any).forbiddenManagers.slice().sort().join(',');
      }
      if ('text' in a) sig += ':text=' + (a as any).text;
    }
    if (!seen.has(sig)) {
      seen.add(sig);
      deduped.push(rule);
    }
  }
  return deduped;
}

function extractAllFromFrag(frag: string, sourceFile: string, lineNumber: number, rawLine: string): Rule[] {
  const rules: Rule[] = [];
  const lowerFrag = frag.toLowerCase();
  const hasCommitNegation =
    lowerFrag.includes('do not commit') ||
    lowerFrag.includes("don't commit") ||
    lowerFrag.includes('never commit');
  if (!KEYWORD_REGEX.test(frag) && !frag.includes('`') && !frag.includes('mention') && !frag.includes('pnpm') && !frag.includes('npm') && !hasCommitNegation) {
    return [];
  }
  
  const isInformational = /conventional commit|commit format|example:|e\.g\.|i\.e\.|for example|most tests use|informational|note:|commit message|should follow|must follow|see:|see also|reference|docs:|chore:|feat\(|fix\(|refactor\(|style\(|test\(|ci\(|build\(|perf\(|BREAKING CHANGE/i.test(frag);
  if (isInformational) {
    const infoRule = createRule(sourceFile, lineNumber, rawLine, frag, 'final_answer_required', 'low', [{ type: 'final_answer_contains', text: 'informational' }]);
    infoRule.testable = false;
    rules.push(infoRule);
    return rules;
  }
  
  rules.push(...extractPackageManagerRules(frag, sourceFile, lineNumber, rawLine));
  rules.push(...extractCommandRules(frag, sourceFile, lineNumber, rawLine));
  rules.push(...extractCodePatternRules(frag, sourceFile, lineNumber, rawLine));
  rules.push(...extractFileChangeRules(frag, sourceFile, lineNumber, rawLine));
  return rules;
}

function extractPackageManagerRules(line: string, sourceFile: string, lineNumber: number, rawLine: string): Rule[] {
  const rules: Rule[] = [];
  const lower = line.toLowerCase();
  const lowerPlain = lower.replace(/[`'"]/g, '');

  if (lower.includes('pnpm') || lower.includes('npm') || lower.includes('yarn') || lower.includes('bun')) {
    if (lowerPlain.includes('always use pnpm') || lowerPlain.includes('pnpm only') || lowerPlain.includes('use pnpm')) {
      // Collect forbidden managers mentioned alongside the pnpm requirement.
      const forbiddenManagers: string[] = [];
      if (lower.includes('never use npm') || lower.includes('never npm') || lower.includes('not npm')) forbiddenManagers.push('npm');
      if (lower.includes('never use yarn') || lower.includes('never yarn') || lower.includes('not yarn')) forbiddenManagers.push('yarn');
      if (lower.includes('never use bun') || lower.includes('never bun') || lower.includes('not bun')) forbiddenManagers.push('bun');

      // Emit a single rule — if forbidden managers are present, embed them directly.
      // This prevents the same line from generating both a bare {manager:'pnpm'} rule and
      // individual {manager:'pnpm', forbiddenManagers:[x]} rules (duplicate signatures).
      const assertions = forbiddenManagers.length > 0
        ? [{ type: 'package_manager_required' as const, manager: 'pnpm', forbiddenManagers }]
        : [{ type: 'package_manager_required' as const, manager: 'pnpm' }];
      rules.push(createRule(sourceFile, lineNumber, rawLine, line, 'package_manager', 'high', assertions));
    } else {
      // Standalone "never use <manager>" fragments without an explicit pnpm requirement.
      const forbiddenFromNegation: string[] = [];
      if (lower.includes('never use npm') || lower.includes('never npm') || lower.includes('not npm')) forbiddenFromNegation.push('npm');
      if (lower.includes('never use yarn') || lower.includes('never yarn') || lower.includes('not yarn')) forbiddenFromNegation.push('yarn');
      if (lower.includes('never use bun') || lower.includes('never bun') || lower.includes('not bun')) forbiddenFromNegation.push('bun');
      for (const fmgr of forbiddenFromNegation) {
        rules.push(createRule(sourceFile, lineNumber, rawLine, line, 'package_manager', 'high', [{ type: 'package_manager_required', manager: 'pnpm', forbiddenManagers: [fmgr] }]));
      }
    }
  }
  return rules;
}

function extractCommandRules(line: string, sourceFile: string, lineNumber: number, rawLine: string): Rule[] {
  const rules: Rule[] = [];
  const lower = line.toLowerCase();

  // "DO NOT COMMIT" / "NEVER commit" maps to forbidden `git commit` even when the words "git" / "commit" aren't adjacent.
  const negatedCommit =
    lower.includes('do not commit') ||
    lower.includes("don't commit") ||
    lower.includes('never commit');
  const isCommitNarrativeFalsePositive =
    lower.includes('commit to') ||
    lower.includes('conventional commit') ||
    lower.includes('commit message') ||
    lower.includes('commit format');
  if (negatedCommit && !isCommitNarrativeFalsePositive) {
    rules.push(createRule(sourceFile, lineNumber, rawLine, line, 'forbidden_command', 'high', [{ type: 'forbidden_command', commandIncludes: 'git commit' }]));
  }

  let commandsRegex = /`([^`]+)`/g;
  let matches = Array.from(line.matchAll(commandsRegex)).map(m => m[1]);

  const common = ['pnpm test', 'pnpm typecheck', 'vitest', 'bazel clean', 'bazel build', 'git commit', 'pnpm build', 'pnpm create'];
  for (const c of common) {
    const cLower = c.toLowerCase();
    if (lower.includes(c) && !matches.some(m => m.toLowerCase().includes(cLower))) {
      matches.push(c);
    }
  }

  for (const cmd of matches) {
    // Reject common non-command tokens found in backticks if they are too short or look like keywords
    if (cmd.length < 3 || /^(any|class|unknown|string|number|boolean|void)$/i.test(cmd)) continue;
    if (!COMMAND_START_REGEX.test(cmd.trim())) continue;
    if (/^(pnpm|npm|yarn|bun)$/i.test(cmd.trim())) continue;

    if (lower.includes('never') || lower.includes('do not run') || lower.includes('avoid') || lower.includes('forbidden') || lower.includes('never use')) {
       rules.push(createRule(sourceFile, lineNumber, rawLine, line, 'forbidden_command', 'high', [{ type: 'forbidden_command', commandIncludes: cmd }]));
    } else if (lower.includes('use') || lower.includes('required') || lower.includes('run') || lower.includes('ensure') || lower.includes('passes') || lower.includes('prefer') || lower.includes('include') || lower.includes('always')) {
       rules.push(createRule(sourceFile, lineNumber, rawLine, line, 'required_command', 'medium', [{ type: 'required_command', commandIncludes: cmd }]));
    }
  }
  return rules;
}

function extractCodePatternRules(line: string, sourceFile: string, lineNumber: number, rawLine: string): Rule[] {
  const rules: Rule[] = [];
  const lower = line.toLowerCase();
  const lowerPlain = lower.replace(/[`'"]/g, '');

  if ((lower.includes('any') || lower.includes('`any`')) && (lower.includes('never') || lower.includes('avoid') || lowerPlain.includes('use unknown'))) {
    rules.push(createRule(sourceFile, lineNumber, rawLine, line, 'code_pattern_forbidden', 'medium', [{ type: 'code_pattern_forbidden', pattern: 'any' }]));
  }
  if ((lower.includes('buffer') || lower.includes('`buffer`')) && lowerPlain.includes('use uint8array')) {
    rules.push(createRule(sourceFile, lineNumber, rawLine, line, 'code_pattern_forbidden', 'medium', [{ type: 'code_pattern_forbidden', pattern: 'Buffer' }]));
  }
  if ((lower.includes('classes') || lower.includes('class')) && (lower.includes('never') || lower.includes('no ') || lower.includes('use plain objects'))) {
    rules.push(createRule(sourceFile, lineNumber, rawLine, line, 'code_pattern_forbidden', 'medium', [{ type: 'code_pattern_forbidden', pattern: 'class' }]));
  }
  if (lower.includes('require(') && (lower.includes('never') || lower.includes('forbidden'))) {
    rules.push(createRule(sourceFile, lineNumber, rawLine, line, 'code_pattern_forbidden', 'medium', [{ type: 'code_pattern_forbidden', pattern: 'require(' }]));
  }
  if (lower.includes('default export') && (lower.includes('forbidden') || lower.includes('never'))) {
    rules.push(createRule(sourceFile, lineNumber, rawLine, line, 'code_pattern_forbidden', 'medium', [{ type: 'code_pattern_forbidden', pattern: 'export default' }]));
  }

  // Positive (required) code patterns paired with common "use X instead" phrasing.
  if (lowerPlain.includes('use unknown')) {
    rules.push(createRule(sourceFile, lineNumber, rawLine, line, 'code_pattern_required', 'medium', [{ type: 'code_pattern_required', pattern: 'unknown' }]));
  }
  if (lowerPlain.includes('use uint8array')) {
    rules.push(createRule(sourceFile, lineNumber, rawLine, line, 'code_pattern_required', 'medium', [{ type: 'code_pattern_required', pattern: 'Uint8Array' }]));
  }
  if (lower.includes('use plain objects')) {
    rules.push(createRule(sourceFile, lineNumber, rawLine, line, 'code_pattern_required', 'medium', [{ type: 'code_pattern_required', pattern: 'plain objects' }]));
  }

  return rules;
}

function extractFileChangeRules(line: string, sourceFile: string, lineNumber: number, rawLine: string): Rule[] {
  const rules: Rule[] = [];
  const lower = line.toLowerCase();
  const explicitPattern = extractExplicitFilePattern(line);
  
  const forbidsFileChange =
    lower.includes('do not modify') ||
    lower.includes('do not edit') ||
    lower.includes('do not change') ||
    lower.includes('do not touch') ||
    lower.includes('never edit') ||
    lower.includes('never modify') ||
    lower.includes('never change') ||
    lower.includes('never touch');

  if (lower.includes('package.json') && forbidsFileChange) {
    rules.push(createRule(sourceFile, lineNumber, rawLine, line, 'forbidden_file_change', 'high', [{ type: 'forbidden_file_change', pattern: explicitPattern || 'package.json' }]));
  }
  if (forbidsFileChange && explicitPattern && !lower.includes('package.json')) {
    rules.push(createRule(sourceFile, lineNumber, rawLine, line, 'forbidden_file_change', 'high', [{ type: 'forbidden_file_change', pattern: explicitPattern }]));
  } else if (lower.includes('generated') && forbidsFileChange) {
    rules.push(createRule(sourceFile, lineNumber, rawLine, line, 'forbidden_file_change', 'high', [{ type: 'forbidden_file_change', pattern: 'generated' }]));
  }
  if ((lower.includes('include tests') || lower.includes('must include tests')) && !lower.includes('pnpm test')) {
     rules.push(createRule(sourceFile, lineNumber, rawLine, line, 'required_file_change', 'high', [{ type: 'required_file_change', pattern: 'test' }]));
  }
  if ((lower.includes('must update docs') || lower.includes('update docs') || lower.includes('include docs')) && !lower.includes('docs:')) {
     rules.push(createRule(sourceFile, lineNumber, rawLine, line, 'required_file_change', 'medium', [{ type: 'required_file_change', pattern: 'docs' }]));
  }

  return rules;
}

function extractExplicitFilePattern(line: string): string | null {
  if (line.length > 1000) return null;
  const backticked = Array.from(line.matchAll(/`([^`]+)`/g)).map(match => normalizeFilePattern(match[1]));
  const directPathMatches = Array.from(line.matchAll(/[./]?[A-Za-z0-9_./*-]+(?:\.[A-Za-z0-9_*]+|\/)/g))
    .map(match => normalizeFilePattern(match[0]))
    .filter(candidate => looksLikeFilePattern(candidate))
    .sort((left, right) => right.length - left.length);

  for (const token of backticked) {
    if (looksLikeFilePattern(token)) return token;
  }

  if (directPathMatches.length > 0) return directPathMatches[0];

  return null;
}

function looksLikeFilePattern(token: string): boolean {
  if (!token) return false;
  if (COMMAND_START_REGEX.test(token)) return false;
  return token.includes('/') || token.includes('\\') || token.includes('.') || token.includes('*');
}

function normalizeFilePattern(token: string): string {
  const normalized = token
    .trim()
    .replace(/^[("'`]+|[)"'`,.;:]+$/g, '')
    .replace(/\\/g, '/');

  if (normalized.endsWith('/')) {
    return `${normalized}**`;
  }

  return normalized;
}

function createRuleFactory() {
  let counter = 1;
  return function createRule(sourceFile: string, lineNumber: number, rawLine: string, text: string, category: RuleCategory, severity: 'high' | 'medium' | 'low', assertions: Assertion[]): Rule {
    return {
      id: `rule-${counter++}`,
      sourceFile,
      lineNumber,
      rawLine,
      text,
      category,
      severity,
      testable: true,
      assertions
    };
  };
}

// Shared mutable reference so all helper functions (extractPackageManagerRules, etc.)
// can call createRule without threading it through every parameter list.
// Reset at the top of each extractRules() call so parallel tests get isolated IDs.
let createRule: ReturnType<typeof createRuleFactory> = createRuleFactory();
