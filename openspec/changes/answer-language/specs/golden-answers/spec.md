## MODIFIED Requirements

### Requirement: Golden answer fingerprint

`answerFingerprint` SHALL be computed with the algorithm of the seed's fingerprints over exactly these
repository files: `packages/core/src/explain/prompt.ts`, `packages/core/src/explain/question-language.ts`,
`packages/core/src/explain/untrusted-text.ts`,
`packages/core/src/explain/sanitize.ts`, `packages/core/src/explain/limits.ts`,
`packages/core/src/explain/statement-schema.ts`, `packages/core/src/explain/typing-rules.ts`,
`packages/core/src/verify/verify-prompt.ts`, `packages/core/src/verify/policy.ts`,
`packages/core/src/knowledge/confidence.ts`, `packages/core/src/cache/normalize.ts` and
`packages/core/src/cache/response-cache.ts`. It SHALL depend only on those files' paths and contents,
not on their line endings.

#### Scenario: The answer fingerprint covers exactly its declared inputs

- **GIVEN** a repository tree holding every declared input and files outside them
  (`packages/core/src/context/anchor.ts`, `packages/core/src/explain/explain.ts`, `readme.md`)
- **WHEN** each declared input changes in turn, then one of them is rewritten with CRLF line endings,
  then every outside file changes
- **THEN** each change of a declared input alters the fingerprint, the CRLF rewrite does not, and the
  outside changes do not
