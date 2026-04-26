import { ProviderResult } from '../types/index.js';

export function normalizeProviderResult(result: Partial<ProviderResult>): ProviderResult {
  return {
    success: typeof result.success === 'boolean' ? result.success : false,
    finalAnswer: result.finalAnswer || "",
    changedFiles: result.changedFiles || [],
    changedFileContents: result.changedFileContents || {},
    // Mapping both commands and commandsRun (some providers used that name erroneously)
    commands: result.commands || (result as any).commandsRun || [],
    rawOutput: result.rawOutput || ""
  };
}
