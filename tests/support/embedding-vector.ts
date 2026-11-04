import { EMBEDDING_DIMENSIONS } from '@codemind/core';

/**
 * A vector of `EMBEDDING_DIMENSIONS` components for tests (DIS-67 design S10): the leading components
 * given, the rest 0. `embeddingVector(1)` is the unit vector of the first component, and
 * `embeddingVector(17, 10, 3, 1, 1)` has a cosine similarity of exactly `17 / 20` with it.
 *
 * @param leading The first components.
 */
export function embeddingVector(...leading: number[]): number[] {
  return [...leading, ...new Array<number>(EMBEDDING_DIMENSIONS - leading.length).fill(0)];
}
