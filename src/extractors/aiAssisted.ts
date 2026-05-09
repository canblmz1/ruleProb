import { Rule, CandidateRule, Config } from '../types/index.js';
import { validateCandidate } from './validateCandidate.js';
import { getEnv } from '../config/env.js';
import { runDeterministicExtraction } from './deterministic.js';

type ProviderKind = 'gemini' | 'openrouter' | 'opencode-go';

interface ProviderProfile {
  kind: ProviderKind;
  apiKey: string;
  model: string;
  baseUrl: string;
  rawFile: string;
  label: string;
  authHeaderMode: 'bearer' | 'x-api-key';
}

const SUPPORTED_PROVIDERS: ProviderKind[] = ['gemini', 'openrouter', 'opencode-go'];

export async function runAIAssistedExtraction(files: { path: string, content: string }[], config: Config): Promise<Rule[]> {
  const rules: Rule[] = [];
  const rejectedCandidates: { candidate: CandidateRule, reason: string }[] = [];

  const provider = config.provider as ProviderKind | string | undefined;
  const debug = (config as any).debugExtractor;

  if (!provider || !SUPPORTED_PROVIDERS.includes(provider as ProviderKind)) {
    if (debug) {
      console.log('\n--- EXTRACTOR DEBUG ---');
      console.log(`AI-assisted extraction is not supported by provider "${provider}".`);
      console.log('Fell back to deterministic behavior or empty yield safely.');
      console.log('-----------------------\n');
    }
    return config.extractor === 'ai-assisted' ? runDeterministicExtraction(files) : [];
  }

  const profile = resolveProviderProfile(provider as ProviderKind, config);
  if (!profile) {
    // Reason already logged in resolveProviderProfile via debug; warn user too.
    const keyName = expectedKeyName(provider as ProviderKind);
    console.warn(`AI-Assisted Extractor requires ${keyName}${provider === 'opencode-go' ? ' and OPENCODE_GO_MODEL (or --model opencode-go/<id>)' : ''}. Falling back deterministically when possible.`);
    return config.extractor === 'ai-assisted' ? runDeterministicExtraction(files) : [];
  }

  const timeoutMs = config.providerTimeoutMs || Number(getEnv('RULEPROBE_PROVIDER_TIMEOUT_MS')) || 60000;

  if (debug) {
    console.log(`\n--- ${profile.label} EXTRACTOR DEBUG ---`);
    console.log(`${profile.label} API key visible: ${profile.apiKey ? 'yes' : 'no'}`);
    console.log(`${profile.label} model: ${profile.model}`);
    console.log(`${profile.label} base URL: ${profile.baseUrl}`);
    console.log(`${profile.label} timeout (ms): ${timeoutMs}`);
    console.log('---');
  }

  for (const file of files) {
    const systemPrompt = buildExtractionPrompt(file.path);

    let requestSent = false;
    let responseReceived = false;
    let httpStatus = 0;
    let parseSuccess = false;
    let usedFallback = false;
    let localTimeoutFired = false;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        localTimeoutFired = true;
        controller.abort();
      }, timeoutMs);

      if (debug) {
        console.log(`${profile.label} request URL: ${buildMaskedUrl(profile)}`);
        console.log(`${profile.label} request body shape: model=${profile.model}, messages=2, auth=${profile.authHeaderMode}`);
      }

      requestSent = true;
      const response = await dispatchExtractionRequest(profile, systemPrompt, file.content, controller.signal);
      clearTimeout(timeoutId);
      responseReceived = true;
      httpStatus = response.status;

      const jsonText = await response.text();
      const parsed = parseProviderRulesPayload(jsonText, profile.kind);
      parseSuccess = parsed.success;

      if (debug) {
        console.log(`${profile.label} request sent: ${requestSent ? 'yes' : 'no'}`);
        console.log(`${profile.label} response received: ${responseReceived ? 'yes' : 'no'}`);
        console.log(`${profile.label} http status: ${httpStatus}`);
        console.log(`${profile.label} response length: ${jsonText.length}`);
        console.log(`${profile.label} parse success: ${parseSuccess}`);
        console.log(`${profile.label} parse attempts: ${parsed.tried.join(', ') || '(none)'}`);
        console.log(`${profile.label} preview: ${sanitizeProviderText(parsed.preview).slice(0, 500)}`);
        if (parsed.error) console.log(`${profile.label} parse error: ${parsed.error}`);
      }

      if (!parsed.success) {
        await saveRawExtractorResponse(profile.rawFile, jsonText);
        usedFallback = true;
        console.warn(`AI extractor could not parse JSON payload (${profile.label}, http ${httpStatus}). Raw response saved to ${profile.rawFile}. Falling back to deterministic extraction.`);
        if (config.extractor === 'ai-assisted') {
          rules.push(...runDeterministicExtraction([{ path: file.path, content: file.content }]));
        }
        if (debug) console.log(`${profile.label} fallback used: ${usedFallback ? 'yes' : 'no'}`);
        continue;
      }

      if (Array.isArray(parsed.block?.rules)) {
        for (const candidate of parsed.block.rules) {
          const validation = validateCandidate(candidate);
          if (validation.valid) {
            rules.push(candidate);
          } else {
            rejectedCandidates.push({ candidate, reason: validation.reason || 'Invalid' });
          }
        }
      }

      if (debug) console.log(`${profile.label} fallback used: ${usedFallback ? 'yes' : 'no'}`);
    } catch (e) {
      const isAbort = e instanceof Error && e.name === 'AbortError';
      let errMsg: string;
      let abortKind = '';
      if (isAbort && localTimeoutFired) {
        abortKind = 'local-timeout';
        errMsg = `local AbortController timeout after ${timeoutMs}ms — try increasing RULEPROBE_PROVIDER_TIMEOUT_MS` + (profile.kind === 'opencode-go' ? ' or OPENCODE_GO_TIMEOUT_MS' : '');
      } else if (isAbort) {
        abortKind = 'remote-abort';
        errMsg = `remote connection aborted before a response was received — the server closed the connection. Troubleshooting: (1) try the namespaced model form e.g. "opencode-go/${profile.model}", (2) verify plan/model entitlement at https://opencode.ai, (3) try OPENCODE_GO_AUTH_HEADER_MODE=x-api-key, (4) run "ruleprobe doctor"`;
      } else {
        errMsg = e instanceof Error ? e.message : String(e);
      }
      console.warn(`${profile.label} extractor fetch failed: ${errMsg}. Falling back to deterministic extraction.`);
      if (config.extractor === 'ai-assisted') {
        rules.push(...runDeterministicExtraction([{ path: file.path, content: file.content }]));
      }
      if (debug) {
        console.log(`${profile.label} fetch error type: ${isAbort ? abortKind : 'network-error'}`);
        console.log(`${profile.label} fetch error: ${errMsg}`);
        console.log(`${profile.label} fallback used: yes`);
      }
    }
  }

  if (debug) {
    console.log('------------------------------\n');
    if (rejectedCandidates.length > 0) {
      console.log('Rejected AI extraction candidates:');
      for (const rejected of rejectedCandidates.slice(0, 5)) {
        console.log(`- ${rejected.reason}: ${String(rejected.candidate?.text || '').slice(0, 80)}`);
      }
    }
  }

  return rules;
}

