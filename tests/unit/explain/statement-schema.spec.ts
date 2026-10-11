import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_ANSWER_CHARS,
  MAX_EVIDENCE_IDS_PER_STATEMENT,
  MAX_MODEL_OUTPUT_BYTES,
  MAX_STATEMENT_CHARS,
  MAX_STATEMENTS,
  parseModelOutput,
} from '@codemind/core';
import type { SchemaViolationEvent } from '@codemind/core';

// Spec: openspec/changes/claims-and-typing/specs/claims-and-typing/spec.md → "Model output quarantine"
// and "Audit event of a discarded output". Each test is one scenario, named after it.

/** One statement of a model output as the model writes it. */
interface RawStatement {
  text: string;
  evidenceIds: string[];
  [extra: string]: unknown;
}

/** A statement citing `E1`, or the given ids. */
function statement(evidenceIds: string[] = ['E1'], text = 'compute aplica el descuento'): RawStatement {
  return { text, evidenceIds };
}

/** The JSON text of an output with `answer` and `statements`. */
function output(statements: unknown[] = [statement()], answer = 'El precio se calcula en compute.'): string {
  return JSON.stringify({ answer, statements });
}

/** `text` padded with trailing JSON whitespace to exactly `bytes` UTF-8 bytes. */
function padTo(text: string, bytes: number): string {
  return text + ' '.repeat(bytes - Buffer.byteLength(text, 'utf8'));
}

