import { expect, test, type Page } from '@playwright/test';
import type { AskAnswered } from '../../packages/web/src/services/api-client';

// Spec: openspec/changes/e2e-playwright-suite/specs/e2e-suite/spec.md → "Accessibility of Screen 2 in a
// real browser" (design D2, D5). axe-core runs inside the browser, where the layout exists, which jsdom
// (`tests/a11y/`) cannot give. The id of acme-shop and Q1 are restated, not imported (design D4):
// `packages/web/src/data/sample-projects.ts`, `suggested-questions.ts`.
const ACME_SHOP_ID = 'a794456d-6d1b-5b55-a360-13fec83dc7bc';
const Q1 = '¿Cómo se calcula el precio final de un pedido?';
const WIDTHS = [320, 1280];
const HEIGHT = 900;

interface AxeViolation {
  id: string;
  targets: string[];
}

interface AxeWindow {
  axe: {
    run: (context: Document) => Promise<{ violations: { id: string; nodes: { target: unknown[] }[] }[] }>;
  };
}

/** Injects axe-core from `node_modules` and runs it on the whole document, without disabling a rule. */
async function axeViolations(page: Page): Promise<AxeViolation[]> {
  await page.addScriptTag({ path: 'node_modules/axe-core/axe.min.js' });
  return page.evaluate(async () => {
    const { violations } = await (window as unknown as AxeWindow).axe.run(document);
    return violations.map(({ id, nodes }) => ({ id, targets: nodes.flatMap((node) => node.target.map(String)) }));
  });
}

/** The violations as one readable line each, so a failure names the rule and where it is. */
function describe(violations: AxeViolation[]): string[] {
  return violations.map(({ id, targets }) => `${id}: ${targets.join(' | ')}`);
}

/**
 * Whether the document is wider than the viewport, or `main` is wider than itself. The page frame clips its
 * overflow (`overflow-hidden`), so the document alone would not see content that escapes inside it; `main`
 * does (its scroll width counts the overflow of its children).
 */
async function overflows(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const root = document.documentElement;
    const main = document.querySelector('main');
    return root.scrollWidth > root.clientWidth || (main !== null && main.scrollWidth > main.clientWidth);
  });
}

/** Expands every evidence of the answer on screen. */
async function expandEveryEvidence(page: Page): Promise<void> {
  const collapsed = page.locator('button[aria-expanded="false"]');
  while ((await collapsed.count()) > 0) await collapsed.first().click();
}

test('Every golden evidence expanded has no violation and no overflow', async ({ page }) => {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: HEIGHT });
    await page.goto(`/p/${ACME_SHOP_ID}`);
    const suggestions = page.getByRole('group', { name: 'Prueba:' }).getByRole('button');
    const total = await suggestions.count();
    expect(total, `suggestions at ${width} px`).toBe(3);

    for (let index = 0; index < total; index += 1) {
      // Arrange: a fresh page, so the answer on screen is the one of this question
      await page.goto(`/p/${ACME_SHOP_ID}`);
      const suggestion = page.getByRole('group', { name: 'Prueba:' }).getByRole('button').nth(index);
      const label = `${await suggestion.innerText()} at ${width} px`;

      // Act
      await suggestion.click();
      await expect(page.getByRole('region', { name: 'Uso' }), label).toBeVisible();
      await expandEveryEvidence(page);

      // Assert
      expect(describe(await axeViolations(page)), label).toEqual([]);
      expect(await overflows(page), `${label}: horizontal overflow`).toBe(false);
    }
  }
});

test('A mocked answer with a long path does not overflow', async ({ page }) => {
  // Arrange: a valid answer whose statement and evidence hold a 96-character path without spaces
  const longPath = `app/${'a'.repeat(88)}.php`;
  const body: AskAnswered = {
    answer: `El precio se calcula en ${longPath}.`,
    statements: [
      { text: `El precio final se calcula en ${longPath}.`, type: 'FACT', verification: 'entailed', evidenceIds: ['ev-1'] },
    ],
    evidence: [{ id: 'ev-1', file: longPath, startLine: 1, endLine: 2, excerpt: `// ${longPath}\nreturn $total;` }],
    confidence: 0.9,
    usage: {
      inputTokens: 1200,
      outputTokens: 80,
      baselineTokens: 9000,
      baselineEstimator: 'chars-div-4',
      savingsPct: 86.7,
      costUsd: 0.004,
      latencyMs: 350,
      cacheHit: false,
      generation: { inputTokens: 1000, outputTokens: 80, costUsd: 0.003 },
      verification: { calls: 1, cacheHits: 0, inputTokens: 200, outputTokens: 10, costUsd: 0.001, latencyMs: 100 },
      projectCache: { queries: 10, cacheHits: 4, hitRatePct: 40 },
    },
  };
  await page.route('**/api/projects/*/ask', (route) => route.fulfill({ status: 200, contentType: 'application/json', json: body }));

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: HEIGHT });
    await page.goto(`/p/${ACME_SHOP_ID}`);

    // Act
    await page.getByRole('textbox', { name: 'Pregunta' }).fill(Q1);
    await page.getByRole('button', { name: 'Preguntar' }).click();
    await expect(page.getByRole('region', { name: 'Uso' })).toBeVisible();
    await expandEveryEvidence(page);

    // Assert
    expect(describe(await axeViolations(page)), `at ${width} px`).toEqual([]);
    expect(await overflows(page), `at ${width} px: horizontal overflow`).toBe(false);
  }
});
