import { expect, test } from '@playwright/test';

// Spec: openspec/changes/e2e-playwright-suite/specs/e2e-suite/spec.md → "Honest unknown on the seed".
// Restated, not imported (design D4): the id of acme-shop is `packages/web/src/data/sample-projects.ts`;
// Q6 is a question without anchor in the graph, listed in `fixtures/README.md`.
const ACME_SHOP_ID = 'a794456d-6d1b-5b55-a360-13fec83dc7bc';
const Q6 = '¿Cómo se gestionan los reembolsos de un pedido?';

test('Asking Q6 on acme-shop shows no verified answer', async ({ page }) => {
  // Arrange
  await page.goto(`/p/${ACME_SHOP_ID}`);

  // Act
  await page.getByRole('textbox', { name: 'Pregunta' }).fill(Q6);
  await page.getByRole('button', { name: 'Preguntar' }).click();

  // Assert: the honest unknown and its reason
  await expect(page.getByRole('heading', { name: 'Sin respuesta verificada' })).toBeVisible();
  await expect(page.getByText('Motivo: no-anchor')).toBeVisible();

  // Assert: nothing that looks like an answer, no statement badge and no evidence button
  for (const badge of ['verificado', 'sin verificar', 'HECHO', 'INFERIDO']) {
    await expect(page.getByText(badge, { exact: true }), badge).toHaveCount(0);
  }
  await expect(page.locator('button[aria-expanded]')).toHaveCount(0);
});