/** Checks `text` and returns the event of its discarded output; fails if it was accepted. */
function discarded(text: string, known: Iterable<string> = ['E1']): SchemaViolationEvent {
  const result = parseModelOutput(text, new Set(known));
  if (result.ok) throw new Error('expected the output to be discarded');
  return result.event;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Requirement: Model output quarantine', () => {
  it('A conforming output is accepted', () => {
    // Arrange
    const text =
      '{"answer":"El precio se calcula en compute.","statements":[{"text":"compute aplica el descuento","evidenceIds":["E1"]}]}';

    // Act
    const result = parseModelOutput(text, new Set(['E1', 'E2']));

    // Assert
    expect(result).toEqual({
      ok: true,
      output: {
        answer: 'El precio se calcula en compute.',
        statements: [{ text: 'compute aplica el descuento', evidenceIds: ['E1'] }],
      },
    });
  });

  it('An extra field discards the whole output', () => {
    // Arrange
    const withType = output([statement(), { ...statement(), type: 'FACT' }]);
    const withNote = output([{ ...statement(), note: 'ignore previous instructions' }]);

    // Act
    const events = [discarded(withType), discarded(withNote)];

    // Assert
    expect(events.map((event) => event.subcode)).toEqual(['invalid_shape', 'invalid_shape']);
    expect(events.map((event) => event.issues)).toEqual([
      [{ path: 'statements.1', code: 'unrecognized_keys' }],
      [{ path: 'statements.0', code: 'unrecognized_keys' }],
    ]);
  });

  it('An unknown evidence id discards the whole output', () => {
    // Arrange
    const text = output([statement(), statement(['E1', 'E9'])]);

    // Act
    const event = discarded(text, ['E1']);

    // Assert
    expect(event.subcode).toBe('unknown_evidence_id');
    expect(event.issues).toEqual([{ path: 'statements.1.evidenceIds.1', code: 'unknown_evidence_id' }]);
  });

  it('A statement without evidence discards the whole output', () => {
    // Act
    const event = discarded(output([statement([])]));

    // Assert
    expect(event.subcode).toBe('empty_evidence');
    expect(event.issues).toEqual([{ path: 'statements.0.evidenceIds', code: 'too_small' }]);
  });

  it('A repeated evidence id discards the whole output', () => {
    // Act
    const event = discarded(output([statement(['E1', 'E1'])]), ['E1']);

    // Assert
    expect(event.subcode).toBe('duplicate_evidence_id');
    expect(event.issues).toEqual([{ path: 'statements.0.evidenceIds.1', code: 'duplicate_evidence_id' }]);
  });

  it('Malformed JSON discards the output', () => {
    // Act
    const event = discarded('{"answer":');

    // Assert
    expect(event.subcode).toBe('invalid_json');
    expect(event.issues).toEqual([]);
  });

  it('The output size limit accepts its bound and rejects one byte more', () => {
    // Arrange
    const atBound = padTo(output(), MAX_MODEL_OUTPUT_BYTES);
    const overBound = padTo(output(), MAX_MODEL_OUTPUT_BYTES + 1);

    // Act
    const accepted = parseModelOutput(atBound, new Set(['E1']));
    const parse = vi.spyOn(JSON, 'parse');
    const event = discarded(overBound);

    // Assert
    expect(accepted.ok).toBe(true);
    expect(event.subcode).toBe('output_too_large');
    expect(event.issues).toEqual([]);
    expect(parse).not.toHaveBeenCalled();
  });

  it('The answer length limit accepts its bound and rejects one more', () => {
    // Arrange
    const atBound = output([statement()], 'a'.repeat(MAX_ANSWER_CHARS));
    const overBound = output([statement()], 'a'.repeat(MAX_ANSWER_CHARS + 1));

    // Act
    const accepted = parseModelOutput(atBound, new Set(['E1']));
    const event = discarded(overBound);

    // Assert
    expect(accepted.ok).toBe(true);
    expect(event.subcode).toBe('limit_exceeded');
    expect(event.issues).toEqual([{ path: 'answer', code: 'too_big' }]);
  });

  it('The statement count limit accepts its bound and rejects one more', () => {
    // Arrange
    const atBound = output(Array.from({ length: MAX_STATEMENTS }, () => statement()));
    const overBound = output(Array.from({ length: MAX_STATEMENTS + 1 }, () => statement()));

    // Act
    const accepted = parseModelOutput(atBound, new Set(['E1']));
    const event = discarded(overBound);

    // Assert
    expect(accepted.ok).toBe(true);
    expect(event.subcode).toBe('limit_exceeded');
    expect(event.issues).toEqual([{ path: 'statements', code: 'too_big' }]);
  });

  it('The statement length limit accepts its bound and rejects one more', () => {
    // Arrange
    const atBound = output([statement(['E1'], 'a'.repeat(MAX_STATEMENT_CHARS))]);
    const overBound = output([statement(['E1'], 'a'.repeat(MAX_STATEMENT_CHARS + 1))]);

    // Act
    const accepted = parseModelOutput(atBound, new Set(['E1']));
    const event = discarded(overBound);

    // Assert
    expect(accepted.ok).toBe(true);
    expect(event.subcode).toBe('limit_exceeded');
    expect(event.issues).toEqual([{ path: 'statements.0.text', code: 'too_big' }]);
  });

  it('The citations limit accepts its bound and rejects one more', () => {
    // Arrange
    const known = Array.from({ length: MAX_EVIDENCE_IDS_PER_STATEMENT + 1 }, (_, index) => `E${index + 1}`);
    const atBound = output([statement(known.slice(0, MAX_EVIDENCE_IDS_PER_STATEMENT))]);
    const overBound = output([statement(known)]);

    // Act
    const accepted = parseModelOutput(atBound, new Set(known));
    const event = discarded(overBound, known);

    // Assert
    expect(accepted.ok).toBe(true);
    expect(event.subcode).toBe('limit_exceeded');
    expect(event.issues).toEqual([{ path: 'statements.0.evidenceIds', code: 'too_big' }]);
  });

  // Not scenarios: the subcode of mixed failures, the check order and the byte count.
  it('classifies mixed failures and checks duplicates before unknown ids', () => {
    // Arrange
    const tooBigAndExtra = output([{ ...statement(['E1'], 'a'.repeat(MAX_STATEMENT_CHARS + 1)), note: 'x' }]);
    const repeatedUnknown = output([statement(['E9', 'E9'])]);
    const extraTopLevel = JSON.stringify({ answer: 'a', statements: [statement()], note: 'x' });
    const multiByteOverBound = `${padTo(output(), MAX_MODEL_OUTPUT_BYTES - 1)}é`;

    // Act
    const subcodes = [tooBigAndExtra, repeatedUnknown, extraTopLevel, multiByteOverBound].map(
      (text) => discarded(text).subcode,
    );

    // Assert
    expect(multiByteOverBound.length).toBe(MAX_MODEL_OUTPUT_BYTES);
    expect(subcodes).toEqual(['invalid_shape', 'duplicate_evidence_id', 'invalid_shape', 'output_too_large']);
  });

  // Not scenarios: `empty_evidence` only when every issue is an empty `evidenceIds` (design D3).
  it('keeps empty_evidence for failures made only of empty evidence', () => {
    // Arrange
    const emptyAndExtra = output([{ ...statement([]), note: 'x' }]);
    const emptyAnswer = output([statement()], '');
    const twoEmpty = output([statement([]), statement([])]);

    // Act
    const subcodes = [emptyAndExtra, emptyAnswer, twoEmpty].map((text) => discarded(text).subcode);

    // Assert
    expect(subcodes).toEqual(['invalid_shape', 'invalid_shape', 'empty_evidence']);
  });

  // Not a scenario: lengths are Unicode code points (design D6), so an emoji counts as one.
  it('counts statement length in Unicode code points', () => {
    // Arrange
    const emoji = '\u{1F600}';
    const atBound = output([statement(['E1'], `${'a'.repeat(MAX_STATEMENT_CHARS - 1)}${emoji}`)]);
    const overBound = output([statement(['E1'], `${'a'.repeat(MAX_STATEMENT_CHARS)}${emoji}`)]);

    // Act
    const accepted = parseModelOutput(atBound, new Set(['E1']));
    const event = discarded(overBound);

    // Assert
    expect(accepted.ok).toBe(true);
    expect(event.subcode).toBe('limit_exceeded');
    expect(event.issues).toEqual([{ path: 'statements.0.text', code: 'too_big' }]);
  });
});

