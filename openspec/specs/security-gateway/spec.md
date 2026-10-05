# security-gateway Specification

## Purpose

Keeps credentials out of the code index and keeps indexing inside the allowed repositories root: core
redacts known secret patterns from file content, reports each redaction as a typed audit event that
never carries the secret, and confines a requested repository path to the allowed root.

## Requirements

### Requirement: Secret redaction

Redacting a source file `{ path, content }` SHALL return `{ file, redacted, events }`, where `file`
has the same `path` and the content with every secret span replaced by the marker
`[REDACTED: possible secret]`, `redacted` is `true` if and only if at least one span was replaced, and
`events` are the audit events of requirement "Redaction audit events".

The rules SHALL be evaluated in this priority order, highest first:

| Priority | Rule | Match | Span replaced |
| -- | -- | -- | -- |
| 1 | `private-key` | header `-----BEGIN ([A-Z ]*)PRIVATE KEY-----`, closing `-----END \1PRIVATE KEY-----` (same label) | see requirement "Private key blocks" |
| 2 | `jwt` | `(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(?![A-Za-z0-9_-])`, case-sensitive | the whole match |
| 3 | `aws-access-key-id` | `\b(?:AKIA\|ASIA)[A-Z0-9]{16}\b`, case-sensitive | the whole match |
| 4 | `generic-high-entropy` | `(?<![A-Za-z0-9_-])([A-Za-z0-9_-]*(?:secret\|password\|passwd\|token\|api[_-]?key)[A-Za-z0-9_-]*)(['"]?)\s*(?:=>\|=\|:)\s*(['"])([^\s'"]{20,})\3`, case-insensitive, and the Shannon entropy of group 4 SHALL be at least 3.5 bits per character | group 4 only (the quoted value; the key, the operator and the quotes are kept) |

The content SHALL be split on `\n`. Rules `jwt`, `aws-access-key-id` and `generic-high-entropy` SHALL
be matched within a single line: no match SHALL cross a line break. Only `private-key` spans several
lines, as defined in requirement "Private key blocks". A trailing `\r` SHALL be treated as part of the
line terminator: it is excluded from matching and from columns, and it is kept on every line,
including lines that become empty.

A span already claimed by a higher-priority rule SHALL NOT be evaluated again by a lower-priority
rule: any lower-priority match overlapping it SHALL be discarded. Only the span SHALL be replaced:
the rest of each line SHALL be kept byte for byte, and the number of lines of the content SHALL NOT
change. Content with no match SHALL be returned identical, with `redacted` `false` and no event.
Redaction SHALL use only the content it receives (no file system, environment or clock access) and
its matching time SHALL grow linearly with the content size (including adversarial input such as a long run of repeated keywords; the regex of the table
defines which text matches, not how it is implemented).

#### Scenario: The acme-shop planted secret is redacted

- **GIVEN** `{ path: 'config/services.php', content }` with the real content of
  `fixtures/acme-shop/config/services.php`
- **WHEN** it is redacted
- **THEN** line 21 of the returned content is
  `        'key' => env('AWS_ACCESS_KEY_ID', '[REDACTED: possible secret]'),`, every other line is
  identical byte for byte, and the number of lines is unchanged (30)
- **AND** `redacted` is `true` and `events` is exactly
  `[{ type: 'secret_redacted', file: 'config/services.php', line: 21, column: 44, rule: 'aws-access-key-id' }]`
- **AND** the JSON serialisation of `events` contains neither the planted key of `fixtures/acme-shop` (see `fixtures/README.md`) nor any substring
  of it of 8 or more characters

#### Scenario: The fixtures produce no false positive

- **GIVEN** every file of `fixtures/acme-shop` and `fixtures/task-api`, read with the `.git` and
  `node_modules` directories skipped (the local-only `fixtures/task-api/node_modules/` holds real
  JWTs and is absent in CI)
- **WHEN** each one is redacted
- **THEN** exactly two files come out with `redacted: true`: `config/services.php` with the event of
  the previous scenario, and `src/config/env.ts` with exactly
  `[{ type: 'secret_redacted', file: 'src/config/env.ts', line: 7, column: 34, rule: 'aws-access-key-id' }]`
  (that span also matches `generic-high-entropy`, which loses by priority and adds no event)
