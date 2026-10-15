## Purpose

Checks mechanically that every citation of an answer points at code that exists at a given commit
and that its frozen excerpt is the text of those lines, and decides what an answer keeps when some
citations fail, so that no well-formed but false citation reaches an answer or the database.

## ADDED Requirements

### Requirement: Syntactic citation check

The syntactic check SHALL take the source reader, a repository root, a commit and a list of
citations, and SHALL return one verdict per citation, in the order given. A citation carries a
repository-relative path, a first and a last line, its excerpt (the text the answer froze for those
lines) and, optionally, how the sanitisation of `explain` cut it: `lines` (cut at a line boundary) or
`line-cut` (cut inside its first line), together with its original last line, the last line of the
range before the cut. A verdict SHALL be `cited`, or `broken` with exactly one
reason from the exported closed set `EVIDENCE_BROKEN_REASONS`, checked in this order:

1. `file-missing`: the path does not exist at the commit (the source reader rejects it with
   `SourceUnavailable`, reason `missing`);
2. `range-out-of-file`: the first line, the last line or the original last line is not an integer,
   the first line is below 1, the last line is below the first, or the last line or the original last
   line is beyond the file's last line (requirement "Expected text of a cited range");
3. `excerpt-mismatch`: the excerpt is not exactly the expected text of the range.

The check SHALL read every distinct path of the citations exactly once, all of them in one batched
read of the source reader at the given root and commit, in first-citation order. A list with no
citation SHALL read nothing. When the batched read rejects with `SourceUnavailable`, reason `missing`,
the check SHALL read each distinct path alone, once, to tell the missing paths from the others; a
missing path gives `file-missing` to every citation of it. Any other rejection, of the batched read
or of a single read (`SourceUnavailable` with another reason, a git failure, any other error), SHALL
propagate unchanged. When the batched read rejected with reason `missing`, the contents of the single
reads are the ones checked. A batched read that resolves to a different number of contents than the
paths it was given breaks the source reader's contract: the check SHALL fail with an error naming
neither a path's content nor an excerpt, and SHALL NOT turn it into verdicts.

The commit SHALL be a parameter of the check, never read from the project: the same citations and
commit always give the same verdicts. The check SHALL write nothing to any log, and a verdict SHALL
carry no part of the file's content or of the excerpt.

#### Scenario: Valid citations are cited and each path is read once

- **GIVEN** a source holding `app/A.php` (30 lines) and `app/B.php` (50 lines) at commit `C`
- **WHEN** citations of `app/A.php` 10–24, `app/B.php` 30–41 and `app/A.php` 10–24 again, each with
  the expected text of its range as excerpt, are checked at `C`
- **THEN** the three verdicts are `cited`
- **AND** the source reader received exactly one batched read, at the given root and `C`, naming
  `app/A.php` then `app/B.php`, and no single-file read
- **AND** checking the same citations again gives the same verdicts, and nothing was written through
  `console`

#### Scenario: A missing file or a range out of the file is broken

- **GIVEN** a source holding `app/B.php` with 20 lines at commit `C`, and no `app/Gone.php`
- **WHEN** citations of `app/Gone.php` 1–5, `app/B.php` 18–30, `app/B.php` 0–3, `app/B.php` 9–8 and
  `app/B.php` 1–20 (with the expected text as excerpt) are checked at `C`
- **THEN** the verdicts are `broken` with `file-missing`, `broken` with `range-out-of-file` three times,
  and `cited`
- **AND** each distinct path was read alone once after the batched read was rejected

#### Scenario: Other read failures propagate

- **WHEN** citations are checked and the batched read rejects with `SourceUnavailable` with reason
  `too-large`, then with reason `not-a-repository`, then with a git error; and then the batched read
  rejects with reason `missing` and the single read of another path rejects with reason
  `binary-content`
- **THEN** the check fails with that same error each time

#### Scenario: Non-integer lines are out of the file

- **GIVEN** a source holding `app/B.php` with 20 lines at commit `C`
- **WHEN** citations of `app/B.php` with lines `NaN`–`NaN` (empty excerpt), `1.5`–`3` and `1`–`2.5`
  are checked at `C`
- **THEN** the three verdicts are `broken` with `range-out-of-file`

#### Scenario: A short batched read is an error

- **GIVEN** a source reader whose batched read resolves to one content for two distinct paths
- **WHEN** citations of both paths are checked
- **THEN** the check fails with an error, and no single-file read was made

#### Scenario: No citation reads nothing

- **WHEN** an empty list of citations is checked
- **THEN** the result is an empty list and the source reader received no call

### Requirement: Expected text of a cited range

