import type { RepoScanResult, HistoryInsight, RuleSuggestion } from './types.js';
import type { Rule, RuleCategory, Assertion } from '../types/index.js';

// ── Typed assertion predicates ────────────────────────────────────────────────

function isRequiredCommand(a: Assertion): a is { type: 'required_command'; commandIncludes: string } {
  return a.type === 'required_command';
}

function isForbiddenCommand(a: Assertion): a is { type: 'forbidden_command'; commandIncludes: string } {
  return a.type === 'forbidden_command';
}

/**
 * Protected directories — frequently-changed generated or build dirs should
 * have a forbidden_file_change rule to prevent accidental edits.
 */
const GENERATED_DIR_PATTERNS = ['dist', 'build', 'generated', 'out', '.next', '__pycache__'];

/**
 * Generate rule suggestions based on static repo scan + history insights +
 * existing rules. Suggestions are proposals only — never written to user files.
 */
export function suggestRules(
  scan: RepoScanResult,
  _history: HistoryInsight,
  existingRules: Rule[]
): RuleSuggestion[] {
  const suggestions: RuleSuggestion[] = [];

  // ── Gap detection ────────────────────────────────────────────────────────────

  // 1. Package manager: lockfile present but no package_manager rule
  if (scan.hasLockfile && scan.packageManager) {
    const hasPmRule = existingRules.some(r => r.category === 'package_manager');
    if (!hasPmRule) {
      suggestions.push({
        category: 'package_manager',
        text: `Always use ${scan.packageManager}`,
        severity: 'high',
        reason: `Detected ${scan.packageManager} lockfile but no package_manager rule found in instruction files.`,
      });
    }
  }

  // 2. Linter rules: linter in devDeps but no linter_must_run rule
  if (scan.linters.length > 0) {
    const hasLinterRule = existingRules.some(r => r.category === 'linter_must_run');
    if (!hasLinterRule) {
      const toolList = scan.linters.join(', ');
      suggestions.push({
        category: 'linter_must_run',
        text: `Run ${scan.linters[0]} before committing`,
        severity: 'medium',
        reason: `Detected linter(s) (${toolList}) in devDependencies but no linter_must_run rule found.`,
      });
    }
  }

  // 3. Test runner: test runner detected but no required_command rule for it
  if (scan.testRunner) {
    const hasTestRunnerRule = existingRules.some(
      r =>
        r.category === 'required_command' &&
        r.text.toLowerCase().includes(scan.testRunner!.toLowerCase())
    );
    if (!hasTestRunnerRule) {
      suggestions.push({
        category: 'required_command',
        text: `Run ${scan.testRunner} to execute the test suite`,
        severity: 'medium',
        reason: `Detected test runner (${scan.testRunner}) but no required_command rule references it.`,
      });
    }
  }

  // 4. Generated/build dirs frequently changed but no forbidden_file_change rule
  const generatedFrequentDirs = scan.frequentDirs.filter(d =>
    GENERATED_DIR_PATTERNS.some(pattern => d.toLowerCase() === pattern)
  );
  if (generatedFrequentDirs.length > 0) {
    const hasProtectionRule = existingRules.some(r => r.category === 'forbidden_file_change');
    if (!hasProtectionRule) {
      const dirList = generatedFrequentDirs.join(', ');
      suggestions.push({
        category: 'forbidden_file_change',
        text: `Do not manually edit generated directories (${dirList})`,
        severity: 'low',
        reason: `Directories frequently changed in git history (${dirList}) appear to be generated/build output; consider adding a forbidden_file_change rule.`,
      });
    }
  }

  // ── Conflict detection ───────────────────────────────────────────────────────
  const categoryRules = new Map<RuleCategory, Rule[]>();
  for (const rule of existingRules) {
    if (!categoryRules.has(rule.category)) {
      categoryRules.set(rule.category, []);
    }
    categoryRules.get(rule.category)!.push(rule);
  }

  // Detect conflicting package_manager rules (two rules with different managers)
  const pmRules = categoryRules.get('package_manager') ?? [];
  if (pmRules.length > 1) {
    const managers = new Set<string>();
    for (const rule of pmRules) {
      for (const assertion of rule.assertions) {
        if (assertion.type === 'package_manager_required') {
          managers.add(assertion.manager);
        }
      }
    }
    if (managers.size > 1) {
      suggestions.push({
        category: 'package_manager',
        text: `Conflicting package_manager rules detected: ${[...managers].join(' vs ')}`,
        severity: 'high',
        reason: `Found ${pmRules.length} package_manager rules specifying different managers (${[...managers].join(', ')}). Reconcile to a single authoritative rule.`,
      });
    }
  }

  // Detect conflicting forbidden/required commands for the same command
  const requiredCmds = (categoryRules.get('required_command') ?? []).flatMap(r =>
    r.assertions.filter(isRequiredCommand).map(a => a.commandIncludes.toLowerCase())
  );
  const forbiddenCmds = (categoryRules.get('forbidden_command') ?? []).flatMap(r =>
    r.assertions.filter(isForbiddenCommand).map(a => a.commandIncludes.toLowerCase())
  );

  for (const cmd of requiredCmds) {
    if (forbiddenCmds.some(fc => fc.includes(cmd) || cmd.includes(fc))) {
      suggestions.push({
        category: 'required_command',
        text: `Conflicting rules for command: "${cmd}"`,
        severity: 'high',
        reason: `Command "${cmd}" appears in both required_command and forbidden_command rules. Resolve the contradiction in your instruction files.`,
      });
    }
  }

  return suggestions;
}