- **AND** every other file, including `package-lock.json` with its `integrity` `sha512-…` values,
  comes out with identical content, `redacted: false` and no event

#### Scenario: Redaction time grows linearly on adversarial lines

- **GIVEN** adversarial inputs of up to about 5 MB, every secret-shaped literal built by concatenation:
  - one line of a secret-like keyword repeated;
  - one line of JWT-like tokens repeated;
  - one line of AWS access key ids repeated;
  - one line of `private-key` headers without a closing, all with the same label;
  - one line of headers without a closing, each with a distinct label;
  - the same, closed once at the end by one of those labels;
  - one line alternating JWTs and AWS access key ids;
  - one line alternating all four rules, with real `generic-high-entropy` matches;
  - many lines: headers followed by long PEM body runs (base64 and `Name: value` lines), and many
    consecutive form a blocks;
  - one line of single-line blocks, each header beginning on the last five dashes of the previous
    closing
- **WHEN** each one is redacted
- **THEN** each call returns within 2 seconds
- **AND** for an input built from the same pieces at sizes `n` and `4n`, after one warm-up call per
  size and five runs of each size alternating `n`, `4n`, `n`, `4n`…, the fastest run at `4n` is less
  than 8 times the fastest run at `n`

### Requirement: Private key blocks

A line SHALL be **PEM body** when, with surrounding whitespace removed, it matches
`^[A-Za-z0-9+/=]+$`, or it is a `Name: value` header (such as `Proc-Type: 4,ENCRYPTED` or
`DEK-Info: …`), or it is empty and directly follows a `Name: value` header line. The **body run** of a
`private-key` header SHALL be the consecutive PEM body lines directly after the header line; it MAY be
empty and SHALL end at the first non-body line or at the end of the content.

The end of the block SHALL be determined by the first form that applies, checked in this order:

- **c) single line:** the closing is on the header line (for example a service-account JSON
  `private_key` with escaped `\n`); the block ends at the last dash of that closing;
- **a) multiline:** the line directly after the body run starts, leading whitespace removed, with the
  closing; the block ends at the last dash of that closing;
- **b) otherwise:** the block ends at the end of the last body-run line, or at the last dash of the
  header when the body run is empty; the first non-body line and any later closing SHALL NOT be
  touched.

The span SHALL run from the first dash of the header to the end of the block. The marker SHALL be
written on the header line; the lines strictly inside the span SHALL become empty; on the first and
last lines of the span, the text before the first dash of the header and the text after the end of
the block SHALL be kept. Exactly one event SHALL be emitted per block, with the `line` and `column` of
the first dash of the header.

A header MAY begin on the last dashes of the previous block on the same line: of its closing, or of
an unclosed header. Such a header SHALL still be found. The shared dashes SHALL stay in the earlier
span, so the later span SHALL start where the earlier one ends and no two spans SHALL overlap. The
later block's event SHALL still carry the `column` of the first dash of its header, which then lies
inside the earlier span.

#### Scenario: A private key without a closing keeps the following code

- **GIVEN** `nokey.php` with 6 lines: `<?php`; `-----BEGIN PRIVATE KEY-----`; three base64 body lines
  `MIIBVQIBADANBgkqhkiG9w0BAQEFAASCAT8wggE7AgEAAkEA`,
  `c2ludGV0aWNvLW5vLWVzLXVuYS1jbGF2ZS1yZWFs`, `ZmFrZQ==`; and `return 1;` (synthetic literals built
  by concatenation in the test)
- **WHEN** it is redacted
- **THEN** line 2 is the marker, lines 3–5 are empty, line 6 is still `return 1;` and the content has
  6 lines
- **AND** `events` is exactly
  `[{ type: 'secret_redacted', file: 'nokey.php', line: 2, column: 1, rule: 'private-key' }]`

#### Scenario: A single-line private key keeps the surrounding JSON

