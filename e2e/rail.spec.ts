import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('create-pattern').click();
});

test('tool rail: roving radiogroup, tool card follows the tool', async ({ page }) => {
  const tools = page.getByRole('radiogroup', { name: 'Tools' }).getByRole('radio');
  await expect(tools.first()).toHaveAccessibleName('Paint');
  await expect(tools.first()).toBeChecked();
  await expect(page.getByRole('region', { name: /^Paint/ })).toContainText('click or drag');

  await tools.first().focus();
  await page.keyboard.press('ArrowDown');
  const next = page.locator('[data-tool=fill]');
  await expect(next).toBeChecked();
  await expect(next).toBeFocused();
  await page.keyboard.press('End');
  await expect(page.locator('[data-tool=ring]')).toBeChecked();
  await expect(page.getByLabel('Outer width (beads)')).toBeVisible();
  await expect(page.getByRole('radio', { name: /Move|Flytta/ })).toHaveCount(0);
});

test('palette: add a colour from the picker, edit popover returns focus', async ({ page }) => {
  const rows = page.getByRole('radiogroup', { name: 'Colours' }).getByRole('radio');
  const before = await rows.count();

  await page.getByRole('button', { name: 'Add colour' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add colour' });
  await expect(dialog.getByRole('button', { name: 'Metal' })).toHaveCount(0);
  await dialog.getByRole('searchbox').fill('723');
  await expect(dialog.getByRole('option')).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(rows).toHaveCount(before + 1);
  await expect(rows.last()).toContainText('DB-723');

  await page
    .getByRole('button', { name: /^Edit / })
    .first()
    .focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: /^Edit / })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: /^Edit / }).first()).toBeFocused();
});

for (const how of ['outside click', 'Escape'] as const) {
  test(`entry editor commits a typed name on ${how}`, async ({ page }) => {
    await page
      .getByRole('button', { name: /^Edit / })
      .first()
      .click();
    const dialog = page.getByRole('dialog', { name: /^Edit / });
    await dialog.getByLabel('Name').fill('Snow');
    if (how === 'Escape') await page.keyboard.press('Escape');
    else await page.getByRole('heading', { name: 'Colours' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByRole('radiogroup', { name: 'Colours' }).getByRole('radio').first(),
    ).toContainText('Snow');
  });
}
