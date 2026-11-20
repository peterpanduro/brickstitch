import { expect, test, type CDPSession, type Page } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

type Pt = { x: number; y: number };

const bead = (page: Page, r: number, h: number) => page.locator(`[data-bead="${r},${h}"]`);

async function centre(page: Page, r: number, h: number): Promise<Pt> {
  const box = await bead(page, r, h).boundingBox();
  if (!box) throw new Error(`bead ${r},${h} not visible`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Multi-touch through CDP: every event lists all fingers still down. */
async function touch(cdp: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd', pts: Pt[]) {
  await cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: pts.map((p, id) => ({ x: p.x, y: p.y, id })),
  });
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
  await expect(page.locator('[data-layout]')).toBeVisible();
});

test('touch: one finger paints a stroke', async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  const dock = page.getByTestId('dock');
  await dock.getByRole('radio', { name: 'Black' }).tap();
  const before = await bead(page, 0, 2).getAttribute('fill');
  const a = await centre(page, 0, 0);
  const b = await centre(page, 0, 4);
  await touch(cdp, 'touchStart', [a]);
  for (let i = 1; i <= 6; i++)
    await touch(cdp, 'touchMove', [{ x: a.x + ((b.x - a.x) * i) / 6, y: a.y }]);
  await touch(cdp, 'touchEnd', []);
  const painted = await bead(page, 0, 2).getAttribute('fill');
  expect(painted).not.toBe(before);
  await expect(bead(page, 0, 4)).toHaveAttribute('fill', painted ?? '');
  await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled();
});

test('touch: a second finger cancels the stroke and pinch-zooms', async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  const undo = page.getByRole('button', { name: 'Undo' });
  const undoBefore = await undo.isEnabled();
  await page.getByTestId('dock').getByRole('radio', { name: 'Black' }).tap();
  const before = await bead(page, 0, 2).getAttribute('fill');
  const widthBefore = (await bead(page, 5, 3).boundingBox())!.width;

  const a = await centre(page, 0, 0);
  const b = await centre(page, 0, 4);
  await touch(cdp, 'touchStart', [a]);
  await touch(cdp, 'touchMove', [{ x: (a.x + b.x) / 2, y: a.y }]);
  await touch(cdp, 'touchMove', [b]);
  await expect(bead(page, 0, 2)).not.toHaveAttribute('fill', before ?? '');

  const writes = () =>
    page.evaluate(() => (window as unknown as { settingsWrites: number }).settingsWrites);
  const writesBefore = await writes();
  const c = await centre(page, 8, 4);
  const f1 = { x: c.x - 30, y: c.y };
  const f2 = { x: c.x + 30, y: c.y };
  await touch(cdp, 'touchStart', [b, f2]);
  await expect(bead(page, 0, 2)).toHaveAttribute('fill', before ?? '');
  await touch(cdp, 'touchMove', [f1, f2]);
  for (let i = 1; i <= 5; i++)
    await touch(cdp, 'touchMove', [
      { x: f1.x - i * 20, y: f1.y },
      { x: f2.x + i * 20, y: f2.y },
    ]);
  await touch(cdp, 'touchEnd', []);

  await expect
    .poll(async () => (await bead(page, 5, 3).boundingBox())?.width ?? 0)
    .toBeGreaterThan(widthBefore * 1.5);
  await expect(bead(page, 0, 2)).toHaveAttribute('fill', before ?? '');
  expect(await undo.isEnabled()).toBe(undoBefore);
  expect((await writes()) - writesBefore).toBe(1);
});

test('touch: the phone colour line opens the entry editor without a long press', async ({
  page,
}) => {
  const line = page.getByTestId('dock').getByRole('button', { name: 'Edit White' });
  await line.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Edit White' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(line).toBeFocused();
  await line.click();
  await expect(page.getByRole('dialog', { name: 'Edit White' })).toBeVisible();
});

test.describe('tablet', () => {
  test.use({ viewport: { width: 820, height: 1180 } });

  test('touch: "Change or edit colour" is a 48 px target', async ({ page }) => {
    await expect(page.locator('[data-layout=tablet]')).toBeVisible();
    const link = page.getByRole('button', { name: 'Change or edit colour' });
    expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  });
});

test('touch: dock tools, option sheet, colour sheets and long press', async ({ page }) => {
  const dock = page.getByTestId('dock');
  const tools = dock.getByRole('radiogroup', { name: 'Tools' });
  await expect(tools.getByRole('radio', { name: 'Pick' })).toBeVisible();
  const box = await tools.getByRole('radio').first().boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(48);

  await tools.getByRole('radio', { name: 'Ring' }).tap();
  await expect(tools.getByRole('radio', { name: 'Ring' })).toBeChecked();
  await tools.getByRole('radio', { name: 'Ring' }).tap();
  const options = page.getByRole('dialog', { name: 'Ring options' });
  await expect(options.getByLabel('Outer width (beads)')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(options).toHaveCount(0);
  await tools.getByRole('radio', { name: 'Ring' }).tap();
  await expect(options).toBeVisible();
  await tools.getByRole('radio', { name: 'Ring' }).tap();
  await expect(options).toHaveCount(0);

  await dock.getByRole('button', { name: 'Add colour' }).tap();
  await expect(page.getByRole('dialog', { name: 'Add colour' })).toBeVisible();
  await page.keyboard.press('Escape');

  const white = dock.getByRole('radio', { name: 'White' });
  const sw = (await white.boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  const at = { x: sw.x + sw.width / 2, y: sw.y + sw.height / 3 };
  await touch(cdp, 'touchStart', [at]);
  await page.waitForTimeout(650);
  await touch(cdp, 'touchEnd', []);
  await expect(page.getByRole('dialog', { name: /^Edit / })).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByTestId('checklist-chip').tap();
  await expect(page.getByRole('dialog', { name: 'Can it be stitched?' })).toBeVisible();
});