- **GIVEN** `service-account.json` with 5 lines: `{`; `  "type": "service_account",`;
  `  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg\nZmFrZQ==\n-----END PRIVATE KEY-----\n",`
  (each `\n` is escaped text, not a line break);
  `  "client_email": "svc@example.iam.gserviceaccount.com"`; `}`
- **WHEN** it is redacted
- **THEN** line 3 is `  "private_key": "[REDACTED: possible secret]\n",`, the other lines are
  unchanged and the content has 5 lines
- **AND** `events` is exactly
  `[{ type: 'secret_redacted', file: 'service-account.json', line: 3, column: 19, rule: 'private-key' }]`

#### Scenario: A multiline private key inside a string keeps the code around it

- **GIVEN** `heredoc.php` with 5 lines: `<?php`; `$k = '-----BEGIN RSA PRIVATE KEY-----`;
  `MIIBOgIBAAJBAKj34GkxFhD90vcNLYLInFEX6Ppy1tPf9Cnzj4p4WGeKLs1Pt8Qu`;
  `KUpRKfFLfRYC9AIKjbJTWit+CqvjWYzvQwECAwEAAQ==`; `-----END RSA PRIVATE KEY-----';`
- **WHEN** it is redacted
- **THEN** line 2 is `$k = '[REDACTED: possible secret]`, lines 3–4 are empty, line 5 is `';` and
  the content has 5 lines
- **AND** `events` is exactly
  `[{ type: 'secret_redacted', file: 'heredoc.php', line: 2, column: 7, rule: 'private-key' }]`

#### Scenario: A header followed by prose redacts only the header

- **GIVEN** `doc.md` with 3 lines: `-----BEGIN PRIVATE KEY-----`; `texto normal de la guía`;
  `-----END PRIVATE KEY-----`
- **WHEN** it is redacted
- **THEN** line 1 is the marker and lines 2 and 3 are unchanged (line 2 is not PEM body, so the
  closing on line 3 does not follow the body run)
- **AND** `events` is exactly
  `[{ type: 'secret_redacted', file: 'doc.md', line: 1, column: 1, rule: 'private-key' }]`

#### Scenario: A single-line block sharing its dashes with the previous closing is redacted whole

- **GIVEN** one line holding a quote, a single-line block (header, escaped body, closing), a second
  single-line block with the label `RSA ` whose header begins on the last five dashes of that
  closing, and a closing quote (literals built by concatenation in the test)
- **WHEN** it is redacted
- **THEN** the content is the quote, the marker twice and the quote: no character of either body
  remains
- **AND** `events` has two `private-key` events on line 1: column 2 for the first header, and for the
  second the column of its header's first dash, five columns before the end of the first span

### Requirement: Redaction audit events

An audit event SHALL be a JSON-serialisable value of a union discriminated by `type`. A redaction SHALL
produce exactly one event `{ type: 'secret_redacted', file, line, column, rule }` per distinct
replaced span, where `file` is the file `path`, `line` and `column` are 1-based (`column` counted in UTF-16 code units of the original line) and locate the start of
the span in the original content (for a `private-key` header that shares its first dashes with the
previous span, the first dash of that header; see "Private key blocks"), and `rule` is the highest-priority rule that matched it. Events SHALL
be ordered by `line`, then `column`, then `rule`. An event SHALL NOT contain the redacted value, a
prefix of it or a hash of it. Redaction SHALL NOT write events to any log: it only returns them.

#### Scenario: Every rule produces one ordered event per span

- **GIVEN** `synthetic.php` with 10 lines, every secret-shaped literal built by concatenation in the
  test:
  1. `<?php`
  2. `$jwt = '<JWT>';` with `<JWT>` =
     `'eyJ' + 'hbGciOiJIUzI1NiJ9' + '.' + 'eyJzdWIiOiIxIn0' + '.' + 'c2lnbmF0dXJlLXNpbnRldGljYQ'`
  3. `-----BEGIN RSA PRIVATE KEY-----`
  4. `MIIBOgIBAAJBAKj34GkxFhD90vcNLYLInFEX6Ppy1tPf9Cnzj4p4WGeKLs1Pt8Qu`
  5. `KUpRKfFLfRYC9AIKjbJTWit+CqvjWYzvQwECAwEAAQ==`
  6. `-----END RSA PRIVATE KEY-----`
  7. `$apiKey = '<K>';` with `<K>` = `'q8Zr' + 'T2vLx9Wm' + 'Kp4Nc7Hd' + 'Ys3Bf6Gj' + 'R1tE'` (32
     distinct characters, entropy 5.0)
  8. `'password' => env('DB_PASSWORD'),`
  9. `'secret' => 'changeme',`
  10. `$pair = ['<k1>', '<k2>'];` with `<k1>` = `'AKIA' + 'Z'×16` and `<k2>` = `'ASIA' + 'Y'×16`
