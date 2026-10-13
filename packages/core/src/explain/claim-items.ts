import type { ContextSpan } from '../context/context-pack.js';
import type { ClaimItem } from '../knowledge/stored-claim.js';
import type { StatementType } from './typing-rules.js';

// The claims of an answer, one per statement (DIS-39 design D6). A statement typed `FACT` is stored
// as an `L2` `INFERENCE` claim whose provenance keeps `FACT` (design D1, ADR 20261013): the layer
// says where the claim came from, not what the statement guarantees.

/** The predicate of every claim `explain` stores: the statement explains its subject. */
export const CLAIM_PREDICATE_EXPLAINS = 'explains';

/** What the provenance of every claim of one answer shares. */
export interface AnswerProvenance {
  /** The project of the answer. */
  projectId: string;
  /** The model name the model reported. */
  model: string;
  /** The hash of the prompt sent. */
  promptHash: string;
  /** The clock's instant, ISO 8601 with a time zone. */
  createdAt: string;
  /** Every span of the pack, which the model read. */
  packSpans: readonly ContextSpan[];
}

/** A statement of the model, typed, with the spans its evidence ids name in the model's order. */
export interface TypedStatement {
  /** The statement text. */
  text: string;
  /** Its type, by the typing rule. */
  type: StatementType;
  /** The cited spans, in the order the model cited them; at least one. */
  spans: readonly [ContextSpan, ...ContextSpan[]];
}

/**
 * Maps the typed statements of one answer to the claims to store: as subject the symbol name of the
 * first cited span (its path when it has no symbol, never the question), as predicate
 * {@link CLAIM_PREDICATE_EXPLAINS}, as object the text; layer `L2`, type `INFERENCE`, status
 * `current`, no confidence; the statement type in the provenance. One evidence per cited span, with
 * its redacted text as excerpt and verification `none`.
 *
 * @param provenance What every claim of the answer shares.
 * @param statements The typed statements, in the model's order.
 */
export function toClaimItems(provenance: AnswerProvenance, statements: readonly TypedStatement[]): ClaimItem[] {
  const inputSpans = provenance.packSpans.map(({ fileId, startLine, endLine }) => ({ fileId, startLine, endLine }));
  return statements.map((statement) => {
    const [first] = statement.spans;
    return {
      claim: {
        projectId: provenance.projectId,
        subject: first.symbol?.name ?? first.path,
        predicate: CLAIM_PREDICATE_EXPLAINS,
        object: statement.text,
        layer: 'L2',
        type: 'INFERENCE',
        status: 'current',
        confidence: null,
        provenance: {
          model: provenance.model,
          promptHash: provenance.promptHash,
          inputSpans,
          createdAt: provenance.createdAt,
          statementType: statement.type,
        },
      },
      evidence: statement.spans.map((span) => ({
        fileId: span.fileId,
        startLine: span.startLine,
        endLine: span.endLine,
        verification: 'none',
        excerpt: span.text,
      })),
    };
  });
}
