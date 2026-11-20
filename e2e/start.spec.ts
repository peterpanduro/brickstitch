import { expect, test } from '@playwright/test';

test('first run lands on the start page; sliders show mm; create opens the editor', async ({
  page,
}) => {
  await page.goto('./');
  await expect(page.locator('[data-view="new"]')).toBeVisible();
  await expect(page.getByTestId('continue')).toHaveCount(0);

  const width = page.getByRole('slider', { name: /Width/ });
  await expect(width).toHaveValue('11');
  await width.focus();
  await page.keyboard.press('ArrowRight');
  await expect(width).toHaveValue('12');
  await expect(page.getByText('19.2 mm')).toBeVisible();

  await page.getByText('Free shape').click();
  await expect(page.getByText('up to', { exact: false })).toBeVisible();
  await page.getByText('Rectangle').click();

  await page.getByTestId('create-pattern').click();
  await expect(page.locator('[data-view="editor"]')).toBeVisible();
});

test('a dirty pattern asks before it is replaced; picker opens only after "Replace"', async ({
  page,
}) => {
  await page.goto('./');
  await page.getByTestId('create-pattern').click();
  await page.keyboard.press('2');
  await page.locator('[data-bead="0,0"]').click();

  await page.goto('./#/new');
  await expect(page.getByTestId('continue')).toBeVisible();

  await page.getByText('Start from an image').click();
  let chooser = false;
  page.on('filechooser', () => (chooser = true));
  await page.getByTestId('create-pattern').click();
  await expect(page.getByRole('alert')).toBeVisible();
  expect(chooser).toBe(false);

  await page.keyboard.press('Escape');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByTestId('create-pattern')).toBeFocused();
  await page.getByTestId('create-pattern').click();
  await page.getByText('Draw it yourself').click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByText('Start from an image').click();
  await page.getByTestId('create-pattern').click();
  await expect(page.getByRole('alert')).toBeVisible();

  const [fc] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Replace' }).click(),
  ]);
  expect(fc).toBeTruthy();
});
