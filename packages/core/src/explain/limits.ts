// Limits of a model output, exported so that callers and tests use the same values (DIS-38 design
// D6). They are provisional: the Table 1 measurements (CM-HU-22) may change the numbers. Character
// limits count Unicode code points (an emoji counts as one), as Zod's `.min`/`.max` do.

/** Largest model output, in UTF-8 bytes, that is parsed: bounds parse memory and time against a runaway or adversarial output. */
export const MAX_MODEL_OUTPUT_BYTES = 65_536;

/** Longest `answer`, in Unicode code points: the answer is a summary; detail belongs in statements, which carry evidence. */
export const MAX_ANSWER_CHARS = 2_000;

/** Most statements in one output: more do not fit a context budget with useful citations, and each one costs the verifier (CM-HU-10). */
export const MAX_STATEMENTS = 20;

/** Longest statement `text`, in Unicode code points: a statement is one checkable sentence (readme §2.5). */
export const MAX_STATEMENT_CHARS = 500;

/** Most issues one audit event carries: bounds the event, and so the log line, whatever the output (`issueCount` keeps the total). */
export const MAX_EVENT_ISSUES = 20;

/** Most evidence ids one statement may cite: more citations dilute verification without adding guarantee. */
export const MAX_EVIDENCE_IDS_PER_STATEMENT = 10;
