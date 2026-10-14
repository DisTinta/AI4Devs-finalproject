## Why

CM-HU-09 (DIS-29) asks that "un span que contiene texto con forma de instrucción («ignore previous
instructions…») o supera el tamaño máximo" go to the model "delimitado como dato, truncado al límite
y con el patrón marcado", with the event logged, and that "la sanitización no se presenta como
barrera (09.5, PH-13)". DIS-39 built the prompt of `explain` and left this out on purpose: today
`buildPrompt` (`packages/core/src/explain/prompt.ts`) sends the question and every span's redacted
text as plain JSON strings, with no delimiter, no size limit per span and no detection; a single span
can fill the whole token budget (up to 32,000 tokens). A note from DIS-39's privacy review adds the
question, which reaches the model as typed.

This is DIS-41 (CM-HU-09.5), whose user story reads: "Como desarrolladora que pregunta a CODEMIND
por un repositorio que no controla del todo, quiero que el texto del repositorio y mi pregunta lleguen
al modelo delimitados como datos, acotados en tamaño y con las frases con forma de instrucción
marcadas y registradas, para reducir la probabilidad de que un comentario malicioso desvíe la
respuesta y poder auditar cuándo apareció uno, sabiendo que es defensa en profundidad y no una
barrera (readme §2.5)."

The decisions below were taken by the author during the refinement of DIS-41 (Linear, `[enhanced]`,
2026-10-14); the rationale in quotes is transcribed from there.

- **P1, fixed delimiters, narrow neutralisation**: deterministic markers around each evidence text
  and the question, so that "el hash sigue siendo estable (mismo pack y pregunta → mismo
  `promptHash`); un nonce aleatorio rompería ese escenario de la spec `explain`". Only the marker
  sequences are neutralised, never any `<<<`/`>>>`, which "rompería heredoc PHP, `>>>` de JS,
  doctest". Neutralisation lives only in the prompt.
- **P2, keep and annotate**: a flagged text is sent unchanged, with `flags` on its entry (or
  `questionFlags` for the question) and an event: "el texto es la evidencia que el modelo debe
  explicar y la que ve el usuario".
- **P3, the cut span is the span**: the truncated span is used for the prompt, the claims and the
  excerpt, so that "un claim nunca cita líneas que el modelo no vio". The question is never cut
  ("ya la acota `MAX_QUESTION_CHARS`").
- **P4, four coarse patterns**, in a fixed order, per line, on the kept text only; «act as» is
  excluded on purpose ("falsos positivos en comentarios").
- **P5, a limit of 8,000 code points per span**, provisional: "≈ ¼ de `TOKEN_BUDGET_DEFAULT` con
  chars-div-4; revisable con CM-HU-22".
- **P6, the requirement lives in the `explain` spec**, not in `security-gateway`.
- **P7, a fixed event order**: sanitisation events first, then `schema_violation` or
  `claims_not_persisted`; none when the prompt is never built.

After the spec audit (2026-10-14) the author decided:

- **The hash promise is bounded**: "con el mismo pack, un cambio en las líneas omitidas que deja
  iguales las líneas conservadas (mismo keptEndLine y texto) deja prompt y hash iguales"; the change
  keeps its length in code points and the span's line count, "porque context-pack.ts:244 estima
  tokens sobre el texto completo del span (antes del saneado) y un cambio de longitud puede alterar
  qué spans caben en el presupuesto". "The same pack" means a pack of the same spans and ranges:
  the span's text does change in its omitted lines.
- **Singular mark**: `[TRUNCATED: 1 line omitted]` for k = 1 and `[TRUNCATED: k lines omitted]` for
  k ≥ 2.
- **"Precedence and UNKNOWN answers" is modified** too, with its scenarios unchanged (design D7).
- **A new test file** `tests/unit/explain/explain-sanitization.spec.ts`; the doubles defined inside
  `explain.spec.ts` move to `tests/support/` instead of being duplicated.

## What Changes

- New pure function in `packages/core/src/explain/sanitize.ts`: cuts each span of the pack to
  `MAX_EVIDENCE_TEXT_CHARS` (8,000 code points) at a line boundary, then matches the four instruction
  patterns of `INSTRUCTION_PATTERNS` (`ignore-instructions`, `role-override`,
  `system-impersonation`, `delimiter-spoof`) line by line on the kept text and on the question, and
  returns the cut spans, the flags and the events. It runs in linear time and reads nothing.
