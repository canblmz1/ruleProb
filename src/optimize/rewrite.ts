import type { RuleHistory } from '../history/ruleHistory.js';
import type { Config } from '../types/index.js';
import { getEnv } from '../config/env.js';

export interface RewriteResult {
  before: string;
  after: string;
  rationale: string;
}

const FORBIDDEN_CATEGORIES = new Set([
  'forbidden_command',
  'forbidden_file_change',
  'code_pattern_forbidden',
  'final_answer_not_contains',
  'license_change_forbidden',
]);

const REQUIRED_CATEGORIES = new Set([
  'required_command',
  'required_file_change',
  'code_pattern_required',
  'final_answer_required',
  'package_manager',
  'linter_must_run',
  'commit_message_format',
]);

function deriveDirective(category: string): 'NEVER' | 'ALWAYS' {
  if (FORBIDDEN_CATEGORIES.has(category)) return 'NEVER';
  if (REQUIRED_CATEGORIES.has(category)) return 'ALWAYS';
  // Default: check the category name
  if (category.includes('forbidden') || category.includes('not_contain')) return 'NEVER';
  return 'ALWAYS';
}

function deriveExample(ruleText: string, directive: 'NEVER' | 'ALWAYS', category: string): string {
  const text = ruleText.trim();

  // Extract command-like tokens (backtick-wrapped)
  const cmdMatch = text.match(/`([^`]+)`/);
  if (cmdMatch) {
    const cmd = cmdMatch[1];
    if (directive === 'NEVER') {
      return `Bad: \`${cmd}\`  Good: use the approved alternative instead`;
    }
    return `Run: \`${cmd}\` — do not skip this step`;
  }

  // Pattern-based examples
  if (category === 'package_manager') {
    return `Use \`pnpm install\` not \`npm install\` or \`yarn add\``;
  }
  if (category === 'required_command') {
    return `Run the required command before finishing; confirm it exits 0`;
  }
  if (category === 'forbidden_command') {
    return `Do not include this command in any \`run_command\` action`;
  }
  if (category.includes('code_pattern')) {
    return `Check all changed file contents; do not write the forbidden pattern`;
  }

  return directive === 'NEVER'
    ? `Avoid: ${text.slice(0, 60)}…`
    : `Do: ${text.slice(0, 60)}…`;
}

export function rewriteRuleDeterministic(h: RuleHistory): RewriteResult {
  const before = h.ruleText;
  const category = h.signature.split('::')[0] ?? 'unknown';
  const directive = deriveDirective(category);

  // Strip existing directive prefixes to avoid duplication
  const stripped = before
    .replace(/^(ALWAYS|NEVER|DO NOT|MUST|SHOULD|AVOID)\s+/i, '')
    .replace(/^(always|never)\s+/i, '')
    .trim();

  // Capitalize first letter
  const body = stripped.charAt(0).toUpperCase() + stripped.slice(1);

  const example = deriveExample(before, directive, category);
  const after = `${directive} ${body}\n  Example: ${example}`;

  const rationale =
    `Rule was rewritten to be unambiguous: added "${directive}" imperative prefix ` +
    `and a concrete few-shot example so AI coding agents cannot misinterpret it. ` +
    `Category: ${category}.`;

  return { before, after, rationale };
}

export async function rewriteRule(
  h: RuleHistory,
  config: Config
): Promise<RewriteResult> {
  // Try AI rewrite if a supported provider key is available
  const hasAI = !!(
    getEnv('ANTHROPIC_API_KEY') ||
    getEnv('OPENAI_API_KEY') ||
    getEnv('GEMINI_API_KEY') ||
    getEnv('OPENROUTER_API_KEY')
  );

  if (hasAI) {
    try {
      return await rewriteRuleWithAI(h, config);
    } catch {
      // fall through to deterministic
    }
  }

  return rewriteRuleDeterministic(h);
}

async function rewriteRuleWithAI(
  h: RuleHistory,
  config: Config
): Promise<RewriteResult> {
  const { cleanJson, repairTruncatedJson } = await import('../extractors/aiAssisted.js');

  const prompt =
    `Rewrite this repository rule so an AI coding agent cannot misread it.\n` +
    `Requirements:\n` +
    `- Single imperative sentence starting with ALWAYS or NEVER\n` +
    `- Keep any commands in backticks\n` +
    `- Append one concrete few-shot example on a new line starting with "Example:"\n` +
    `- Return ONLY valid JSON: {"after": "...", "rationale": "..."}\n\n` +
    `Rule to rewrite: "${h.ruleText}"`;

  // Select the best available provider
  let apiKey = getEnv('ANTHROPIC_API_KEY');
  let endpoint = 'https://api.anthropic.com/v1/messages';
  let headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-api-key': apiKey ?? '',
    'anthropic-version': '2023-06-01',
  };
  let body: unknown;
  let extractContent: (d: unknown) => string;

  if (apiKey) {
    body = {
      model: config.model ?? 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    };
    extractContent = (d: any) => d?.content?.[0]?.text ?? '';
  } else if ((apiKey = getEnv('OPENAI_API_KEY') ?? '')) {
    endpoint = 'https://api.openai.com/v1/chat/completions';
    headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` };
    body = {
      model: config.model ?? 'gpt-4o-mini',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
    };
    extractContent = (d: any) => d?.choices?.[0]?.message?.content ?? '';
  } else if ((apiKey = getEnv('GEMINI_API_KEY') ?? '')) {
    const m = config.model ?? 'gemini-2.0-flash';
    endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`;
    headers = { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey };
    body = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json' },
    };
    extractContent = (d: any) => d?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  } else {
    apiKey = getEnv('OPENROUTER_API_KEY') ?? '';
    endpoint = 'https://openrouter.ai/api/v1/chat/completions';
    headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` };
    body = {
      model: config.model ?? 'openai/gpt-4o-mini',
      temperature: 0,
      messages: [{ role: 'user', content: prompt }],
    };
    extractContent = (d: any) => d?.choices?.[0]?.message?.content ?? '';
  }

  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 15000);

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: controller.signal,
  });
  clearTimeout(tid);

  if (!res.ok) throw new Error(`AI rewrite API returned ${res.status}`);

  const raw = await res.text();
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error('Invalid JSON from AI'); }

  const content = extractContent(parsed);
  if (!content) throw new Error('Empty content from AI');

  let json: any;
  try {
    json = JSON.parse(cleanJson(content));
  } catch {
    try {
      json = JSON.parse(repairTruncatedJson(cleanJson(content)));
    } catch {
      throw new Error('Could not parse AI rewrite JSON');
    }
  }

  const after = typeof json?.after === 'string' ? json.after.trim() : '';
  const rationale = typeof json?.rationale === 'string' ? json.rationale.trim() : 'AI-generated rewrite';

  if (!after) throw new Error('AI returned empty after field');

  return { before: h.ruleText, after, rationale };
}
