/** One golden demo question: its id and exact text in the demo-question table of `fixtures/README.md`. */
export interface GoldenQuestion {
  /** The row id, `Q` followed by digits. */
  readonly id: string;
  /** The question, exactly as the table writes it. */
  readonly question: string;
}

/** A sample project that has golden demo questions, and those questions in golden order. */
export interface GoldenProject {
  /** The sample project's name, also the name of its golden file `seeds/cache/<name>.json`. */
  readonly name: string;
  /** Its golden questions, in golden order. */
  readonly questions: readonly GoldenQuestion[];
}

/**
 * The golden projects, in name order (DIS-26 decision D2; two projects since DIS-32, design D6), each
 * with the golden questions of its demo-question table in `fixtures/README.md`, whose texts are copied
 * here.
 *
 * acme-shop: the price, the coupon and the observer questions; Q2 (impact) and Q5 (documentation
 * drift) are other capabilities, and Q6 answers `UNKNOWN` `no-anchor` without the model or the cache.
 *
 * task-api: the validation, pagination and status-transition questions. Q1 and Q2 name a symbol of the
 * graph (`taskRoutes`, `buildPage`) because every golden question must anchor a symbol of its project
 * (a question that anchors none answers `UNKNOWN` `no-anchor` before the cache is read); Q4 (an
 * `UNKNOWN`: the repository has no authentication) is no golden question.
 */
export const GOLDEN_PROJECTS: readonly GoldenProject[] = [
  {
    name: 'acme-shop',
    questions: [
      { id: 'Q1', question: '¿Cómo se calcula el precio final de un pedido?' },
      { id: 'Q3', question: '¿Cómo se validan los cupones?' },
      { id: 'Q4', question: '¿Qué hace OrderObserver al crear un pedido?' },
    ],
  },
  {
    name: 'task-api',
    questions: [
      { id: 'Q1', question: '¿Cómo valida taskRoutes las peticiones entrantes?' },
      { id: 'Q2', question: '¿Qué hace buildPage con los resultados paginados?' },
      { id: 'Q3', question: '¿Qué transiciones de estado son válidas?' },
    ],
  },
];
