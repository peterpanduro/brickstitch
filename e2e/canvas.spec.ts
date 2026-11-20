import { expect, test, type Page } from '@playwright/test';

const bead = (page: Page, r: number, h: number) => page.locator(`[data-bead="${r},${h}"]`);

async function centre(page: Page, r: number, h: number) {
  const box = await bead(page, r, h).boundingBox();
  if (!box) throw new Error(`bead ${r},${h} not visible`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { settingsWrites: number };
    w.settingsWrites = 0;
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k: string, v: string) {
      if (k === 'bs:v1:settings') w.settingsWrites++;
      return set.call(this, k, v);
    };
  });
  await page.goto('./');
  await page.getByTestId('create-pattern').click();
});

const writes = (page: Page) =>
  page.evaluate(() => (window as unknown as { settingsWrites: number }).settingsWrites);

test('ring: a click in the viewport padding places nothing', async ({ page }) => {
  await page.locator('[data-tool=ring]').click();
  const scene = page.locator('.canvas-wrap svg[role=application]');
  const before = await scene.innerHTML();
  const svg = (await scene.boundingBox())!;
  const y = svg.y + svg.height / 2;
  await page.mouse.move(svg.x + svg.width + 60, y);
  await expect(page.locator('.canvas-wrap .ghost')).toHaveCount(0);
  await page.mouse.click(svg.x + svg.width + 60, y);
  await page.mouse.move(svg.x + svg.width + 70, y);
  expect(await scene.innerHTML()).toBe(before);
  const undo = page.getByRole('button', { name: 'Undo' });
  await undo.click();
  await expect(undo).toBeDisabled();
});

test('crossing 1024 px mid-stroke cancels it and painting keeps working', async ({ page }) => {
  await page.keyboard.press('2');
  const before = await bead(page, 0, 2).getAttribute('fill');
  const a = await centre(page, 0, 0);
  const b = await centre(page, 0, 4);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await expect(bead(page, 0, 2)).not.toHaveAttribute('fill', before ?? '');
  await page.setViewportSize({ width: 820, height: 1000 });
  await expect(page.locator('[data-layout=tablet]')).toBeVisible();
  await page.mouse.up();
  await expect(bead(page, 0, 2)).toHaveAttribute('fill', before ?? '');

  const c = await centre(page, 1, 1);
  await page.mouse.click(c.x, c.y);
  await expect(bead(page, 1, 1)).not.toHaveAttribute('fill', before ?? '');
});

test('Ctrl + wheel zooms and saves the view once, not per wheel event', async ({ page }) => {
  const w = (await bead(page, 3, 3).boundingBox())!.width;
  const start = await writes(page);
  const c = await centre(page, 5, 5);
  await page.mouse.move(c.x, c.y);
  await page.keyboard.down('Control');
  for (let i = 0; i < 8; i++) await page.mouse.wheel(0, -40);
  await page.keyboard.up('Control');
  await expect.poll(async () => (await bead(page, 3, 3).boundingBox())!.width).toBeGreaterThan(w);
  await page.waitForTimeout(600);
  expect((await writes(page)) - start).toBe(1);
});
