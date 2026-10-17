/** The sample project whose demo questions have golden answers (DIS-26 decision D2). */
export const GOLDEN_PROJECT = 'acme-shop';

/** One golden demo question: its id and exact text in the demo-question table of `fixtures/README.md`. */
export interface GoldenQuestion {
  /** The row id, `Q` followed by digits. */
  readonly id: string;
  /** The question, exactly as the table writes it. */
  readonly question: string;
}

/**
 * The golden demo questions of acme-shop, in golden order (DIS-26 decision D2): the price, the coupon
 * and the observer questions of `fixtures/README.md`. Q2 (impact) and Q5 (documentation drift) are
 * other capabilities, and Q6 answers `UNKNOWN` `no-anchor` without the model or the cache.
 */
export const GOLDEN_QUESTIONS: readonly GoldenQuestion[] = [
  { id: 'Q1', question: '¿Cómo se calcula el precio final de un pedido?' },
  { id: 'Q3', question: '¿Cómo se validan los cupones?' },
  { id: 'Q4', question: '¿Qué hace OrderObserver al crear un pedido?' },
];
