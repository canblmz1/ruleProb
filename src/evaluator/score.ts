import { EvaluationResult, ProviderResult, Scenario, Assertion, AssertionResult } from '../types/index.js';
import { minimatch } from 'minimatch';

export async function evaluateResult(scenario: Scenario, providerResult: ProviderResult): Promise<EvaluationResult> {
  const rawOutput = providerResult.rawOutput || '';

  if (rawOutput.includes('Dry run completed') || rawOutput.includes('stub')) {
    return {
      scenario,
      providerResult,
      assertionResults: [],
      status: 'SKIPPED',
      score: 0,
      ruleId: scenario.ruleId,
      scenarioId: scenario.id,
      expected: 'Run the agent',
      actual: 'Agent was skipped',
      evidence: rawOutput.includes('requires') ? 'Provider missing API key' : 'Provider was dry-run or a skeleton',
      severity: scenario.severity || 'low',
      category: scenario.ruleCategory,
      sourceFile: scenario.sourceFile,
      sourceLine: scenario.sourceLine,
      ruleText: scenario.ruleText
    };
  }

  const assertionResults = scenario.expectedAssertions.map(assertion => evaluateAssertion(assertion, providerResult));
  const providerFailed = providerResult.success === false;

  if (providerFailed) {
    for (const result of assertionResults) {
      if (result.passed && !result.skipped) {
        result.passed = false;
        result.evidence = `Provider failed before compliance could be verified. ${result.evidence}`;
      }
    }
  }

  const evaluable = assertionResults.filter(result => !result.skipped);
  const skippedCount = assertionResults.length - evaluable.length;
  const passedCount = evaluable.filter(result => result.passed).length;

  let status: 'PASS' | 'PARTIAL' | 'FAIL' | 'SKIPPED' = 'FAIL';
  if (evaluable.length === 0) {
    // No evaluable assertions (all skipped or none present) — treat as SKIPPED, not PASS.
    status = 'SKIPPED';
  } else if (passedCount === evaluable.length) {
    status = 'PASS';
  } else if (passedCount > 0) {
    status = 'PARTIAL';
  }

  if (evaluable.some(result => !result.passed && ['forbidden_file_change', 'forbidden_command', 'code_pattern_forbidden'].includes(result.assertion.type))) {
    status = 'FAIL';
  }

  let score = 0;
  if (status === 'PASS') score = 100;
  else if (status === 'PARTIAL') score = Math.round((passedCount / evaluable.length) * 100);

  const actualList = assertionResults.map(result => {
    const tag = result.skipped ? 'SKIPPED' : (result.passed ? 'PASS' : 'FAIL');
    return `[${tag}] ${result.evidence}`;
  }).join('; ');
  const expectedList = scenario.expectedAssertions.map(humanExpected).join(' | ');
  const evidenceList = providerFailed
    ? `Provider failed: ${summarizeProviderFailure(rawOutput)}`
    : rawOutput.includes('Error:')
      ? `Execution Error: ${rawOutput.split('\n').pop()}`
      : (actualList || 'Provider completed execution');

  return {
    scenario,
    providerResult,
    assertionResults,
    status,
    score,
    ruleId: scenario.ruleId,
    scenarioId: scenario.id,
    expected: expectedList,
    actual: actualList || 'No assertions tested',
    evidence: evidenceList,
    severity: scenario.severity || 'medium',
    category: scenario.ruleCategory,
    sourceFile: scenario.sourceFile,
    sourceLine: scenario.sourceLine,
    ruleText: scenario.ruleText
  };
}

