## MODIFIED Requirements

### Requirement: Untrusted strings are printed escaped

Analyzer diagnostics, skipped paths, the file paths of redaction events and the messages of graph
violations come from the analysed repository and are untrusted. No control character — C0
(`\u0000`–`\u001f`, including newlines and ESC), DEL (`\u007f`) or C1 (`\u0080`–`\u009f`) — and no
bidirectional formatting character (`\u061c`, `\u200e`, `\u200f`, `\u202a`–`\u202e`,
`\u2066`–`\u2069`) or line or paragraph separator (`\u2028`, `\u2029`) SHALL reach stdout or stderr
raw, in any output:

- the text report SHALL print each diagnostic message and each skipped path as a JSON string
  literal, so quotes are escaped and those characters appear as `\uXXXX` or `\n`;
- the `--json` report, every log line and the `{"error":…}` line SHALL be JSON whose strings escape
  those characters the same way, so they still parse to the original values.

Core rejects a path holding any of those characters as `invalid-path` (`repository-indexing`), so
such a path reaches the output only as a skipped entry, which is exactly where a bidirectional
character could visually reorder what the terminal shows; the CLI SHALL escape every untrusted
string it prints, whatever core lets through.

#### Scenario: Diagnostics and skipped paths are escaped

- **GIVEN** a report with the diagnostic `duplicate path "a\"b\u001b[31m.php"; kept the first` and
  skipped entries with paths `x\ny.php` and `c\u009b2Jd.php` (a C1 control, the one-byte CSI)
- **WHEN** it is rendered as text
- **THEN** the output contains no ESC character (`\u001b`), no C1 control character
  (`\u0080`–`\u009f`) and no newline inside an entry, and each message and path appears as a quoted,
  escaped literal (quotes as `\"`, controls as `\uXXXX` or `\n`)

#### Scenario: Control characters are escaped in the log, the JSON report and the error

- **GIVEN** fake ports where a file named `k\u009b2J.php` holds a synthetic AWS access key id, a
  source-tree skipped path is `s\u009b.php` and the analyzer reports a diagnostic `bad\u009b`; then
  an analyzer that adds a file `g\u009b.php` that is not in the source tree, so the graph is invalid
- **WHEN** the command runs with `--json`, and then the second case without it
- **THEN** neither stdout nor stderr of either run contains a raw DEL or C1 character
- **AND** the JSON report parses to the skipped entries `k\u009b2J.php` with reason `invalid-path`
  and `s\u009b.php`, and to the diagnostic `bad\u009b`; no `secret_redacted` line names
  `k\u009b2J.php`
- **AND** the `INVALID_GRAPH` error line parses to a violation whose message holds `g\u009b.php`

#### Scenario: Bidirectional and separator characters in untrusted strings are escaped

- **GIVEN** a report whose skipped entries have the paths `evil<U+202E>gnp.php` and
  `l<U+2028>s.php` and whose diagnostic message is `bad<U+2066>`
- **WHEN** it is rendered as text, and serialised as the `--json` report
- **THEN** neither output contains a raw bidirectional formatting or separator character
- **AND** the text holds `"evil\u202egnp.php"`, `"l\u2028s.php"` and `"bad\u2066"`, and the JSON
  parses back to the original three strings

#### Scenario: A redaction event's file path is escaped in its log line

- **GIVEN** a redaction event whose `file` is `k\u009b2J.php`
- **WHEN** its `secret_redacted` log line is written
- **THEN** the line contains no raw C1 character and parses to `file` = `k\u009b2J.php`
