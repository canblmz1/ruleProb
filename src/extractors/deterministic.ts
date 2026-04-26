import { Rule } from '../types/index.js';
import { extractRules as heuristicExtractRules } from '../rules/extract.js';

export function runDeterministicExtraction(files: {path: string, content: string}[]): Rule[] {
  return heuristicExtractRules(files);
}