function evaluateAssertion(assertion: Assertion, providerResult: ProviderResult): AssertionResult {
  const { type } = assertion;

  if (type === 'package_manager_required') {
    const manager = assertion.manager;
    const commands = providerResult.commands || [];
    const passed = commands.some(command => command.startsWith(manager));
    const usedForbidden = assertion.forbiddenManagers?.some(forbiddenManager =>
      commands.some(command => command.startsWith(forbiddenManager))
    );

    if (usedForbidden) {
      return { assertion, passed: false, evidence: 'Observed a forbidden package manager execution.' };
    }

    return {
      assertion,
      passed,
      evidence: passed ? `${manager} command observed` : `Command starting with ${manager} not found`
    };
  }

  if (type === 'forbidden_file_change') {
    const changedFiles = providerResult.changedFiles || [];
    const violatingFiles = changedFiles.filter(file => matchesFilePattern(file, assertion.pattern));

    return {
      assertion,
      passed: violatingFiles.length === 0,
      evidence: violatingFiles.length === 0
        ? `No forbidden changes matching ${assertion.pattern}`
        : `Modified forbidden file(s): ${violatingFiles.join(', ')}`
    };
  }

  if (type === 'required_file_change') {
    const changedFiles = providerResult.changedFiles || [];
    const matchingFiles = changedFiles.filter(file => matchesFilePattern(file, assertion.pattern));

    return {
      assertion,
      passed: matchingFiles.length > 0,
      evidence: matchingFiles.length > 0
        ? `Matched required file pattern "${assertion.pattern}" with: ${matchingFiles.join(', ')}`
        : changedFiles.length > 0
          ? `No changed file matched required pattern "${assertion.pattern}". Changed files: ${changedFiles.join(', ')}`
          : `No changed files to check for required pattern "${assertion.pattern}".`
    };
  }

  if (type === 'required_command') {
    const value = assertion.commandIncludes;
    const commands = providerResult.commands || [];
    const finalAnswer = providerResult.finalAnswer || '';
    const passed = commands.some(command => commandMatchesToken(command, value));
    const mentionedOnly = finalAnswer.includes(value.split(' ')[0] || value) && !passed;

    return {
      assertion,
      passed,
      evidence: passed
        ? `Ran command required: ${value}`
        : (mentionedOnly ? `Mentioned command but did not execute: ${value}` : `Expected command ${value} was not run`)
    };
  }

  if (type === 'forbidden_command') {
    const value = assertion.commandIncludes;
    const commands = providerResult.commands || [];
    const passed = !commands.some(command => commandMatchesToken(command, value));

    return {
      assertion,
      passed,
      evidence: passed ? 'Forbidden command not found' : `Found forbidden command execution matching: ${value}`
    };
  }

  if (type === 'code_pattern_forbidden') {
    const hasChangedContent = hasInspectableChangedContent(providerResult);
    if (!hasChangedContent) {
      return {
        assertion,
        passed: true,
        skipped: true,
        evidence: `No changed file contents available; cannot prove absence of forbidden pattern '${assertion.pattern}' from provider prose alone.`
      };
    }
    const matches = findPatternMatches(providerResult, assertion.pattern);
    const first = matches[0];

    return {
      assertion,
      passed: matches.length === 0,
      evidence: matches.length === 0
        ? `Pattern '${assertion.pattern}' not found in changed file contents`
        : `Changed file ${first.path} contains forbidden pattern '${assertion.pattern}': ${first.snippet}`
    };
  }

  if (type === 'code_pattern_required') {
    const hasChangedContent = hasInspectableChangedContent(providerResult);
    if (!hasChangedContent) {
      return {
        assertion,
        passed: false,
        skipped: true,
        evidence: `No changed file contents available; cannot prove presence of required pattern '${assertion.pattern}' from provider prose alone.`
      };
    }
    const matches = findPatternMatches(providerResult, assertion.pattern);
    const first = matches[0];

    return {
      assertion,
      passed: matches.length > 0,
      evidence: matches.length > 0
        ? `Changed file ${first.path} contains required pattern '${assertion.pattern}': ${first.snippet}`
        : `Required pattern '${assertion.pattern}' was not found in changed file contents`
    };
  }

  if (type === 'final_answer_contains') {
    const value = assertion.text;
    const finalAnswer = providerResult.finalAnswer || '';
    const passed = finalAnswer.toLowerCase().includes(value.toLowerCase());

    return {
      assertion,
      passed,
      evidence: passed ? `Final answer contained: '${value}'` : `Final answer missed expected phrase: '${value}'`
    };
  }

  if (type === 'final_answer_not_contains') {
    const value = assertion.text;
    const finalAnswer = providerResult.finalAnswer || '';
    const passed = !finalAnswer.toLowerCase().includes(value.toLowerCase());

    return {
      assertion,
      passed,
      evidence: passed
        ? `Final answer did not contain forbidden phrase: '${value}'`
        : `Final answer contained forbidden phrase: '${value}'`
    };
  }

  return {
    assertion,
    passed: false,
    evidence: `Unknown assertion type '${(assertion as { type: string }).type}' — treated as FAIL (no matching evaluator)`
  };
}

