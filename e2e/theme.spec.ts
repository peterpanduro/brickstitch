import { expect, test, type Page } from '@playwright/test';

const bg = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test('theme: Dark persists across reload; System follows the OS colour scheme', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('./');
  await page.getByTestId('create-pattern').click();
  const menu = page.getByRole('button', { name: 'File' });

  await menu.click();
  await page.getByRole('menuitemradio', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await bg(page)).toBe('rgb(22, 21, 19)');

  await menu.click();
  await page.getByRole('menuitemradio', { name: 'System' }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /./);
  expect(await bg(page)).toBe('rgb(244, 239, 231)');
  await page.emulateMedia({ colorScheme: 'dark' });
  expect(await bg(page)).toBe('rgb(22, 21, 19)');
});
