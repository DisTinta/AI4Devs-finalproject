import { describe, expect, it } from 'vitest';
import { parseModelOutput } from '@codemind/core';
import { driftShapeSubcode, parseDriftJson, unfenceDriftOutput } from '../../../packages/core/src/drift/drift-quarantine';

// Spec: openspec/changes/add-drift-detection/specs/drift-detection/spec.md (DIS-71), the fence and size
// rules of "Claim extraction" and "Confrontation of a claim". The fence rule of drift repeats the one of
// `explain/statement-schema.ts` (design Follow-up R16); this test pins the two equal over the shapes
// the explain tests use, so a change to one fails here until the other follows.

const OUTPUT = JSON.stringify({ answer: 'a', statements: [{ text: 't', evidenceIds: ['E1'] }] });
const KNOWN = new Set(['E1']);

/** `text` in a Markdown code fence with the info string `info` (none when empty). */
function fenced(text: string, info = 'json'): string {
  return `\`\`\`${info}\n${text}\n\`\`\``;
}

describe('the fence rule of the drift quarantine', () => {
  const variants: Record<string, string> = {
    json: fenced(OUTPUT),
    JSON: fenced(OUTPUT, 'JSON'),
    'no info string': fenced(OUTPUT, ''),
    'whitespace around': '\n' + fenced(OUTPUT) + '  ',
    'carriage returns': fenced(OUTPUT).replace(/\n/g, '\r\n'),
    'other info string': fenced(OUTPUT, 'yaml'),
    'vertical tab around': '\u000b' + fenced(OUTPUT),
    'text before': 'Here it is:\n' + fenced(OUTPUT),
    'text after': fenced(OUTPUT) + '\nThat is all.',
    'two fences': fenced(OUTPUT) + '\n' + fenced(OUTPUT),
    'no fence': OUTPUT,
    'not json': 'hello',
  };

  for (const [name, text] of Object.entries(variants)) {
    it(`reads ${name} as explain's quarantine reads it`, () => {
      expect(parseDriftJson(text).ok).toBe(parseModelOutput(text, KNOWN).ok);
    });
  }

  it('unwraps exactly one enclosing fence', () => {
    expect(unfenceDriftOutput(fenced('{"a":1}'))).toBe('{"a":1}');
    expect(unfenceDriftOutput('{"a":1}')).toBe('{"a":1}');
  });
});

describe('the shared checks', () => {
  it('discards an output over the size limit before parsing it', () => {
    expect(parseDriftJson(' '.repeat(65_537))).toEqual({ ok: false, subcode: 'output_too_large' });
    expect(parseDriftJson('{}' + ' '.repeat(65_534))).toEqual({ ok: true, json: {} });
  });

  it('measures the size in UTF-8 bytes, not code units', () => {
    // 21,846 three-byte characters are 65,538 bytes in 21,846 code units.
    expect(parseDriftJson('€'.repeat(21_846))).toEqual({ ok: false, subcode: 'output_too_large' });
  });

  it('gives limit_exceeded only when every issue is a maximum exceeded', () => {
    expect(driftShapeSubcode([{ code: 'too_big' }, { code: 'too_big' }])).toBe('limit_exceeded');
    expect(driftShapeSubcode([{ code: 'too_big' }, { code: 'invalid_type' }])).toBe('invalid_shape');
    expect(driftShapeSubcode([{ code: 'custom' }])).toBe('invalid_shape');
  });
});
