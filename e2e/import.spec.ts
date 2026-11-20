import { expect, test, type Page } from '@playwright/test';

/** Drops a generated motif PNG (black ring and red disc on light blue) on the window. */
async function dropImage(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 240;
    c.height = 300;
    const g = c.getContext('2d')!;
    g.fillStyle = '#a7bede';
    g.fillRect(0, 0, 240, 300);
    g.fillStyle = '#d41f1c';
    g.beginPath();
    g.ellipse(120, 160, 80, 110, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#111';
    g.lineWidth = 10;
    g.stroke();
    const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/png'));
    const dt = new DataTransfer();
    dt.items.add(new File([blob], 'motif.png', { type: 'image/png' }));
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, cancelable: true }));
  });
  await expect(page.locator('[data-view="import"]')).toBeVisible();
}

const cells = (page: Page) =>
  page.locator('[data-bead]').evaluateAll((els) => els.map((e) => e.getAttribute('fill')).join());

async function walkAndApply(page: Page): Promise<void> {
  const next = page.getByRole('button', { name: /^Next:/ });
  await expect(page.getByRole('heading', { name: 'Which part of the picture?' })).toBeVisible();
  await next.click();
  await page.getByRole('radio', { name: /Keep the whole picture/ }).check();
  await page.getByRole('radio', { name: /Find the background for me/ }).check();
  await next.click();
  await expect(page.getByRole('heading', { name: 'Which colours?' })).toBeVisible();
  await next.click();
  const details = page.getByRole('slider', { name: 'Small details' });
  await details.focus();
  await page.keyboard.press('ArrowRight');
  await expect(details).toHaveValue('0.05');
  await next.click();
  const apply = page.getByRole('button', { name: 'Use the pattern' });
  await expect(apply).toBeEnabled({ timeout: 10_000 });
  await apply.click();
}

test('import from the editor: five steps, apply = one undo step', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('create-pattern').click();
  await expect(page.locator('[data-view="editor"]')).toBeVisible();
  const before = await cells(page);

  await dropImage(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-view="editor"]')).toBeVisible();
  expect(await cells(page)).toBe(before);

  await dropImage(page);
  await walkAndApply(page);
  await expect(page.locator('[data-view="editor"]')).toBeVisible();
  expect(await cells(page)).not.toBe(before);
  await page.getByRole('button', { name: /^Undo/ }).click();
  expect(await cells(page)).toBe(before);
});

test('import from the start page: cancel returns there, apply = new pattern', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('create-pattern').click();
  const before = await cells(page);

  await page.goto('./#/new');
  await expect(page.locator('[data-view="new"]')).toBeVisible();
  await dropImage(page);
  await page.getByRole('button', { name: 'Back', exact: true }).first().click();
  await expect(page.locator('[data-view="new"]')).toBeVisible();

  await dropImage(page);
  await walkAndApply(page);
  await expect(page.locator('[data-view="editor"]')).toBeVisible();
  expect(await cells(page)).not.toBe(before);
  await page.getByRole('button', { name: /^Undo/ }).click();
  expect(await cells(page)).toBe(before);
});

test('start page "Start from an image": file picker, cancel keeps the choices, apply', async ({
  page,
}) => {
  await page.goto('./');
  await expect(page.locator('[data-view="new"]')).toBeVisible();
  const width = page.getByRole('slider', { name: /Width/ });
  await width.focus();
  await page.keyboard.press('ArrowRight');
  await expect(width).toHaveValue('12');
  await page.getByText('Start from an image').click();

  const pick = async () => {
    const [fc] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByTestId('create-pattern').click(),
    ]);
    await fc.setFiles('e2e/assets/motif.png');
    await expect(page.locator('[data-view="import"]')).toBeVisible();
  };

  await pick();
  await expect(page.locator('[data-view="import"] h1')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-view="new"]')).toBeVisible();
  await expect(width).toHaveValue('12');
  await expect(page.getByRole('radio', { name: /Start from an image/ })).toBeChecked();

  await pick();
  await walkAndApply(page);
  await expect(page.locator('[data-view="editor"]')).toBeVisible();
  expect(await cells(page)).toMatch(/#/);
});