The expected text of a range SHALL be computed by the same rule that cuts the spans of a context
pack (`context-engine`, "Context pack"), so that a citation of an unchanged file always matches: the
file's content at the commit, redacted of secrets as the indexing redacts them, split into lines (a
final line feed ends the last line rather than starting a new one; an empty file has one empty line),
and the lines from the first to the last, inclusive, joined by `\n`, with no trailing line feed.

For a citation cut by the sanitisation of `explain`, the expected text SHALL be adjusted as that cut
produced it: for `lines`, one trailing `\r` of the joined text removed; for `line-cut`, the first
`MAX_EVIDENCE_TEXT_CHARS` code points of the joined text. The comparison with the excerpt SHALL be
exact, code unit by code unit, with no normalisation of whitespace, case, line breaks or Unicode form.

#### Scenario: A diverging excerpt is broken

- **GIVEN** `app/A.php` at commit `C`, and a citation of its lines 10–24 whose excerpt differs from
  the file in line 15 only
- **WHEN** it is checked at `C`
- **THEN** its verdict is `broken` with `excerpt-mismatch`
- **AND** a citation of the same lines whose excerpt only adds one trailing space to line 24 is also
  `broken` with `excerpt-mismatch`

#### Scenario: A redacted secret matches its redacted excerpt

- **GIVEN** a file at commit `C` whose line 3 holds a secret in clear that the indexing redacts, and a
  citation of lines 1–5 whose excerpt holds the redacted line
- **WHEN** it is checked at `C`
- **THEN** its verdict is `cited`

#### Scenario: A cut CRLF span matches without its trailing carriage return

- **GIVEN** a file at commit `C` whose lines end in `\r\n`, and a citation of lines 1–4 cut at a
  line boundary whose excerpt is lines 1–4 joined by `\n` without the `\r` that ends line 4
- **WHEN** it is checked at `C`
- **THEN** its verdict is `cited`
- **AND** the same citation without the `lines` cut is `broken` with `excerpt-mismatch`

#### Scenario: A line-cut span matches the first code points of its line

- **GIVEN** a file at commit `C` whose line 1 is longer than `MAX_EVIDENCE_TEXT_CHARS` code points
  and holds astral characters, and a citation of line 1 cut inside the line whose excerpt is its first
  `MAX_EVIDENCE_TEXT_CHARS` code points
- **WHEN** it is checked at `C`
- **THEN** its verdict is `cited`
- **AND** a citation whose excerpt is one code point shorter is `broken` with `excerpt-mismatch`

#### Scenario: A cut span whose original range leaves the file is broken

- **GIVEN** a file of 12 lines at commit `C`, and a citation of lines 1–10 cut at a line boundary
  whose excerpt is those lines and whose original last line is 15
- **WHEN** it is checked at `C`
- **THEN** its verdict is `broken` with `range-out-of-file`
- **AND** the same citation with original last line 12 is `cited`

#### Scenario: A last line without a final line feed matches

- **GIVEN** a file of 12 lines at commit `C` with no line feed after line 12
- **WHEN** a citation of lines 10–12 with the text of those lines as excerpt, and a citation of lines
  10–13, are checked at `C`
- **THEN** the first verdict is `cited` and the second is `broken` with `range-out-of-file`
- **AND** a citation of lines 1–1 of an empty file, with the empty string as excerpt, is `cited`

### Requirement: Output policy over typed statements

Given the typed statements of an answer, each with the citations it names in the model's order, and
the verdict of every cited evidence id, the output policy SHALL:

- remove from each statement every citation whose evidence id is `broken`, keeping the order of the
  others;
- remove every statement left with no citation;
- give every remaining statement the type the typing rule of `claims-and-typing` gives its remaining
  spans (which can only keep or raise it: a statement typed `INFERENCE` because of a broken
  `heuristic` span becomes `FACT` when only `anchor` or `exact` spans remain);
- keep the remaining statements in the model's order, with their text unchanged.

A `cited` verdict SHALL NOT change a statement's type by itself (a statement whose spans are all
`anchor` or `exact` stays `FACT`).

#### Scenario: A statement keeps only its valid citations and is retyped

- **GIVEN** `E1`, an `anchor` span, and `E3`, a `heuristic` span, and the statements S1 citing `E1`
  and S2 citing `E1` then `E3`, typed `FACT` and `INFERENCE`
- **WHEN** the policy runs with `E1` `cited` and `E3` `broken`
- **THEN** S1 is kept as `FACT` citing `E1`, and S2 is kept citing only `E1`, typed `FACT`

#### Scenario: A statement with no valid citation is dropped

- **GIVEN** the statements S1 citing `E1`, S2 citing `E1` then `E3`, and S3 citing `E3`
- **WHEN** the policy runs with `E1` `cited` and `E3` `broken`
- **THEN** it returns S1 and S2, in that order, and no S3

#### Scenario: Nothing is left when every citation is broken

- **WHEN** the policy runs over statements whose every cited id is `broken`
- **THEN** it returns no statement