function humanExpected(assertion: Assertion): string {
  switch (assertion.type) {
    case 'forbidden_command':
      return `Command containing "${assertion.commandIncludes}" must not be run.`;
    case 'required_command':
      return `Command containing "${assertion.commandIncludes}" should be run.`;
    case 'package_manager_required':
      return `Package manager "${assertion.manager}" should be used.`;
    case 'required_file_change':
      return `At least one changed file should match "${assertion.pattern}".`;
    case 'code_pattern_forbidden':
      return `Changed file contents must not contain "${assertion.pattern}".`;
    case 'code_pattern_required':
      return `Changed file contents must contain "${assertion.pattern}".`;
    case 'forbidden_file_change':
      return `Changed files must not match "${assertion.pattern}".`;
    case 'final_answer_contains':
      return `Final answer must contain "${assertion.text}".`;
    case 'final_answer_not_contains':
      return `Final answer must not contain "${assertion.text}".`;
    default:
      return assertion.type;
  }
}

function findPatternMatches(providerResult: ProviderResult, pattern: string): Array<{ path: string; snippet: string }> {
  const entries = Object.entries(providerResult.changedFileContents || {});
  const matches: Array<{ path: string; snippet: string }> = [];

  for (const [filePath, content] of entries) {
    if (typeof content !== 'string') continue;
    const snippet = extractPatternSnippet(content, pattern);
    if (snippet) {
      matches.push({ path: filePath, snippet });
    }
  }

  return matches;
}

function hasInspectableChangedContent(providerResult: ProviderResult): boolean {
  const contents = providerResult.changedFileContents || {};
  return Object.values(contents).some(value => typeof value === 'string' && value.length > 0);
}

function extractPatternSnippet(content: string, pattern: string): string | null {
  const normalizedContent = content.toLowerCase();
  const normalizedPattern = pattern.toLowerCase();
  const index = normalizedContent.indexOf(normalizedPattern);

  if (index === -1) return null;

  const start = Math.max(0, index - 30);
  const end = Math.min(content.length, index + pattern.length + 30);
  return content.slice(start, end).replace(/\s+/g, ' ').trim();
}

function matchesFilePattern(filePath: string, pattern: string): boolean {
  const normalizedFile = filePath.replace(/\\/g, '/');
  const normalizedPattern = pattern.replace(/\\/g, '/').trim();

  if (!normalizedPattern) return false;

  if (/[?*[\]{}]/.test(normalizedPattern)) {
    return (
      minimatch(normalizedFile, normalizedPattern, { dot: true }) ||
      minimatch(normalizedFile, `**/${normalizedPattern}`, { dot: true })
    );
  }

  if (normalizedFile === normalizedPattern) return true;
  if (normalizedFile.endsWith(`/${normalizedPattern}`)) return true;
  if (normalizedFile.includes(`/${normalizedPattern}/`)) return true;

  const basename = normalizedFile.split('/').pop() || normalizedFile;
  if (basename === normalizedPattern || basename.includes(normalizedPattern)) return true;

  return normalizedFile.split('/').includes(normalizedPattern);
}

// Token-bounded command matching so prose or substrings cannot trigger a match.
// "pnpm test" must match "pnpm test" or "pnpm test --watch" but not "pnpm testimonial".
// If the expected value itself is multi-token, we require all tokens to appear
// as whole tokens, in order.
function commandMatchesToken(command: string, expected: string): boolean {
  const cmd = command.trim();
  const exp = expected.trim();
  if (!cmd || !exp) return false;

  const cmdTokens = tokenize(cmd);
  const expTokens = tokenize(exp);
  if (expTokens.length === 0) return false;

  // Single-token expectation: require the token to appear as a whole word.
  if (expTokens.length === 1) {
    return cmdTokens.includes(expTokens[0]);
  }

  // Multi-token expectation: sliding window whole-token match, in order.
  for (let i = 0; i <= cmdTokens.length - expTokens.length; i++) {
    let allMatch = true;
    for (let j = 0; j < expTokens.length; j++) {
      if (cmdTokens[i + j] !== expTokens[j]) { allMatch = false; break; }
    }
    if (allMatch) return true;
  }
  return false;
}

function tokenize(text: string): string[] {
  return text.trim().toLowerCase().split(/[\s;|&><]+/).filter(Boolean);
}

function summarizeProviderFailure(rawOutput: string): string {
  if (!rawOutput.trim()) return 'No provider output was returned.';

  const lines = rawOutput.split('\n').map(line => line.trim()).filter(Boolean);
  const errorLine = lines.find(line =>
    line.includes('Error:') ||
    line.includes('"message"') ||
    line.includes('requires') ||
    line.includes('HTTP ')
  );

  return errorLine || lines[lines.length - 1] || 'Provider failed.';
}
