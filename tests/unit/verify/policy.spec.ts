import { describe, expect, it } from 'vitest';
import { applyVerdicts } from '@codemind/core';
import type { ContextSpan, TypedStatement } from '@codemind/core';

// Spec: openspec/changes/evidence-verifier-syntactic/specs/evidence-verification/spec.md → "Output
// policy over typed statements" (DIS-68). Each test is one scenario, named after it.

/** A span of `origin` over lines `start..start+4` of `path`. */
function span(path: string, origin: ContextSpan['origin'], start = 1): ContextSpan {
  return {
    path,
    fileId: '00000000-0000-4000-8000-000000000001',
    fileKind: 'source',
    startLine: start,
    endLine: start + 4,
    text: `text of ${path}`,
    tokens: 4,
    distance: origin === 'anchor' ? 0 : 1,
    origin,
  };
}

const E1 = span('app/A.php', 'anchor');
const E3 = span('app/C.php', 'heuristic', 10);

const S1: TypedStatement = { text: 'S1', type: 'FACT', spans: [E1], evidenceIds: ['E1'] };
const S2: TypedStatement = { text: 'S2', type: 'INFERENCE', spans: [E1, E3], evidenceIds: ['E1', 'E3'] };
const S3: TypedStatement = { text: 'S3', type: 'INFERENCE', spans: [E3], evidenceIds: ['E3'] };

describe('Requirement: Output policy over typed statements', () => {
  it('A statement keeps only its valid citations and is retyped', () => {
    // Act
    const kept = applyVerdicts([S1, S2], new Set(['E3']));

    // Assert
    expect(kept).toEqual([
      { text: 'S1', type: 'FACT', spans: [E1], evidenceIds: ['E1'] },
      { text: 'S2', type: 'FACT', spans: [E1], evidenceIds: ['E1'] },
    ]);
  });

  it('A statement with no valid citation is dropped', () => {
    // Act
    const kept = applyVerdicts([S1, S2, S3], new Set(['E3']));

    // Assert
    expect(kept.map((statement) => statement.text)).toEqual(['S1', 'S2']);
  });

  it('Nothing is left when every citation is broken', () => {
    // Act
    const kept = applyVerdicts([S1, S2, S3], new Set(['E1', 'E3']));

    // Assert
    expect(kept).toEqual([]);
  });
});