function expectedKeyName(kind: ProviderKind): string {
  if (kind === 'gemini') return 'GEMINI_API_KEY';
  if (kind === 'openrouter') return 'OPENROUTER_API_KEY';
  return 'OPENCODE_GO_API_KEY';
}

function resolveProviderProfile(kind: ProviderKind, config: Config): ProviderProfile | null {
  if (kind === 'gemini') {
    const apiKey = getEnv('GEMINI_API_KEY');
    if (!apiKey) return null;
    return {
      kind,
      apiKey,
      model: config.model || getEnv('GEMINI_MODEL') || 'gemini-2.5-flash',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      rawFile: '.ruleprobe/gemini-extractor-raw.txt',
      label: 'GEMINI',
      authHeaderMode: 'bearer'
    };
  }

  if (kind === 'openrouter') {
    const apiKey = getEnv('OPENROUTER_API_KEY');
    if (!apiKey) return null;
    return {
      kind,
      apiKey,
      model: config.model || getEnv('OPENROUTER_MODEL') || 'openrouter/free',
      baseUrl: 'https://openrouter.ai/api/v1',
      rawFile: '.ruleprobe/openrouter-extractor-raw.txt',
      label: 'OPENROUTER',
      authHeaderMode: 'bearer'
    };
  }

  // opencode-go — OpenAI-compatible Zen endpoint.
  // Auth header mode: defaults to bearer. Set OPENCODE_GO_AUTH_HEADER_MODE=x-api-key if the
  // endpoint expects X-Api-Key instead of Authorization: Bearer.
  const apiKey = getEnv('OPENCODE_GO_API_KEY');
  if (!apiKey) return null;
  const model = config.model || getEnv('OPENCODE_GO_MODEL');
  if (!model) return null; // no documented default: require explicit model
  const baseUrl = (getEnv('OPENCODE_GO_BASE_URL') || 'https://opencode.ai/zen/go/v1').replace(/\/+$/, '');
  const rawAuthMode = getEnv('OPENCODE_GO_AUTH_HEADER_MODE') || 'bearer';
  const authHeaderMode: 'bearer' | 'x-api-key' = rawAuthMode === 'x-api-key' ? 'x-api-key' : 'bearer';
  return {
    kind,
    apiKey,
    model,
    baseUrl,
    rawFile: '.ruleprobe/opencode-go-extractor-raw.txt',
    label: 'OPENCODE_GO',
    authHeaderMode
  };
}

