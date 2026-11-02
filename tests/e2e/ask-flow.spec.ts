import { expect, test } from '@playwright/test';

// Spec: openspec/changes/e2e-playwright-suite/specs/e2e-suite/spec.md → "Ask flow on the seed".
// Restated, not imported (design D4): the id of acme-shop is `packages/web/src/data/sample-projects.ts`;
// Q1 is the first golden question of `packages/web/src/data/suggested-questions.ts` (`fixtures/README.md`).
const ACME_SHOP_ID = 'a794456d-6d1b-5b55-a360-13fec83dc7bc';
const Q1 = '¿Cómo se calcula el precio final de un pedido?';
test('Asking Q1 on acme-shop shows verified evidence and the usage panel', async ({ page }) => {
  // Arrange
  await page.goto('/');

  // Act
  await page.getByRole('link', { name: 'Explorar proyecto acme-shop' }).click();
  await page.getByRole('textbox', { name: 'Pregunta' }).fill(Q1);
  await page.getByRole('button', { name: 'Preguntar' }).click();

  // Assert: Screen 2 of acme-shop and a statement with its verification badge
  await expect(page).toHaveURL(`/p/${ACME_SHOP_ID}`);
  await expect(page.getByText(/^(verificado|sin verificar)$/).first()).toBeVisible();

  // Assert: the first evidence expands and shows its own excerpt, the element its `aria-controls` names
  const evidence = page.locator('button[aria-expanded]').first();
  await evidence.click();
  await expect(evidence).toHaveAttribute('aria-expanded', 'true');
  const excerptId = await evidence.getAttribute('aria-controls');
  expect(excerptId, 'aria-controls of the expanded evidence').toBeTruthy();
  const excerpt = page.locator(`[id="${excerptId}"]`);
  await expect(excerpt).toBeVisible();
  await expect(excerpt).toHaveText(/\S/);

  // Assert: the usage panel shows tokens, cost and the savings badge
  const usage = page.getByRole('region', { name: 'Uso' });
  await expect(usage).toBeVisible();
  await expect(usage).toContainText(/\d[\d\s]* tokens?\b/);
  await expect(usage).toContainText(/(\$0|< \$0\.001|\$\d+\.\d{3})/);
  await expect(usage).toContainText(/(ahorro \d+(\.\d)? % vs bruto|sin ahorro vs bruto)/);
});
