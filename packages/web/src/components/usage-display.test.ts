import { describe, expect, it } from 'vitest';
import { baselineLine, formatConfidence, formatCost, formatLatency, formatTokens, savingsBadge } from './usage-display';

/** The digit-group separator, a no-break space (U+00A0), written by code point. */
const NBSP = String.fromCodePoint(0x00a0);

// Spec: openspec/changes/ask-page-states/specs/ask-page/spec.md → "How usage figures and notice details
// are written" (DIS-66 design D2, D3, D4, D20, D25, D28).

describe('How usage figures and notice details are written', () => {
  it('Confidence is written with two decimals', () => {
    // Arrange
    const confidences = [0.71, 0.7772998611746911, 0.6222, 1, 0];

    // Act
    const written = confidences.map((confidence) => formatConfidence(confidence));

    // Assert
    expect(written).toEqual(['0.71', '0.78', '0.62', '1.00', '0.00']);
  });

  it('Tokens are counted with grouped digits', () => {
    // Arrange
    const tokenPairs: Array<[number, number]> = [
      [4000, 812],
      [0, 0],
      [1, 0],
    ];
    const baselinePairs: Array<[number, number]> = [
      [41200, 4000],
      [7123, 0],
      [1, 1],
      [1234567, 12345],
    ];

    // Act
    const tokens = tokenPairs.map(([input, output]) => formatTokens(input, output));
    const lines = baselinePairs.map(([baseline, input]) => baselineLine(baseline, input));

    // Assert
    expect(tokens).toEqual([`4${NBSP}812 tokens`, '0 tokens', '1 token']);
    expect(lines).toEqual([
      `41${NBSP}200 tokens sin selección de contexto → 4${NBSP}000 con CODEMIND`,
      `7${NBSP}123 tokens sin selección de contexto → 0 con CODEMIND`,
      '1 token sin selección de contexto → 1 con CODEMIND',
      `1${NBSP}234${NBSP}567 tokens sin selección de contexto → 12${NBSP}345 con CODEMIND`,
    ]);
  });

  it('Cost is written in dollars', () => {
    // Arrange
    const costs = [0, 0.0004, 0.014, 0.0123, 1.23456];

    // Act
    const written = costs.map((cost) => formatCost(cost));

    // Assert
    expect(written).toEqual(['$0', '< $0.001', '$0.014', '$0.012', '$1.235']);
  });

  it('Latency is written in milliseconds or seconds', () => {
    // Arrange
    const latencies = [12, 999, 1000, 2100, 539201];

    // Act
    const written = latencies.map((latency) => formatLatency(latency));

    // Assert
    expect(written).toEqual(['12 ms', '999 ms', '1.0 s', '2.1 s', '539.2 s']);
  });

  it('Savings are written only when there are savings', () => {
    // Arrange
    const savings = [88, 88.3, 100, 0, -24.9, 0.04, -0.04];

    // Act
    const badges = savings.map((savingsPct) => savingsBadge(savingsPct));

    // Assert
    expect(badges).toEqual([
      { text: 'ahorro 88 % vs bruto', saving: true },
      { text: 'ahorro 88.3 % vs bruto', saving: true },
      { text: 'ahorro 100 % vs bruto', saving: true },
      { text: 'sin ahorro vs bruto', saving: false },
      { text: 'sin ahorro vs bruto', saving: false },
      { text: 'sin ahorro vs bruto', saving: false },
      { text: 'sin ahorro vs bruto', saving: false },
    ]);
  });
});
