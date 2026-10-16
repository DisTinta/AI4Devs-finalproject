import type { ContextSpan } from '../context/context-pack.js';
import { confidence } from '../knowledge/confidence.js';
import type { ConfidenceStatement } from '../knowledge/confidence.js';
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
  /** Every sanitised span of the pack, as the model read it (a cut span ends at its kept last line). */
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
  /** The prompt ids (`E1…En`) of `spans`, position by position (DIS-68 design V5). */
  evidenceIds: readonly [string, ...string[]];
}

/**
 * The verifications of a statement or of one of its citations after the semantic check (DIS-70):
 * `entailed` when the check found support, `cited` otherwise.
 */
export const STATEMENT_VERIFICATIONS = ['entailed', 'cited'] as const;

/** The verification of a statement or of one of its citations after the semantic check (DIS-70). */
export type StatementVerification = (typeof STATEMENT_VERIFICATIONS)[number];

/**
 * A typed statement after the entailment policy (DIS-70 design S5): its type capped (`FACT` only when
 * every citation is `entailed`), its verification, and the verdict of each citation.
 */
export interface VerifiedStatement extends TypedStatement {
  /** `entailed` when every citation is `entailed`, `cited` otherwise. */
  verification: StatementVerification;
  /** The verdict of each citation, position by position with `spans`. */
  evidenceVerifications: readonly [StatementVerification, ...StatementVerification[]];
}

/**
 * The confidence input of a verified statement (DIS-72 design C5): each citation with its span's file
 * id, lines, file kind and origin, and the verdict of its (statement, citation) pair.
 */
export function toConfidenceStatement(statement: Pick<VerifiedStatement, 'spans' | 'evidenceVerifications'>): ConfidenceStatement {
  return {
    citations: statement.spans.map(({ fileId, startLine, endLine, fileKind, origin }, j) => ({
      fileId,
      startLine,
      endLine,
      fileKind,
      origin,
      verification: statement.evidenceVerifications[j],
    })),
  };
}

/**
 * Maps the typed statements of one answer to the claims to store: as subject the symbol name of the
 * first cited span (its path when it has no symbol, never the question), as predicate
 * {@link CLAIM_PREDICATE_EXPLAINS}, as object the text; layer `L2`, type `INFERENCE`, status
 * `current`, as confidence that of the statement alone (`docs/CONFIDENCE.md`, without contradiction
 * until DIS-71); the statement type (after the entailment policy) in the provenance. One
 * evidence per cited span, with its redacted text as excerpt (cut when the span was over the limit,
 * without the truncation mark or neutralisation) and as verification the verdict of its (statement,
 * citation) pair, `entailed` or `cited`: only citations that passed the syntactic check reach it.
 *
 * @param provenance What every claim of the answer shares.
 * @param statements The verified statements, in the model's order.
 */
export function toClaimItems(
  provenance: AnswerProvenance,
  statements: readonly Pick<VerifiedStatement, 'text' | 'type' | 'spans' | 'evidenceVerifications'>[],
): ClaimItem[] {
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
        // No component produces contrary evidence until DIS-71.
        confidence: confidence([toConfidenceStatement(statement)], { contradiction: false }),
        provenance: {
          model: provenance.model,
          promptHash: provenance.promptHash,
          inputSpans,
          createdAt: provenance.createdAt,
          statementType: statement.type,
        },
      },
      evidence: statement.spans.map((span, j) => ({
        fileId: span.fileId,
        startLine: span.startLine,
        endLine: span.endLine,
        verification: statement.evidenceVerifications[j],
        excerpt: span.text,
      })),
    };
  });
}
