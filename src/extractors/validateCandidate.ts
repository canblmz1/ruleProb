import { CandidateRule, ValidationResponse } from '../types/index.js';

export function isCommandLike(token: string): boolean {
  if (!token) return false;
  const startCommands = [
    'pnpm', 'npm', 'yarn', 'bun', 'npx', 'node', 
    'vitest', 'playwright', 'docker', 'docker compose', 'git', 
    'bazel', 'cargo', 'go', 'python', 'pytest', 
    'eslint', 'biome', 'tsc', 'turbo', 'nx'
  ];
  
  const trimmed = token.trim();
  for (const cmd of startCommands) {
    if (trimmed.startsWith(cmd + ' ') || trimmed === cmd) {
      return true;
    }
  }
  return false;
}

const ALLOWED_CATEGORIES = [
  'package_manager', 'forbidden_command', 'required_command', 
  'forbidden_file_change', 'required_file_change', 
  'code_pattern_forbidden', 'code_pattern_required', 
  'final_answer_required', 'final_answer_not_contains', 'commit_message_format', 
  'informational', 'unknown'
];

export function validateCandidate(rule: CandidateRule): ValidationResponse {
  if (!rule.category || !ALLOWED_CATEGORIES.includes(rule.category)) {
    return { valid: false, reason: `Invalid category: ${rule.category}` };
  }

  if (!Array.isArray(rule.assertions)) {
    return { valid: false, reason: 'assertions must be an array' };
  }
  
  if (rule.category === 'informational' || rule.category === 'unknown' || rule.category === 'commit_message_format') {
    if (rule.testable !== false) {
      return { valid: false, reason: `${rule.category} rules must have testable=false` };
    }
  }

  if (rule.category === 'package_manager') {
    if (!rule.assertions.some((a: any) => a.type === 'package_manager_required' && typeof a.manager === 'string' && a.manager.length > 0)) {
      return { valid: false, reason: `package_manager requires a package_manager_required manager assertion` };
    }
  }

  if (rule.category === 'forbidden_command' || rule.category === 'required_command') {
    let hasCmd = false;
    for (const a of rule.assertions) {
      const assertion = a as any;
      if (assertion.type !== rule.category) {
        return { valid: false, reason: `${rule.category} assertion type mismatch: ${assertion.type}` };
      }
      if (typeof assertion.commandIncludes === 'string' && assertion.commandIncludes.length > 0) {
        hasCmd = true;
        const lowerCmd = assertion.commandIncludes.toLowerCase();
        
        // Handle explicit "DO NOT COMMIT" fallback mapped manually sometimes
        if (rule.category === 'forbidden_command' && lowerCmd.includes('git commit')) {
           continue; 
        }

        const exactTokensBlocked = [
          'uint8array', 'buffer', 'import type', 'node:crypto', 
          'gettestinstance()', 'testwith', 'better-auth/test', 
          'feat(scope):', 'docs:', 'chore:', '!'
        ];
        
        if (exactTokensBlocked.includes(lowerCmd)) {
          return { valid: false, reason: `${rule.category} token rejected explicitly: ${assertion.commandIncludes}` };
        }
        
        if (!isCommandLike(assertion.commandIncludes)) {
          return { valid: false, reason: `${rule.category} token is not command-like: ${assertion.commandIncludes}` };
        }
      }
    }
    if (!hasCmd) {
      return { valid: false, reason: `${rule.category} requires commandIncludes` };
    }
  }

  if (rule.category === 'code_pattern_forbidden' || rule.category === 'code_pattern_required') {
    if (!rule.assertions.some((a: any) => a.type === rule.category && typeof a.pattern === 'string' && a.pattern.length > 0)) {
      return { valid: false, reason: `${rule.category} requires pattern field` };
    }
  }

  if (rule.category === 'forbidden_file_change' || rule.category === 'required_file_change') {
    if (!rule.assertions.some((a: any) => a.type === rule.category && typeof a.pattern === 'string' && a.pattern.length > 0)) {
      return { valid: false, reason: `${rule.category} requires pattern field` };
    }
  }

  if (rule.category === 'final_answer_required') {
    if (!rule.assertions.some((a: any) => a.type === 'final_answer_contains' && typeof a.text === 'string' && a.text.length > 0)) {
      return { valid: false, reason: 'final_answer_required requires final_answer_contains text' };
    }
  }

  if (rule.category === 'final_answer_not_contains') {
    if (!rule.assertions.some((a: any) => a.type === 'final_answer_not_contains' && typeof a.text === 'string' && a.text.length > 0)) {
      return { valid: false, reason: 'final_answer_not_contains requires final_answer_not_contains text' };
    }
  }

  if (!rule.sourceFile) {
    return { valid: false, reason: 'sourceFile is required' };
  }

  return { valid: true };
}
