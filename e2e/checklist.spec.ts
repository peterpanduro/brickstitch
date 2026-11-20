import { expect, test, type Page } from '@playwright/test';
import { createPattern, serialise, type Pattern } from '../src/core';

const PALETTE = [
  { id: 'w', db: 'DB-200', hex: '#F7F7F5' },
  { id: 'k', db: 'DB-010', hex: '#1C1C1C' },
];

/** Shaped 10 × 10 block (rows 2–9, cells 2–6) plus one loose bead at the end of row 0. */
function loosePattern(): Pattern {
  const p = createPattern({
    beadType: 'delica11',
    mode: 'shaped',
    width: 10,
    height: 10,
    palette: PALETTE,
  });
  const cells = p.cells.map((row, r) =>
    row.map((_, i) => {
      if (r === 0 && i === row.length - 1) return 'k';
      return r >= 2 && i >= 2 && i <= 6 ? 'w' : null;
    }),
  );
  return { ...p, title: 'Checklist', cells };
}

async function open(page: Page, p: Pattern): Promise<void> {
  const text = serialise(p, '0.1.0', new Date(0));
  await page.addInitScript((t) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('bs:v1:autosave', t);
      sessionStorage.setItem('seeded', '1');
    }
  }, text);
  await page.goto('./#/');
  await expect(page.locator('[data-view="editor"]')).toBeVisible();
}

test('checklist: loose bead → Show → Remove it → undo', async ({ page }) => {
  await open(page, loosePattern());
  const check = page.locator('[data-region="checklist"]');
  await expect(check.getByText('1 thing to look at')).toBeVisible();
  const loose = check.locator('[data-check="floating"]');
  await expect(loose.getByText('One bead is loose')).toBeVisible();

  await loose.getByRole('button', { name: 'Show' }).click();
  await expect(page.locator('rect.focus')).toHaveCount(1);

  await loose.getByRole('button', { name: 'Remove it' }).click();
  await expect(check.getByText('Ready to stitch')).toBeVisible();
  await expect(check.getByText('All beads are held in place')).toBeVisible();
  await expect(check.locator('[aria-live="polite"]')).toHaveText('1 bead removed');

  await page.keyboard.press('ControlOrMeta+z');
  await expect(check.getByText('1 thing to look at')).toBeVisible();
});

test('start row: pill, named gutter button, Change focuses it', async ({ page }) => {
  await open(page, loosePattern());
  await expect(page.getByText('Start here')).toBeVisible();
  const row = page.getByRole('button', { name: /^Row \d+, start row$/ });
  await expect(row).toHaveCount(1);
  await page.locator('[data-check="ladder"]').getByRole('button', { name: 'Change' }).click();
  await expect(row).toBeFocused();
  await expect(page.getByText('Click a row number to start there')).toBeVisible();
});

test('zoom bar: +, real size = 100 %, show all, size tiles', async ({ page }) => {
  await open(page, loosePattern());
  const pct = page.getByTestId('zoom-percent');
  const zoom = page.getByRole('toolbar', { name: 'Zoom' });
  const fit = await pct.textContent();
  await zoom.getByRole('button', { name: 'Zoom in' }).click();
  const n = (s: string | null) => Number((s ?? '').replace(/\D/g, ''));
  expect(n(await pct.textContent())).toBeGreaterThan(n(fit));
  await zoom.getByRole('button', { name: 'Real size' }).click();
  await expect(pct).toHaveText('100 %');
  await zoom.getByRole('button', { name: 'Show all' }).click();
  await expect(pct).toHaveText(fit ?? '');

  const tiles = page.locator('[data-region="size-tiles"]');
  await expect(tiles.getByText('One earring')).toBeVisible();
  await expect(tiles.locator('dd').first()).toHaveText('41');
});

test('print page "Fix first" returns to the editor with the loose bead in view', async ({
  page,
}) => {
  await open(page, loosePattern());
  await page.getByTestId('open-print').click();
  await expect(page.locator('[data-view="print"]')).toBeVisible();
  await page.getByRole('button', { name: 'Fix first' }).click();
  await expect(page.locator('[data-view="editor"]')).toBeVisible();
  await expect(page.locator('rect.focus')).toBeInViewport();
});

test('Change hint disappears when the row button loses focus', async ({ page }) => {
  await open(page, loosePattern());
  await page.locator('[data-check="ladder"]').getByRole('button', { name: 'Change' }).click();
  const hint = page.getByText('Click a row number to start there');
  await expect(hint).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(hint).toBeHidden();
});

type Box = { x: number; y: number; width: number; height: number };
const overlaps = (a: Box, b: Box): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

for (const tool of ['Paint', 'Ring']) {
  test(`tool card (${tool}) covers neither the sheet nor the start pill`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, loosePattern());
    await page.getByRole('radio', { name: tool, exact: true }).click();
    const card = await page.locator('[data-slot="tool-card"]').boundingBox();
    const sheet = await page.locator('.sheet').boundingBox();
    const pill = await page.getByText('Start here').boundingBox();
    if (!card || !sheet || !pill) throw new Error('missing box');
    expect(overlaps(card, sheet)).toBe(false);
    expect(overlaps(card, pill)).toBe(false);
  });
}