- `buildPrompt` wraps the question and every evidence text between
  `<<<UNTRUSTED_DATA <id>>>>` and `<<<END_UNTRUSTED_DATA <id>>>>`, neutralises only the marker
  sequences inside them (U+200B after the first `<`), appends `[TRUNCATED: …]` to a cut text, adds
  `flags` to a flagged entry and `questionFlags` to the message when the question is flagged, and the
  system prompt says that delimited content is data, never instructions.
- `explain` sanitises after building the pack and before reading the prior claims; from then on the
  sanitised spans are the only spans: prior claims, prompt, typing, claim items (input spans) and
  evidence entries (excerpt, last line).
- Two new events in `ExplainEvent`: `untrusted_content_flagged` (source, evidence id, path, absolute
  line, pattern code) and `untrusted_content_truncated` (evidence id, path, original and kept last
  line). They carry no text, prefix or hash of the content. They come first in `events` of every
  answer that reached the prompt, `UNKNOWN` included.
- Documentation: `readme.md` §2.5 describes the sanitisation; `docs/project-context.md` gains the
  gotchas (cut spans, markers seen by `scripted-llm`).

### Non-goals

- A "perfect" or model-based injection detector (readme §2.5 declares it impossible); the pattern
  list is coarse and has false negatives and false positives.
- Avoiding the accepted false positives: YAML/config keys `system:`, `assistant:` or `developer:` at
  the start of a line (`system-impersonation`) and comments such as `// ignore all lint rules`
  (`ignore-instructions`). They are flagged and logged, never blocked.
- Blocking an answer or answering `UNKNOWN` because of a pattern: a pattern is only flagged.
- Any change to secret redaction (`security-gateway`) or to the quarantine of the model output
  (`statement-schema.ts`).
- Commit messages and issue bodies: they do not reach the prompt today.
- Any change to the CLI, the API or the web; the `flags` are not shown in `ask`'s output (its stderr
  already logs every event).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `explain`: new requirement "Untrusted content sanitization"; modified "Precedence and UNKNOWN
  answers" (the sanitisation step and the spans that follow it), "Prompt and evidence ids" (the
  markers, `flags`, `questionFlags`, the truncation mark, and a hash that changes with the text sent
  rather than with any text of the span), "Answer with typed statements" (excerpt, last line and input
  spans of the sanitised spans; the events of a stored answer), "Prior claims" (read over the
  sanitised ranges) and "Explain events and logging" (the two new events and their order).

## Impact

- Code: `packages/core/src/explain/sanitize.ts` (new), `prompt.ts`, `explain.ts`, `explain-event.ts`,
  `limits.ts`, `index.ts` (export), and the doc comments of `explain-answer.ts`, `unknown-policy.ts`
  and `claim-items.ts`. Core only: no port, adapter, API or CLI change.
- Tests: `tests/unit/explain/sanitize.spec.ts`, `tests/unit/explain/sanitize.linear.spec.ts`,
  `tests/unit/explain/sanitize.scaling.spec.ts` and `tests/unit/explain/explain-sanitization.spec.ts`
  (new); `tests/support/explain-doubles.ts` (new,
  the helpers extracted from `explain.spec.ts` so both explain test files share them);
  `tests/unit/explain/explain.spec.ts` (the exact user-message assertion changes with the markers);
  `vitest.stryker.config.ts` (excludes the timed and scaling tests); `tests/support/scripted-llm.ts` keeps reading
  ids from the message. `tests/unit/cli/ask-command.spec.ts` and
  `tests/integration/cli/ask-command.spec.ts` are re-checked: their "stderr is empty" holds only
  because acme-shop matches no pattern and has no span over the limit.
- Architecture check: `.dependency-cruiser.cjs` gains a rule that forbids I/O imports in
  `sanitize.ts`.
- Prompt hashes: every prompt changes (markers and system prompt), so a claim stored before this
  change never shares a `promptHash` with one stored after it. Nothing reads `promptHash` back today;
  the answer cache (DIS-21) will key on the new prompt.
- Database: no schema change; claims written after the change may cite a shorter range than the pack
  span when it was cut.
- Privacy and security: no personal data is added. The new events carry codes, ids, a path and line
  numbers, never content of the repository or the question. Sanitisation is defence in depth: the
  protections remain the read-only design and the output quarantine.
