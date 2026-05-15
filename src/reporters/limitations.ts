import { Config, EvaluationResult } from '../types/index.js';
import { getEnv } from '../config/env.js';

export interface LimitationNote {
  code: string;
  message: string;
}

export function collectLimitationNotes(results: EvaluationResult[], config: Config): LimitationNote[] {
  const notes = new Map<string, string>();
  const provider = config.provider || 'mock';
  const extractor = config.extractor || 'deterministic';

  add(notes, 'synthetic-scenarios', 'Results are based on generated sandbox scenarios, not a replay of the full repository workflow.');
  add(notes, 'approximate-categories', 'Some rule categories are heuristic and approximate; subjective instructions may be omitted or marked informational.');

  if (provider === 'mock') {
    add(notes, 'mock-provider', 'The mock provider is deterministic simulation; it is useful for CI plumbing but is not proof of real model behavior.');
  }

  if (provider === 'dry-run') {
    add(notes, 'dry-run-provider', 'The dry-run provider does not execute an agent or commands; runtime compliance is intentionally skipped.');
  }

  if (config.noExecuteActions) {
    add(notes, 'actions-disabled', 'Structured provider actions were not executed because --no-execute-actions was used.');
  }

  if (extractor === 'ai-assisted' || extractor === 'hybrid') {
    const keyName = provider === 'gemini'
      ? 'GEMINI_API_KEY'
      : provider === 'opencode-go'
        ? 'OPENCODE_GO_API_KEY'
        : 'OPENROUTER_API_KEY';
    const supportsExtraction = provider === 'gemini' || provider === 'openrouter' || provider === 'opencode-go';
    if (!supportsExtraction) {
      add(notes, 'extractor-provider-mismatch', `${extractor} extraction needs an API extraction provider; ${provider} cannot provide AI extraction candidates.`);
    } else if (!getEnv(keyName)) {
      add(notes, 'deterministic-extraction-fallback', `${extractor} extraction could not use ${provider} credentials, so deterministic fallback behavior may have been used.`);
    } else if (provider === 'opencode-go' && !config.model && !getEnv('OPENCODE_GO_MODEL')) {
      add(notes, 'opencode-go-model-missing', `OpenCode Go requires OPENCODE_GO_MODEL or --model; deterministic fallback used because no model was selected.`);
    }
  }

  for (const result of results) {
    for (const note of collectResultLimitationNotes(result)) {
      add(notes, note.code, note.message);
    }
  }

  return Array.from(notes.entries()).map(([code, message]) => ({ code, message }));
}

export function collectResultLimitationNotes(result: EvaluationResult): LimitationNote[] {
  const notes = new Map<string, string>();
  const raw = result.providerResult.rawOutput || '';
  const lower = raw.toLowerCase();

  if (result.status === 'SKIPPED') {
    if (result.skipReason === 'DRY_RUN') {
      add(notes, 'skipped-dry-run', 'This scenario was skipped because the provider is in dry-run or stub mode.');
    } else if (result.skipReason === 'NO_ASSERTIONS') {
      add(notes, 'skipped-no-assertions', 'This scenario was skipped because the rule has no testable assertions.');
    } else if (result.skipReason === 'ALL_ASSERTIONS_SKIPPED') {
      add(notes, 'skipped-no-data', 'This scenario was skipped because the provider did not return inspectable file contents needed to evaluate code-pattern assertions.');
    } else {
      add(notes, 'skipped-results', 'This scenario was skipped, so it does not prove runtime compliance.');
    }
  }

  if (lower.includes('requires') && lower.includes('api_key')) {
    add(notes, 'missing-provider-key', 'The provider API key was missing for this scenario.');
  }

  if (lower.includes('429') || lower.includes('rate limit') || lower.includes('quota') || lower.includes('too many requests')) {
    add(notes, 'rate-limit', 'Provider output indicates rate limiting or quota pressure for this scenario.');
  }

  if (lower.includes('could not parse') || lower.includes('malformed') || lower.includes('invalid root json')) {
    add(notes, 'structured-output', 'The provider response could not be parsed as the expected structured action plan.');
  }

  if (result.providerResult.success === false) {
    add(notes, 'provider-failure', 'The provider failed before compliance could be fully verified.');
  }

  return Array.from(notes.entries()).map(([code, message]) => ({ code, message }));
}

function add(notes: Map<string, string>, code: string, message: string): void {
  if (!notes.has(code)) notes.set(code, message);
}