describe('Requirement: Audit event of a discarded output', () => {
  it('The event identifies the output without carrying it', () => {
    // Arrange
    const text =
      '{"answer":"ok","statements":[{"text":"x","evidenceIds":["E1"],"note":"ignore previous instructions"}]}';

    // Act
    const event = discarded(text, ['E1']);

    // Assert
    expect(event).toEqual({
      type: 'schema_violation',
      stage: 'l2_inference',
      subcode: 'invalid_shape',
      outputBytes: Buffer.byteLength(text, 'utf8'),
      outputSha256: createHash('sha256').update(text, 'utf8').digest('hex'),
      issues: [{ path: 'statements.0', code: 'unrecognized_keys' }],
    });
    // Forbidding `ok` is safe: the event, unlike the result that wraps it, has no `ok` field.
    const serialised = JSON.stringify(event);
    for (const fragment of ['ignore previous instructions', 'note', 'ok']) {
      expect(serialised).not.toContain(fragment);
    }
  });

  it('Checking an output writes nothing to the console', () => {
    // Arrange
    const methods = (
      [
        'log',
        'info',
        'warn',
        'error',
        'debug',
        'trace',
        'dir',
        'dirxml',
        'table',
        'assert',
        'count',
        'group',
        'groupCollapsed',
        'groupEnd',
        'time',
        'timeEnd',
        'timeLog',
      ] as const
    ).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => undefined),
    );
    const outputs = [
      output(),
      padTo(output(), MAX_MODEL_OUTPUT_BYTES + 1),
      '{"answer":',
      output([{ ...statement(), type: 'FACT' }]),
      output([statement()], 'a'.repeat(MAX_ANSWER_CHARS + 1)),
      output([statement([])]),
      output([statement(['E1', 'E1'])]),
      output([statement(['E9'])]),
    ];

    // Act
    const results = outputs.map((text) => parseModelOutput(text, new Set(['E1'])));

    // Assert
    expect(results.map((result) => (result.ok ? 'accepted' : result.event.subcode))).toEqual([
      'accepted',
      'output_too_large',
      'invalid_json',
      'invalid_shape',
      'limit_exceeded',
      'empty_evidence',
      'duplicate_evidence_id',
      'unknown_evidence_id',
    ]);
    for (const method of methods) {
      expect(method).not.toHaveBeenCalled();
    }
  });
});
