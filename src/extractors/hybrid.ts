import { Rule, Config } from '../types/index.js';
import { runDeterministicExtraction } from './deterministic.js';
import { runAIAssistedExtractionCached } from './cache.js';
import { validateCandidate } from './validateCandidate.js';

export async function runHybridExtraction(files: {path: string, content: string}[], config: Config): Promise<Rule[]> {
  const deterministicRules = runDeterministicExtraction(files);
  const aiRules = await runAIAssistedExtractionCached(files, config);

  const merged: Rule[] = [];
  const signatures = new Set<string>();

  const getSignature = (r: Rule) => {
    // Drop line number to enable global deduplication for logically identical signatures
    let sig = `${r.sourceFile}:${r.category}`;
    if (r.assertions && r.assertions.length > 0) {
      const a = r.assertions[0] as any;
      if (a.commandIncludes) sig += `:${normalizeSignatureValue(r.category, a.commandIncludes)}`;
      if (a.pattern) sig += `:${normalizeSignatureValue(r.category, a.pattern)}`;
      if (a.manager) sig += `:${a.manager}`;
      if (a.pathPattern) sig += `:${a.pathPattern}`;
    }
    return sig.toLowerCase();
  };

  const debug = (config as any).debugExtractor;
  
  let preFilteredDeterministicCount = deterministicRules.length;
  const filteredDeterministic: Rule[] = [];
  const rejectedDeterministic: {rule: Rule, reason: string}[] = [];
  let duplicatesRemoved = 0;
  
  const repairRule = (rule: Rule): Rule => {
     let targetCategory = rule.category;
     let targetTestable = rule.testable;
     let targetAssertions = rule.assertions;

     const lowerText = rule.text.toLowerCase();
     if (lowerText.includes('always use `pnpm`') || lowerText.includes('always use pnpm')) {
        targetCategory = 'package_manager';
        targetAssertions = [{ type: 'package_manager_required', manager: 'pnpm', forbiddenManagers: ['npm', 'yarn', 'bun'] }];
     }

     if (lowerText.includes('do not commit') || lowerText.includes('never commit')) {
        targetCategory = 'forbidden_command';
        targetAssertions = [{ type: 'forbidden_command', commandIncludes: 'git commit' }];
     }

     if (lowerText.includes('pnpm typecheck')) {
        targetCategory = 'required_command';
        targetTestable = true;
        targetAssertions = [{ type: 'required_command', commandIncludes: 'pnpm typecheck' }];
     }

     if (lowerText.includes('conventional commit') || lowerText.includes('feat(scope):') || lowerText.includes('fix(scope):') || lowerText.includes('docs:')) {
        targetCategory = 'commit_message_format';
        targetTestable = false;
        targetAssertions = [];
     }

     if (lowerText.includes('most tests use') || lowerText.includes('some under') || lowerText.includes('testwith') || lowerText.includes('better-auth/test')) {
        targetCategory = 'informational';
        targetTestable = false;
        targetAssertions = [];
     }
     
     return { ...rule, category: targetCategory, testable: targetTestable, assertions: targetAssertions };
  };

  for (const detRule of deterministicRules) {
     const repairedRule = repairRule(detRule);

     if (!repairedRule.testable) { 
        rejectedDeterministic.push({ rule: repairedRule, reason: 'Testable is explicitly false or informational' });
        filteredDeterministic.push(repairedRule); 
        continue; 
     }

     const val = validateCandidate(repairedRule);
     if (val.valid) {
       filteredDeterministic.push(repairedRule);
     } else {
       rejectedDeterministic.push({ rule: repairedRule, reason: val.reason || 'Invalid' });
     }
  }

  const filteredAi: Rule[] = [];
  const rejectedAi: {rule: Rule, reason: string}[] = [];
  for (const aiRule of aiRules) {
    const repairedRule = repairRule(aiRule);
    if (!repairedRule.testable) {
      filteredAi.push(repairedRule);
      continue;
    }
    const val = validateCandidate(repairedRule);
    if (val.valid) {
      filteredAi.push(repairedRule);
    } else {
      rejectedAi.push({ rule: repairedRule, reason: val.reason || 'Invalid' });
    }
  }

  for (const detRule of filteredDeterministic) {
    const sig = getSignature(detRule);
    if (!signatures.has(sig)) {
      signatures.add(sig);
      merged.push(detRule);
    } else {
      duplicatesRemoved++;
    }
  }

  for (const aiRule of filteredAi) {
    const sig = getSignature(aiRule);
    if (!signatures.has(sig)) {
      signatures.add(sig);
      merged.push(aiRule);
    } else {
      duplicatesRemoved++;
    }
  }

  if (debug) {
     const { getEnv } = await import('../config/env.js');
     const provider = config.provider || 'unknown';
     const keyEnvName = provider === 'gemini'
       ? 'GEMINI_API_KEY'
       : provider === 'opencode-go'
         ? 'OPENCODE_GO_API_KEY'
         : 'OPENROUTER_API_KEY';
     const modelEnvName = provider === 'gemini'
       ? 'GEMINI_MODEL'
       : provider === 'opencode-go'
         ? 'OPENCODE_GO_MODEL'
         : 'OPENROUTER_MODEL';
     const defaultModel = provider === 'gemini'
       ? 'gemini-2.5-flash'
       : provider === 'opencode-go'
         ? '(no default; set OPENCODE_GO_MODEL)'
         : 'openrouter/free';
     const label = provider === 'gemini' ? 'Gemini' : provider === 'opencode-go' ? 'OpenCode Go' : 'OpenRouter';
     const keyVisible = !!getEnv(keyEnvName);
     const model = config.model || getEnv(modelEnvName) || defaultModel;

     console.log('\n--- EXTRACTOR DEBUG ---');
     console.log(`${label} API key visible: ${keyVisible ? 'yes' : 'no'}`);
     console.log(`${label} model: ${model}`);
     console.log(`Extractor mode: hybrid`);
     console.log(`Provider for extraction: ${config.provider || 'none'}`);
     console.log(`Deterministic rules (raw): ${preFilteredDeterministicCount}`);
     console.log(`Deterministic rules (repaired/filtered): ${filteredDeterministic.length}`);
     console.log(`Deterministic rules (rejected as informational/noise): ${rejectedDeterministic.length}`);
     console.log(`AI-assisted candidates: (Tracked in aiAssisted logic)`);
     console.log(`Validated AI rules: ${filteredAi.length}`);
     console.log(`AI rules rejected after repair: ${rejectedAi.length}`);
     console.log(`Merged rules: ${merged.length}`);
     console.log(`Duplicates removed: ${duplicatesRemoved}`);
     console.log(`Fallback used: ${aiRules.length === 0 ? 'yes' : 'no'}`);
     
     if (rejectedDeterministic.length > 0) {
        console.log('\nRejected deterministic:');
        for (const rej of rejectedDeterministic.slice(0, 5)) {
           console.log(`- ${rej.rule.category} "${rej.rule.text.substring(0, 30)}..." reason: ${rej.reason}`);
        }
     }
     if (rejectedAi.length > 0) {
        console.log('\nRejected AI:');
        for (const rej of rejectedAi.slice(0, 5)) {
           console.log(`- ${rej.rule.category} "${rej.rule.text.substring(0, 30)}..." reason: ${rej.reason}`);
        }
     }
     console.log('-----------------------\n');
  }

  return merged;
}

function normalizeSignatureValue(category: string, value: string): string {
  const normalized = value.trim().toLowerCase();
  if (category === 'required_file_change' && /^tests?$/.test(normalized)) {
    return 'test';
  }
  return normalized;
}
