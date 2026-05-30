import { embedText, cosineSimilarity } from './similarity.js';
import type { Rule } from '../../types/index.js';

export interface SimilarRule {
  ruleText: string;
  similarity: number;
  verdict: 'duplicate' | 'conflict' | 'related';
}

/**
 * Find rules semantically similar to `candidate` using cosine similarity.
 * Returns top-k results above the similarity threshold.
 */
export async function findSimilarRules(
  candidate: Rule,
  existing: Rule[],
  threshold = 0.85,
  topK = 3
): Promise<SimilarRule[]> {
  const candidateVec = await embedText(candidate.text);
  if (!candidateVec) return [];

  const scored: SimilarRule[] = [];
  for (const rule of existing) {
    if (rule.id === candidate.id) continue;
    const vec = await embedText(rule.text);
    if (!vec) continue;
    const sim = cosineSimilarity(candidateVec, vec);
    if (sim >= threshold) {
      const verdict: SimilarRule['verdict'] =
        sim > 0.95 ? 'duplicate'
        : rule.category !== candidate.category ? 'conflict'
        : 'related';
      scored.push({ ruleText: rule.text, similarity: sim, verdict });
    }
  }
  return scored.sort((a, b) => b.similarity - a.similarity).slice(0, topK);
}