test('import preview marks the start row like the editor: "Start here", no "S" badge', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('./');
  await page.getByTestId('create-pattern').click();
  await dropImage(page);
  const preview = page.locator('[data-view="import"] .view');
  const band = preview.locator('svg rect.bs-ladder');
  await expect(band).toBeVisible({ timeout: 10_000 });
  await expect(preview.locator('svg text.bs-ladder')).toBeHidden();
  const pill = preview.getByText('Start here');
  await expect(pill).toBeVisible();
  const [b, p] = [await band.boundingBox(), await pill.boundingBox()];
  expect(Math.abs(b!.y + b!.height / 2 - (p!.y + p!.height / 2))).toBeLessThan(3);
  expect(p!.x + p!.width).toBeLessThanOrEqual(b!.x + 1);
});

test('phone import preview: the pattern is not covered by the real-size inset', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await page.getByTestId('create-pattern').click();
  await dropImage(page);
  await page.getByRole('radio', { name: 'Beads', exact: true }).check();
  const view = page.locator('[data-view="import"] .view:visible');
  await expect(view.locator('svg rect.bs-ladder')).toBeVisible({ timeout: 10_000 });
  await expect(view.locator('.inset')).toHaveCount(0);
  await expect(view.getByText('Start here')).toHaveCount(0);
});

test('start-page import of a coloured image: original on Crop, processed with catalogue colours on Colours', async ({
  page,
}) => {
  await page.goto('./');
  await page.getByTestId('create-pattern').click();
  await page.goto('./#/new');
  await expect(page.locator('[data-view="new"]')).toBeVisible();
  await dropImage(page);
  const next = page.getByRole('button', { name: /^Next:/ });
  const view = (name: string) => page.getByRole('radio', { name, exact: true });

  await expect(view('Original')).toBeChecked();
  await next.click();
  await expect(view('How it is read')).toBeChecked();
  await next.click();
  await expect(page.getByRole('heading', { name: 'Which colours?' })).toBeVisible();
  await expect(view('How it is read')).toBeChecked();
  await expect(page.getByRole('radio', { name: /Pick for me from the catalogue/ })).toBeChecked();
  const used = page.locator('section[aria-labelledby="import-used"] li');
  await expect(async () => expect(await used.count()).toBeGreaterThan(2)).toPass({
    timeout: 10_000,
  });

  await view('Original').check();
  await next.click();
  await expect(view('Original')).toBeChecked();
});

test('phone import: the pane follows the step until the user picks one', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await page.getByTestId('create-pattern').click();
  await dropImage(page);
  const next = page.getByRole('button', { name: /^Next:/ });
  const pane = (name: string) => page.getByRole('radio', { name, exact: true });

  await expect(pane('Picture')).toBeChecked();
  await next.click();
  await expect(pane('Picture')).toBeChecked();
  await next.click();
  await expect(pane('Beads')).toBeChecked();
  await pane('Picture').check();
  await next.click();
  await expect(pane('Picture')).toBeChecked();
});

test('editor import: catalogue colours start on for the starter pattern, off with a third colour', async ({
  page,
}) => {
  await page.goto('./');
  await page.getByTestId('create-pattern').click();
  await expect(page.locator('[data-view="editor"]')).toBeVisible();
  const next = page.getByRole('button', { name: /^Next:/ });
  const toColours = async () => {
    await dropImage(page);
    await next.click();
    await next.click();
    await expect(page.getByRole('heading', { name: 'Which colours?' })).toBeVisible();
  };

  await toColours();
  await expect(page.getByRole('radio', { name: /Pick for me from the catalogue/ })).toBeChecked();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-view="editor"]')).toBeVisible();

  await page.getByRole('button', { name: 'Add colour' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add colour' });
  await dialog.getByRole('searchbox').fill('723');
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(dialog).toHaveCount(0);

  await toColours();
  await expect(page.getByRole('radio', { name: /Only my pattern/ })).toBeChecked();
});
