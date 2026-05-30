/**
 * Cosine similarity and ML availability check.
 * Works without transformers.js (fallback: embedText returns undefined).
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

let _pipeline: any = null;

export async function isMLAvailable(): Promise<boolean> {
  try {
    await import('@xenova/transformers');
    return true;
  } catch {
    return false;
  }
}

export async function embedText(text: string): Promise<number[] | undefined> {
  try {
    if (!_pipeline) {
      const { pipeline } = await import('@xenova/transformers');
      _pipeline = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    }
    const output = await _pipeline(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data as Float32Array);
  } catch {
    return undefined;
  }
}
