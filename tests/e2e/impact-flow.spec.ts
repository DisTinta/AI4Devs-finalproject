import { expect, test } from '@playwright/test';

// Spec: openspec/changes/e2e-playwright-suite/specs/e2e-suite/spec.md → "Impact flow on the seed".
// The id of acme-shop is restated, not imported (design D4): `packages/web/src/data/sample-projects.ts`.
const ACME_SHOP_ID = 'a794456d-6d1b-5b55-a360-13fec83dc7bc';

test('Analysing a change to DiscountService reports high risk', async ({ page }) => {
  // Arrange
  await page.goto(`/p/${ACME_SHOP_ID}`);

  // Act
  await page.getByRole('link', { name: 'Analizar el impacto de un cambio' }).click();
  await page.getByRole('textbox', { name: 'Cambio' }).fill('cambiar los descuentos de DiscountService');
  await page.getByRole('button', { name: 'Analizar' }).click();

  // Assert: Screen 3, the high risk and DiscountService among the direct dependants
  await expect(page).toHaveURL(`/p/${ACME_SHOP_ID}/impact`);
  await expect(page.getByRole('heading', { name: 'Riesgo alto' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Directo' }).getByText('DiscountService').first()).toBeVisible();
});
