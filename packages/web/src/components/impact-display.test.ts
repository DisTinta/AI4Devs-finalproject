import { describe, expect, it } from 'vitest';
import {
  coChangeLabel,
  ENTRY_SEPARATOR,
  hopsLabel,
  prsLabel,
  resolutionLabel,
  riskHeading,
  staleLabel,
  validChange,
} from './impact-display';

// Spec: openspec/changes/impact-page/specs/impact-page/spec.md, "How a change and the entries of a report
// are written" (DIS-14 design D5, D6).

describe('How a change and the entries of a report are written', () => {
  it('Change length is counted in code points after trimming', () => {
    // Arrange
    const inputs = ['  hola  ', 'hola!', 'a'.repeat(500), 'a'.repeat(501), '😀'.repeat(250), '     ', 'hola\u0000!'];

    // Act
    const checked = inputs.map(validChange);

    // Assert
    expect(checked).toEqual([undefined, 'hola!', 'a'.repeat(500), undefined, '😀'.repeat(250), undefined, undefined]);
  });

  it('Hops, resolution, document and history are written in Spanish', () => {
    // Arrange
    const hops = [0, 1, 2];
    const rates = [1, 0.8, 0.333];
    const prLists = [[24, 33, 55], [7], []];

    // Act
    const written = {
      hops: hops.map(hopsLabel),
      resolutions: [resolutionLabel('exact'), resolutionLabel('heuristic')],
      stale: staleLabel('abcdef0123456789'),
      coChange: rates.map(coChangeLabel),
      prs: prLists.map(prsLabel),
      risks: (['HIGH', 'MEDIUM', 'LOW'] as const).map(riskHeading),
    };

    // Assert
    expect(written).toEqual({
      hops: ['0 saltos', '1 salto', '2 saltos'],
      resolutions: ['exacta', 'heurística'],
      stale: 'desactualizada desde el commit abcdef0',
      coChange: ['co-cambia 100 %', 'co-cambia 80 %', 'co-cambia 33 %'],
      prs: ['PR #24, #33, #55', 'PR #7', 'sin PR'],
      risks: ['Riesgo alto', 'Riesgo medio', 'Riesgo bajo'],
    });
    for (const label of written.coChange) {
      expect(label.codePointAt(label.length - 2)).toBe(0x20);
    }
    expect(ENTRY_SEPARATOR).toBe(' · ');
  });
});
