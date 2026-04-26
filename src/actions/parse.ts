import { ActionPlan } from '../types/index.js';

export function parseActionPlan(rawOutput: string): ActionPlan | null {
  try {
    // 1. Try to parse directly if the model was good
    const directObj = parseJsonLenient(rawOutput);
    if (isValidActionPlan(directObj)) {
      return directObj;
    }
  } catch (e) {
    // fallback
  }

  // 2. Try to extract markdown block
  const markdownRegex = /```(?:json)?\s*([\s\S]*?)```/;
  const match = rawOutput.match(markdownRegex);
  if (match && match[1]) {
    try {
      const blockObj = parseJsonLenient(match[1]);
      if (isValidActionPlan(blockObj)) {
        return blockObj;
      }
    } catch (e) {
      // ignore
    }
  }

  // 3. Try to find the first '{' and last '}'
  const firstBrace = rawOutput.indexOf('{');
  const lastBrace = rawOutput.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && firstBrace < lastBrace) {
    try {
      const bracketObj = parseJsonLenient(rawOutput.substring(firstBrace, lastBrace + 1));
      if (isValidActionPlan(bracketObj)) {
        return bracketObj;
      }
    } catch (e) {
      // ignore
    }
  }

  return null;
}

function parseJsonLenient(str: string): any {
  let cleaned = str.trim();
  cleaned = cleaned.replace(/[\u201c\u201d]/g, '"').replace(/[\u2018\u2019]/g, "'");
  cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');

  if (/^"\s*\{/.test(cleaned)) {
    try {
      cleaned = JSON.parse(cleaned);
    } catch {
      // Keep original string and let the final parse report failure.
    }
  }

  return JSON.parse(cleaned);
}

function isValidActionPlan(obj: any): obj is ActionPlan {
  if (typeof obj !== 'object' || obj === null) return false;
  if (!Array.isArray(obj.actions)) return false;
  // Make sure finalAnswer exists, though we can be lenient
  if (typeof obj.finalAnswer !== 'string') {
    obj.finalAnswer = "";
  }

  // Basic sanity check loop for actions
  for (const act of obj.actions) {
    if (typeof act !== 'object' || act === null || !act.type) return false;
    if (['write_file', 'append_file', 'delete_file'].includes(act.type)) {
      if (typeof act.path !== 'string') return false;
    } else if (act.type === 'run_command') {
      if (typeof act.command !== 'string') return false;
    }
  }

  return true;
}
