## Why

CM-HU-05a (DIS-64) indexes a PHP/Laravel repository end to end, and its acceptance criteria require
that no credential reaches the index and that indexing never reads outside `ALLOWED_REPOS_DIR`. The
index use case (DIS-85) cannot be built safely until core has those two rules as pure, tested
functions. This is DIS-84 (CM-HU-05a.1), the first slice of DIS-64: the security gateway in core —
secret redaction, path confinement and typed audit events — with no I/O, so DIS-85 and the CLI
(DIS-86) only wire it in. Both fixtures already carry a planted secret (`fixtures/README.md`
§"Planted secret"), which gives a fixed oracle.

## What Changes

- **Secret redaction** of a `SourceFile`'s content with four rules, evaluated in priority order:
  `private-key` (PEM header to end of block, in three forms: single line, multiline, header without a
  following `END`), `jwt`, `aws-access-key-id`, `generic-high-entropy` (a secret-like key assigned a
  quoted value of 20+ characters with Shannon entropy ≥ 3.5 bits/character; only the value is
  replaced). Each redacted span becomes `[REDACTED: possible secret]`; the rest of the line and the
  number of lines are kept, so analyzer spans stay valid. A span matched by a higher-priority rule is
  not re-reported by a lower one.
- **Typed audit events**: a JSON-serialisable discriminated union `AuditEvent`, with only
  `secret_redacted` (`file`, 1-based `line` and `column`, `rule`) in this change. Events are
  **returned as data** with the redaction result (one per distinct span, ordered), never logged by
  core, and never carry the secret, a prefix of it or a hash of it.
- **Path confinement**: a lexical check that resolves a requested path against an allowed root and
  accepts it only when it stays inside (computed with a relative path, not a string prefix, so
  `/repos-evil` is rejected and `/repos/..x` is accepted). An empty or missing root means indexing is
  disabled. Two new domain errors: `ForbiddenPathError` (`FORBIDDEN_PATH`) and `IndexingDisabled`
  (`INDEXING_DISABLED`, message `indexing disabled (fixtures-only mode)`).
- **Test support**: `readFixtureFiles(root, ignoredDirs = ['.git'])` gains an optional list of
  ignored directory names, so the fixture oracle test can skip the local-only
  `fixtures/task-api/node_modules/`. Existing callers keep their behaviour.

## Non-goals

- Running `gitleaks` in process or in CI, and `.gitleaksignore` (DIS-87 / 05a.4).
- Orchestrating indexing, computing `content_hash`, persisting `file.redacted`, building the index
  report, re-checking the `realpath` of the repository, deciding whether `commit.message` is scanned
  (DIS-85 / 05a.2).
- Reading `ALLOWED_REPOS_DIR` from the environment, the real CLI command, writing events to a
  structured log, exit codes (DIS-86 / 05a.3; API in CM-HU-05b). Core never reads `process.env`.
- An `AuditPort` or persisting audit events (PH-09, rejected). No logging dependency.
- Resolving symbolic links in core (needs `fs`).
- The `schema_violation` and `evidence_broken` events (CM-HU-09.1, CM-HU-10.1).
- Secrets outside the four rules (provider-specific tokens such as Stripe or GitHub, whole `.env`
  files).
- No port, adapter, API route, migration or new dependency. Fixtures are not modified (PH-22).

## Privacy and logging impact

The change handles repository content that may hold credentials, and defines the audit records about
them. Guarantees: no redacted value (nor a prefix or hash) appears in events, error messages or
results other than the redacted content itself; core writes nothing to any log. Test inputs are the
fictitious planted secrets of the fixtures plus synthetic literals built by concatenation in the test,
so no secret-shaped literal is committed. `/privacy-ethics-check` runs during apply. No personal data
is touched.

## Capabilities

### New Capabilities

- `security-gateway`: secret redaction of file content, typed audit events for each redaction, and
  confinement of a repository path inside the allowed root (indexing disabled without one).

### Modified Capabilities

(none)

## Impact

- Code: new module `packages/core/src/index/` (`secret-scanner.ts`, `path-policy.ts`,
  `audit-event.ts`, `index.ts`), exported from `packages/core/src/index.ts`. Uses `node:path` only
  (allowed by `.dependency-cruiser.cjs`; precedent `node:crypto` in `knowledge/author-hash.ts`).
- Tests: `tests/unit/index/secret-scanner.spec.ts`, `tests/unit/index/path-policy.spec.ts` (new);
  `tests/support/read-fixture-files.ts` (optional parameter; its 6 callers unchanged).
- Mutation: the new code lands in `packages/core/src/**`, so it counts towards Stryker's threshold
  (`MIN_MUTATION_SCORE=70`, `docs/project-context.md` → Commands).
- Tooling: `stryker.config.json` limits `disableTypeChecks` to `packages/core/src/**/*.ts` (design D11,
  found in apply) so the sandbox fixtures keep their line numbers; `vitest.config.ts` excludes
  `.stryker-tmp/**` so a leftover sandbox is never collected.
- Architecture: `core-no-infra`, `core-no-transport` stay green.
- Docs: `docs/project-context.md` gotcha (rules, priority, `private-key` forms and span, marker and
  line preservation, `confinePath` acceptance rule, `ALLOWED_REPOS_DIR` read only at the composition
  root, `readFixtureFiles` ignored dirs); `readme.md` §2.5 practices 3 and 4 snippets aligned with the
  real API and `path.relative`; TypeDoc of the new exports; `prompts.md`.
- Unblocks DIS-85; hand-off notes to DIS-85 and DIS-86 as Linear comments at archive time.
