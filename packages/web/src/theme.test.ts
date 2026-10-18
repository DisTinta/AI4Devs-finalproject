import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrastRatio, meetsAA } from './theme-contrast';

/** Every text/background pair of the spec table, by token name, with the colours the spec fixes. */
const TEXT_PAIRS = [
  { text: ['ink', '#212529'], background: ['surface', '#ffffff'] },
  { text: ['ink', '#212529'], background: ['canvas', '#f8f9fa'] },
  { text: ['ink-muted', '#495057'], background: ['surface', '#ffffff'] },
  { text: ['ink-muted', '#495057'], background: ['canvas', '#f8f9fa'] },
  { text: ['ink-subtle', '#6c757d'], background: ['surface', '#ffffff'] },
  { text: ['on-header', '#ffffff'], background: ['header', '#212529'] },
  { text: ['on-header-muted', '#adb5bd'], background: ['header', '#212529'] },
  { text: ['accent', '#1971c2'], background: ['surface', '#ffffff'] },
  { text: ['accent', '#1971c2'], background: ['canvas', '#f8f9fa'] },
  { text: ['on-accent', '#ffffff'], background: ['accent', '#1971c2'] },
  { text: ['accent', '#1971c2'], background: ['accent-soft', '#e7f5ff'] },
  { text: ['success', '#1e6f31'], background: ['success-soft', '#d3f9d8'] },
  { text: ['warning-ink', '#5c3d00'], background: ['warning-soft', '#fff9db'] },
] as const;

/** Text utilities of the decorative tokens and the wireframe values they hold: never a text colour. */
const FORBIDDEN_TEXT_COLOURS = ['text-stripe', 'text-stripe-soft', '#4dabf7', '#74c0fc'] as const;

/** Reads the custom properties declared in the `@theme` block of the web's `index.css` (design D24). */
function readThemeTokens(): Map<string, string> {
  const css = readFileSync(new URL('./index.css', import.meta.url), 'utf8');
  const themeBlock = /@theme\s*\{([^}]*)\}/.exec(css);
  if (themeBlock === null) {
    throw new Error('index.css declares no @theme block');
  }
  const tokens = new Map<string, string>();
  for (const declaration of themeBlock[1].matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
    tokens.set(declaration[1], declaration[2].trim());
  }
  return tokens;
}

describe('Theme colours and minimum contrast', () => {
  it('Every declared text pair meets 4.5:1', () => {
    // Arrange
    const tokens = readThemeTokens();

    // Act: resolve every pair of the table through the declared tokens.
    const resolvedPairs = TEXT_PAIRS.map(({ text, background }) => {
      const textColour = tokens.get(`color-${text[0]}`);
      const backgroundColour = tokens.get(`color-${background[0]}`);
      return {
        pair: `${text[0]} on ${background[0]}`,
        textColour,
        backgroundColour,
        expectedText: text[1],
        expectedBackground: background[1],
        ratio:
          textColour === undefined || backgroundColour === undefined
            ? 0
            : contrastRatio(textColour, backgroundColour),
      };
    });

    // Assert
    for (const resolved of resolvedPairs) {
      expect(resolved.textColour?.toLowerCase(), resolved.pair).toBe(resolved.expectedText);
      expect(resolved.backgroundColour?.toLowerCase(), resolved.pair).toBe(resolved.expectedBackground);
      expect(meetsAA(resolved.ratio), `${resolved.pair}: ${resolved.ratio.toFixed(2)}`).toBe(true);
    }
    expect(tokens.get('font-sans')).toBe("'Segoe UI', system-ui, sans-serif");
    expect(tokens.get('radius-card')).toBe('8px');
    expect(tokens.get('radius-button')).toBe('4px');
  });

  it('Wireframe accent colours are never text', () => {
    // Arrange: every source file of the web except the theme file and the tests, which hold the values on
    // purpose.
    const sourceDir = new URL('./', import.meta.url);
    const sourceFiles = readdirSync(sourceDir, { recursive: true, withFileTypes: false })
      .map((entry) => String(entry).replace(/\\/g, '/'))
      .filter((path) => /\.(tsx?|css|html)$/.test(path))
      .filter((path) => path !== 'index.css' && !/\.test\.tsx?$/.test(path));

    // Act
    const findings = sourceFiles.flatMap((path) => {
      const content = readFileSync(new URL(path, sourceDir), 'utf8').toLowerCase();
      return FORBIDDEN_TEXT_COLOURS.filter((value) => content.includes(value)).map(
        (value) => `${path}: ${value}`,
      );
    });

    // Assert
    expect(sourceFiles.length).toBeGreaterThan(0);
    expect(findings).toEqual([]);
  });

  it('A token changed to a low-contrast value fails the theme test', () => {
    // Arrange: the wireframe's button colour on white, and the maximum-contrast pair as a reference.
    const wireframeButton = { text: '#4dabf7', background: '#ffffff' };

    // Act
    const lowRatio = contrastRatio(wireframeButton.text, wireframeButton.background);
    const maxRatio = contrastRatio('#000000', '#ffffff');

    // Assert
    expect(lowRatio).toBeCloseTo(2.48, 2);
    expect(lowRatio).toBeLessThan(4.5);
    expect(meetsAA(lowRatio)).toBe(false);
    expect(maxRatio).toBeCloseTo(21, 5);
    expect(meetsAA(maxRatio)).toBe(true);
  });
});