function buildMaskedUrl(profile: ProviderProfile): string {
  if (profile.kind === 'gemini') {
    return `${profile.baseUrl}/models/${profile.model}:generateContent?key=[REDACTED]`;
  }
  return `${profile.baseUrl}/chat/completions`;
}

async function dispatchExtractionRequest(profile: ProviderProfile, systemPrompt: string, fileContent: string, signal: AbortSignal): Promise<Response> {
  if (profile.kind === 'gemini') {
    return fetch(`${profile.baseUrl}/models/${profile.model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': profile.apiKey },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: `${systemPrompt}\n\n${fileContent}` }]
          }
        ],
        generationConfig: {
          temperature: 0,
          responseMimeType: 'application/json'
        }
      }),
      signal
    });
  }

  // openrouter and opencode-go are both OpenAI-compatible chat/completions.
  const authHeaders: Record<string, string> = profile.authHeaderMode === 'x-api-key'
    ? { 'X-Api-Key': profile.apiKey }
    : { Authorization: `Bearer ${profile.apiKey}` };

  return fetch(`${profile.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      ...authHeaders,
      'Content-Type': 'application/json',
      'X-Title': 'RuleProbe'
    },
    body: JSON.stringify({
      model: profile.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: fileContent }
      ],
      temperature: 0.1
    }),
    signal
  });
}

