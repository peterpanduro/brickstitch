import { expect, test, type Page } from '@playwright/test';

const bead = (page: Page, r: number, h: number) => page.locator(`[data-bead="${r},${h}"]`);

async function centre(page: Page, r: number, h: number): Promise<{ x: number; y: number }> {
  const box = await bead(page, r, h).boundingBox();
  if (!box) throw new Error(`bead ${r},${h} not visible`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test('start page → create → paint drag → reload → restored → print → PDF', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('[data-view="new"]')).toBeVisible();
  await page.getByTestId('create-pattern').click();
  await expect(page.locator('[data-view="editor"]')).toBeVisible();

  const before = await bead(page, 0, 2).getAttribute('fill');
  await page.keyboard.press('2');
  const a = await centre(page, 0, 0);
  const b = await centre(page, 0, 6);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
  const painted = await bead(page, 0, 2).getAttribute('fill');
  expect(painted).not.toBe(before);

  await page.reload();
  await expect(bead(page, 0, 2)).toHaveAttribute('fill', painted ?? '');
  await expect(bead(page, 0, 6)).toHaveAttribute('fill', painted ?? '');

  await page.getByTestId('open-print').click();
  await expect(page.locator('[data-view="print"]')).toBeVisible();
  await expect(page.getByTestId('pdf-locale')).toHaveAttribute('data-value', 'en');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('download-pdf').click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.pdf$/);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  expect(Buffer.concat(chunks).subarray(0, 5).toString('latin1')).toBe('%PDF-');
});
