export interface ProviderCapability {
  provider: string;
  extraction: string;
  structuredActions: string;
  runtimeExecution: string;
  deterministicFallback: string;
  rawResponseDebug: string;
  localCliExecution: string;
  rateLimitSensitivity: string;
  notes: string;
}

export const providerCapabilities: ProviderCapability[] = [
  {
    provider: 'mock',
    extraction: 'No',
    structuredActions: 'Simulated',
    runtimeExecution: 'Simulated',
    deterministicFallback: 'N/A',
    rawResponseDebug: 'No',
    localCliExecution: 'No',
    rateLimitSensitivity: 'None',
    notes: 'Deterministic CI smoke provider; not evidence of real model behavior.'
  },
  {
    provider: 'dry-run',
    extraction: 'No',
    structuredActions: 'No',
    runtimeExecution: 'No',
    deterministicFallback: 'N/A',
    rawResponseDebug: 'No',
    localCliExecution: 'No',
    rateLimitSensitivity: 'None',
    notes: 'Builds scenarios and reports skipped execution so flows can be inspected safely.'
  },
  {
    provider: 'openrouter',
    extraction: 'Yes',
    structuredActions: 'Yes',
    runtimeExecution: 'Sandboxed action bridge',
    deterministicFallback: 'Yes for extraction',
    rawResponseDebug: 'Yes',
    localCliExecution: 'No',
    rateLimitSensitivity: 'High',
    notes: 'Remote API; quality and availability depend on selected model and quota.'
  },
  {
    provider: 'gemini',
    extraction: 'Yes',
    structuredActions: 'Yes',
    runtimeExecution: 'Sandboxed action bridge',
    deterministicFallback: 'Yes for extraction',
    rawResponseDebug: 'Yes',
    localCliExecution: 'No',
    rateLimitSensitivity: 'Medium to high',
    notes: 'Remote API with JSON-mode extraction/runtime path when a key is available.'
  },
  {
    provider: 'opencode-go',
    extraction: 'Yes',
    structuredActions: 'Yes (OpenAI-compatible)',
    runtimeExecution: 'Experimental (action bridge, real smoke pending)',
    deterministicFallback: 'Yes for extraction',
    rawResponseDebug: 'Yes',
    localCliExecution: 'No',
    rateLimitSensitivity: 'Depends on OpenCode Go subscription',
    notes: 'Beta. Uses opencode.ai/zen/go/v1. Requires OPENCODE_GO_API_KEY and OPENCODE_GO_MODEL (e.g. opencode-go/kimi-k2.6); no default model.'
  },
  {
    provider: 'claude-code',
    extraction: 'No',
    structuredActions: 'No',
    runtimeExecution: 'Real local CLI',
    deterministicFallback: 'N/A',
    rawResponseDebug: 'CLI transcript',
    localCliExecution: 'Yes',
    rateLimitSensitivity: 'Depends on local account',
    notes: 'Runs the installed Claude Code CLI in a sandbox; not apples-to-apples with action-bridge providers.'
  },
  {
    provider: 'anthropic',
    extraction: 'Yes',
    structuredActions: 'Yes',
    runtimeExecution: 'Sandboxed action bridge',
    deterministicFallback: 'Yes for extraction',
    rawResponseDebug: 'Yes',
    localCliExecution: 'No',
    rateLimitSensitivity: 'Medium',
    notes: 'Direct Anthropic Messages API. Requires ANTHROPIC_API_KEY. Default model: claude-3-5-haiku-20241022.'
  },
  {
    provider: 'openai',
    extraction: 'Yes',
    structuredActions: 'Yes',
    runtimeExecution: 'Sandboxed action bridge',
    deterministicFallback: 'Yes for extraction',
    rawResponseDebug: 'Yes',
    localCliExecution: 'No',
    rateLimitSensitivity: 'Medium',
    notes: 'Direct OpenAI Chat Completions API. Requires OPENAI_API_KEY. Default model: gpt-4o-mini.'
  },
  {
    provider: 'ollama',
    extraction: 'Yes',
    structuredActions: 'Yes',
    runtimeExecution: 'Sandboxed action bridge',
    deterministicFallback: 'Yes for extraction',
    rawResponseDebug: 'Yes',
    localCliExecution: 'No',
    rateLimitSensitivity: 'None (local)',
    notes: 'Local Ollama instance. No API key needed. Set OLLAMA_BASE_URL (default: http://localhost:11434) and --model.'
  }
];

export function renderProviderCapabilityMarkdown(): string {
  const header = [
    '| Provider | Extraction | Structured actions | Runtime execution | Deterministic fallback | Raw response debug | Real local CLI | Rate-limit sensitivity | Notes |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |'
  ];

  return [
    ...header,
    ...providerCapabilities.map(capability =>
      `| ${capability.provider} | ${capability.extraction} | ${capability.structuredActions} | ${capability.runtimeExecution} | ${capability.deterministicFallback} | ${capability.rawResponseDebug} | ${capability.localCliExecution} | ${capability.rateLimitSensitivity} | ${capability.notes} |`
    )
  ].join('\n');
}
