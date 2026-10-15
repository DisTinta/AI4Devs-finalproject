import { describe, expect, it } from 'vitest';
import { applyEntailment, applyVerdicts } from '@codemind/core';
import type { ContextSpan, TypedStatement } from '@codemind/core';

// Spec: openspec/changes/evidence-verifier-syntactic/specs/evidence-verification/spec.md → "Output
// policy over typed statements" (DIS-68), and openspec/changes/evidence-verifier-semantic/specs/
// evidence-verification/spec.md → "Entailment policy over verified statements" (DIS-70). Each test is
// one scenario, named after it.

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
const E2 = span('app/B.php', 'anchor', 5);
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

const ENTAILED = { verification: 'entailed' } as const;
const CITED = { verification: 'cited' } as const;

describe('Requirement: Entailment policy over verified statements', () => {
  it('A fact needs every citation entailed', () => {
    // Arrange
    const s1: TypedStatement = { text: 'S1', type: 'FACT', spans: [E1], evidenceIds: ['E1'] };
    const s2: TypedStatement = { text: 'S2', type: 'FACT', spans: [E1, E2], evidenceIds: ['E1', 'E2'] };

    // Act
    const verified = applyEntailment([s1, s2], [[ENTAILED], [ENTAILED, CITED]]);

    // Assert
    expect(verified).toEqual([
      { text: 'S1', type: 'FACT', spans: [E1], evidenceIds: ['E1'], verification: 'entailed', evidenceVerifications: ['entailed'] },
      {
        text: 'S2',
        type: 'INFERENCE',
        spans: [E1, E2],
        evidenceIds: ['E1', 'E2'],
        verification: 'cited',
        evidenceVerifications: ['entailed', 'cited'],
      },
    ]);
  });

  it('An entailed heuristic statement stays an inference', () => {
    // Act
    const [verified] = applyEntailment([S3], [[ENTAILED]]);

    // Assert
    expect(verified!.type).toBe('INFERENCE');
    expect(verified!.verification).toBe('entailed');
  });

  it('No statement is dropped for a cited citation', () => {
    // Arrange
    const s1: TypedStatement = { text: 'S1', type: 'FACT', spans: [E1], evidenceIds: ['E1'] };

    // Act
    const verified = applyEntailment([s1, S2], [[CITED], [CITED, CITED]]);

    // Assert
    expect(verified).toEqual([
      { text: 'S1', type: 'INFERENCE', spans: [E1], evidenceIds: ['E1'], verification: 'cited', evidenceVerifications: ['cited'] },
      {
        text: 'S2',
        type: 'INFERENCE',
        spans: [E1, E3],
        evidenceIds: ['E1', 'E3'],
        verification: 'cited',
        evidenceVerifications: ['cited', 'cited'],
      },
    ]);
  });
});
