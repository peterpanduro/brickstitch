import { expect, test, type Page } from '@playwright/test';

const view = (page: Page, name: string) => page.locator(`[data-view="${name}"]`);

async function paintOne(page: Page): Promise<void> {
  await page.goto('./');
  await page.getByTestId('create-pattern').click();
  await page.keyboard.press('2');
  await page.locator('[data-bead="0,2"]').click();
}

test('keyboard: route changes focus the h1; Escape leaves print and start', async ({ page }) => {
  await paintOne(page);
  await page.getByTestId('open-print').focus();
  await page.keyboard.press('Enter');
  await expect(view(page, 'print').locator('h1')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(view(page, 'editor').locator('h1')).toBeFocused();

  await page.goto('./#/new');
  await expect(view(page, 'new')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(view(page, 'editor').locator('h1')).toBeFocused();
});

test('keyboard: popovers trap focus, Escape closes and restores the opener', async ({ page }) => {
  await paintOne(page);
  for (const name of ['File', 'Add colour', 'Edit White']) {
    const opener = page.getByRole('button', { name, exact: true });
    await opener.focus();
    await page.keyboard.press('Enter');
    const pop = page.locator('[role="dialog"], [role="menu"]');
    await expect(pop).toHaveCount(1);
    await expect(pop).toContainText(/./);
    expect(await pop.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(pop).toHaveCount(0);
    await expect(opener).toBeFocused();
  }
});

test('phone: a sheet without fields takes focus and closes on Escape', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await page.getByTestId('create-pattern').click();
  const chip = page.locator('[data-slot="chips"] button').filter({ hasText: 'mm' });
  await chip.focus();
  await page.keyboard.press('Enter');
  const sheet = page.getByRole('dialog');
  await expect(sheet).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect(chip).toBeFocused();
});

test('names: colour detail switches and the colour code field are labelled', async ({ page }) => {
  await paintOne(page);
  await page.getByRole('button', { name: 'Edit White' }).click();
  await expect(page.locator('input[type="text"][aria-label="Colour code"]')).toHaveValue(/^#/);
  await page.keyboard.press('Escape');

  await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 120;
    c.height = 150;
    const g = c.getContext('2d')!;
    g.fillStyle = '#a7bede';
    g.fillRect(0, 0, 120, 150);
    g.fillStyle = '#d41f1c';
    g.fillRect(30, 30, 60, 90);
    const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/png'));
    const dt = new DataTransfer();
    dt.items.add(new File([blob], 'motif.png', { type: 'image/png' }));
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, cancelable: true }));
  });
  const next = page.getByRole('button', { name: /^Next:/ });
  await next.click();
  await next.click();
  const switches = page.getByRole('checkbox', { name: /Small but important/ });
  await expect(switches.first()).toBeVisible();
  const names = await switches.evaluateAll((els) =>
    els.map((el) =>
      (el.getAttribute('aria-labelledby') ?? '')
        .split(' ')
        .map((id) => document.getElementById(id)?.textContent?.trim())
        .join(' '),
    ),
  );
  expect(names.length).toBeGreaterThan(1);
  expect(new Set(names).size).toBe(names.length);
});

test('desktop targets: small buttons and segmented items are at least 40 px (R56)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await paintOne(page);
  const heights = async () =>
    page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.btn.sm, .seg > *')]
        .filter((e) => e.offsetParent !== null)
        .map((e) => ({ t: e.textContent?.trim() ?? '', h: e.getBoundingClientRect().height })),
    );
  const editor = await heights();
  await page.getByTestId('open-print').click();
  const print = await heights();
  const all = [...editor, ...print];
  expect(all.length).toBeGreaterThan(0);
  expect(all.filter((x) => x.h < 40)).toEqual([]);
});
