import { expect, test } from '@playwright/test';

test('print page without an inline PDF viewer shows the summary card', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'pdfViewerEnabled', { value: false });
  });
  await page.goto('/');
  await page.getByTestId('create-pattern').click();
  await page.keyboard.press('2');
  await page.locator('[data-bead="0,2"]').click();
  await page.getByTestId('open-print').click();
  await expect(page.getByRole('link', { name: 'Open PDF' })).toBeVisible();
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Print', exact: true })).toHaveCount(0);
});

test('print page: live preview,language switch, download, back', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'pdfViewerEnabled', { value: true });
  });
  await page.goto('/');
  await page.getByTestId('create-pattern').click();
  await page.keyboard.press('2');
  await page.locator('[data-bead="0,2"]').click();
  await page.getByTestId('open-print').click();
  await expect(page.locator('[data-view="print"]')).toBeVisible();

  const frame = page.locator('iframe');
  await expect(frame).toHaveAttribute('src', /^blob:/);
  const first = await frame.getAttribute('src');

  await page.getByTestId('pdf-locale').getByRole('radio', { name: 'Svenska' }).click();
  await expect(page.getByTestId('pdf-locale')).toHaveAttribute('data-value', 'sv');
  await expect(frame).not.toHaveAttribute('src', first ?? '');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('download-pdf').click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.pdf$/);

  await page.locator('h1').focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-view="print"]')).toHaveCount(0);
});