function buildExtractionPrompt(filePath: string): string {
  return `You are RuleProbe's instruction extraction engine.
Your job is to extract only concrete, testable rules from AI coding instruction files.

Do not classify every backtick token as a command.
A token is a command only if it starts with an executable such as:
pnpm, npm, yarn, bun, npx, node, vitest, playwright, docker, git, bazel, cargo, go, python, pytest, eslint, biome, tsc, turbo, nx.

Backtick tokens like Uint8Array, Buffer, import type, node:crypto, getTestInstance(), testWith, feat(scope):, docs:, chore: are code patterns or informational, not commands.

Return only JSON matching this schema:

{
  "rules": [
    {
      "id": "rule-1",
      "text": "original rule text",
      "category": "package_manager | forbidden_command | required_command | forbidden_file_change | required_file_change | code_pattern_forbidden | code_pattern_required | final_answer_required | final_answer_not_contains | commit_message_format | informational | unknown",
      "testable": true,
      "severity": "low | medium | high",
      "sourceFile": "${filePath}",
      "lineNumber": 1,
      "assertions": [],
      "reason": ""
    }
  ]
}

Important classification rules:
- "ALWAYS use pnpm, never npm/yarn/bun" => package_manager with package_manager_required assertion.
- "NEVER run pnpm test" => forbidden_command with forbidden_command assertion.
- "Use vitest instead" => required_command only if it clearly instructs running vitest tools.
- "Use Uint8Array instead of Buffer" => code_pattern_required Uint8Array + code_pattern_forbidden Buffer.
- "Never use any/classes" => code_pattern_forbidden.
- "Use import type" => code_pattern_required.
- "Use node: protocol" => code_pattern_required.
- "DO NOT COMMIT" => forbidden_command git commit.
- "Do not include phrase X in the final answer" => final_answer_not_contains.
- Preserve explicit file paths/globs like src/generated/*, docs/**/*.md, package.json exactly in assertion.pattern.
- Conventional commit examples are informational unless specifically bounding git commits.
- Informational lines must be testable false.
- Preserve sourceFile exactly as "${filePath}" and lineNumber natively.
- Return up to 30 rules if present.`;
}

function parseProviderRulesPayload(jsonText: string, kind: ProviderKind): { success: boolean; block: any; tried: string[]; preview: string; error?: string } {
  const tried: string[] = [];
  let content = jsonText;
  let lastError: unknown;

  try {
    const root = JSON.parse(jsonText);
    if (root && Array.isArray(root.rules)) {
      return { success: true, block: root, tried: ['root'], preview: jsonText };
    }

    if (kind === 'gemini') {
      content = root.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } else {
      // openrouter and opencode-go both follow OpenAI chat-completions shape.
      content = root.choices?.[0]?.message?.content || '';
    }
  } catch (e) {
    lastError = e;
    content = jsonText;
  }

  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced?.[1]) {
    tried.push('fenced');
    try {
      const block = JSON.parse(cleanJson(fenced[1]));
      if (Array.isArray(block?.rules)) return { success: true, block, tried, preview: content };
    } catch (e) {
      lastError = e;
    }
  }

  tried.push('direct');
  try {
    const block = JSON.parse(cleanJson(content));
    if (Array.isArray(block?.rules)) return { success: true, block, tried, preview: content };
  } catch (e) {
    lastError = e;
  }

  tried.push('substring');
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const block = JSON.parse(cleanJson(jsonMatch[0]));
      if (Array.isArray(block?.rules)) return { success: true, block, tried, preview: content };
    } catch (e) {
      lastError = e;
    }
  }

  return { success: false, block: null, tried, preview: content, error: lastError ? String(lastError) : undefined };
}

function cleanJson(str: string): string {
  let cleaned = str.trim();
  cleaned = cleaned.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');

  if (/^"\s*\{/.test(cleaned)) {
    try {
      cleaned = JSON.parse(cleaned);
    } catch {
      // Leave the string as-is and let JSON.parse report the original problem.
    }
  }

  return cleaned;
}

async function saveRawExtractorResponse(targetFile: string, raw: string): Promise<void> {
  try {
    const fs = await import('fs');
    fs.mkdirSync('.ruleprobe', { recursive: true });
    fs.writeFileSync(targetFile, sanitizeProviderText(raw), 'utf8');
  } catch (err) {
    console.warn(`Failed to persist raw AI extractor response: ${String(err)}`);
  }
}

function sanitizeProviderText(text: string): string {
  return text
    .replace(/sk-or-v1-[A-Za-z0-9_-]+/g, '[REDACTED_OPENROUTER_KEY]')
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[REDACTED_GEMINI_KEY]')
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, '[REDACTED_KEY]')
    .replace(/(OPENROUTER_API_KEY|GEMINI_API_KEY|OPENCODE_GO_API_KEY|OPENCODE_API_KEY|ANTHROPIC_API_KEY|OPENAI_API_KEY)\s*=?\s*['"]?[A-Za-z0-9_-]+['"]?/g, '$1=[REDACTED]');
}