- **WHEN** it is redacted
- **THEN** `events` is exactly, in this order, all with `type: 'secret_redacted'` and
  `file: 'synthetic.php'`: `{ line: 2, column: 9, rule: 'jwt' }`,
  `{ line: 3, column: 1, rule: 'private-key' }`,
  `{ line: 7, column: 12, rule: 'generic-high-entropy' }`,
  `{ line: 10, column: 11, rule: 'aws-access-key-id' }`,
  `{ line: 10, column: 35, rule: 'aws-access-key-id' }`
- **AND** line 3 is the marker, lines 4–6 are empty, line 7 is
  `$apiKey = '[REDACTED: possible secret]';`, lines 8 and 9 are unchanged, and the content has 10
  lines

### Requirement: Repository path confinement

Confining a requested path to an allowed root SHALL, when the root is set, resolve the root to an
absolute normalised path, resolve the requested path against it (a relative path hangs from the root,
an absolute one is taken as is), compute the relative path `rel` from the root to the result, and
accept if and only if `rel` is empty, or `rel` is not `..`, does not start with `..` followed by the
path separator, and is not absolute. Accepted, it SHALL return the resolved path; otherwise it SHALL
raise `ForbiddenPathError` — a domain error with code `FORBIDDEN_PATH` that carries the requested path
— without reading anything. The check SHALL be lexical: it SHALL NOT touch the file system.

#### Scenario: Paths inside the root are accepted

- **GIVEN** `root = path.resolve('/repos')`
- **WHEN** `path.resolve('/repos/acme-shop')`, `'acme-shop'`, `path.resolve('/repos/a/../b')` and
  `path.resolve('/repos/..x')` are confined to it
- **THEN** they return `path.resolve('/repos/acme-shop')`, `path.resolve('/repos/acme-shop')`,
  `path.resolve('/repos/b')` and `path.resolve('/repos/..x')` respectively (a child whose name starts
  with `..` is inside)

#### Scenario: Paths outside the root are forbidden

- **GIVEN** `root = path.resolve('/repos')`
- **WHEN** `path.resolve('/repos/../etc')`, `path.resolve('/tmp/otro')` and
  `path.resolve('/repos-evil/x')` are confined to it
- **THEN** each raises `ForbiddenPathError`, an instance of the domain error base, with
  `code === 'FORBIDDEN_PATH'` and `requestedPath` equal to the requested path

#### Scenario: A path on another Windows drive is forbidden

- **GIVEN** a Windows platform (the test runs only when `process.platform === 'win32'`)
- **WHEN** `'D:\\repos\\x'` is confined to `'C:\\repos'`
- **THEN** it raises `ForbiddenPathError` (the relative path between drives is absolute)

### Requirement: Indexing disabled without an allowed root

When the allowed root is missing, empty or only whitespace, confinement SHALL raise
`IndexingDisabled` — a domain error with code `INDEXING_DISABLED` and message
`indexing disabled (fixtures-only mode)` — before looking at the requested path, and SHALL never raise
`ForbiddenPathError` in that case. The allowed root SHALL be passed in by the caller; core SHALL NOT
read it from the environment.

#### Scenario: A missing or blank root disables indexing

- **GIVEN** an allowed root `undefined`, `''` or `'   '`
- **WHEN** any path is confined to it, including one that would be inside `/repos`
- **THEN** it raises `IndexingDisabled`, an instance of the domain error base, with
  `code === 'INDEXING_DISABLED'` and message `indexing disabled (fixtures-only mode)`, and never
  `ForbiddenPathError`
