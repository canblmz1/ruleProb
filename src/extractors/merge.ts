import { Rule } from '../types/index.js';
import { runDeterministicExtraction } from '../extractors/deterministic.js';
import { runAIAssistedExtractionCached } from '../extractors/cache.js';
import { runHybridExtraction } from '../extractors/hybrid.js';

export async function routeExtraction(files: {path: string, content: string}[], config: any): Promise<Rule[]> {
  const mode = config.extractor || 'deterministic';

  if (mode === 'hybrid') {
    return runHybridExtraction(files, config);
  } else if (mode === 'ai-assisted') {
    return runAIAssistedExtractionCached(files, config);
  } else {
    return runDeterministicExtraction(files);
  }
}
