import { ProviderResult } from '../types/index.js';

export function normalizeProviderResult(result: Partial<ProviderResult>): ProviderResult {
  return {
    ...(result.kind ? { kind: result.kind } : {}),
    success: typeof result.success === 'boolean' ? result.success : false,
    finalAnswer: result.finalAnswer || "",
    changedFiles: result.changedFiles || [],
    changedFileContents: result.changedFileContents || {},
    commands: result.commands || [],
    rawOutput: result.rawOutput || ""
  };
}
