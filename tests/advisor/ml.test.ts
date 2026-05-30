import { describe, it, expect } from 'vitest';
import { cosineSimilarity, isMLAvailable } from '../../src/advisor/ml/similarity.js';

describe('ML similarity', () => {
  it('cosineSimilarity returns 1.0 for identical vectors', () => {
    const v = [0.1, 0.5, 0.3];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0, 5);
  });

  it('cosineSimilarity returns 0.0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0.0, 5);
  });

  it('isMLAvailable returns a boolean without throwing', async () => {
    const result = await isMLAvailable();
    expect(typeof result).toBe('boolean');
  });
});
