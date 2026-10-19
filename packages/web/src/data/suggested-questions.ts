import { SAMPLE_PROJECTS } from './sample-projects';

/**
 * The suggested questions of each sample project, by project name: the questions of its golden answers
 * file (`seeds/cache/<project>.json`), in golden order (DIS-65 design D5). Written by hand, unlike
 * {@link SAMPLE_PROJECTS}: the coherence test `tests/unit/seed/suggested-questions-coherence.spec.ts`
 * fails when they stop being the golden questions.
 */
const QUESTIONS_BY_NAME: ReadonlyArray<readonly [name: string, questions: readonly string[]]> = [
  [
    'acme-shop',
    [
      '¿Cómo se calcula el precio final de un pedido?',
      '¿Cómo se validan los cupones?',
      '¿Qué hace OrderObserver al crear un pedido?',
    ],
  ],
];

/**
 * The suggested questions of Screen 2 (ask-page, "Suggested questions"), keyed by the id of the sample
 * project, taken from {@link SAMPLE_PROJECTS} rather than copied. Hand-written and guarded by
 * `tests/unit/seed/suggested-questions-coherence.spec.ts`: they are exactly the golden questions of the
 * project, in order, so that in evaluation mode each one is answered from the answer cache. A project
 * without an entry has no suggested questions.
 */
export const SUGGESTED_QUESTIONS: Readonly<Record<string, readonly string[]>> = Object.fromEntries(
  QUESTIONS_BY_NAME.flatMap(([name, questions]) => {
    const project = SAMPLE_PROJECTS.find((candidate) => candidate.name === name);
    return project === undefined ? [] : [[project.id, questions]];
  }),
);
