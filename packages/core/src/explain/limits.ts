// Limits of a model output, exported so that callers and tests use the same values (DIS-38 design
// D6). They are provisional: the Table 1 measurements (CM-HU-22) may change the numbers. Character
// limits count Unicode code points (an emoji counts as one), as Zod's `.min`/`.max` do.

/** Largest model output, in UTF-8 bytes, that is parsed: bounds parse memory and time against a runaway or adversarial output. */
export const MAX_MODEL_OUTPUT_BYTES = 65_536;

/**
 * Largest output of the semantic check's verifier, in UTF-8 bytes, that is parsed (DIS-70 design S4):
 * the only accepted output is `{"entails": true|false}`, so anything longer is invalid without parsing it.
 */
export const MAX_VERIFY_OUTPUT_BYTES = 1_024;

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

/**
 * Longest question `explain` accepts, in Unicode code points (DIS-39, author decision 2026-10-13):
 * bounds the prompt and the anchoring work whatever the caller sends.
 */
export const MAX_QUESTION_CHARS = 1_000;

/**
 * Longest text of one prompt evidence, in Unicode code points (DIS-41, author decision P5,
 * provisional): a longer span is cut at a line boundary before the prompt. About a quarter of
 * `TOKEN_BUDGET_DEFAULT` with the `chars-div-4` estimate, so no single span fills the pack; revisable
 * with the measurements of CM-HU-22.
 */
export const MAX_EVIDENCE_TEXT_CHARS = 8_000;
