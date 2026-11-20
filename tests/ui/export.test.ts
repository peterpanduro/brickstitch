import { describe, expect, it, vi } from 'vitest';
import { analyse, type Pattern } from '../../src/core';
import { checklist } from '../../src/ui/state/checklist';
import { exportPdf, floatingIssue } from '../../src/ui/state/export';
import { fromRowsJson } from '../adapters';
import { shaped } from '../shaped';
import liten from '../fixtures/liten.rows.json';

const OVERHANG: Pattern = {
  ...shaped(['AAAAA', '.AAA', '.....', '....', '....A']),
  ladder: { kind: 'manual', row: 1 },
};

describe('export pdf', () => {
  it('summarises the floating issue from the checklist', () => {
    expect(floatingIssue(checklist(OVERHANG, analyse(OVERHANG)))).toEqual({
      n: 1,
      r: 3,
    });
    const l = fromRowsJson(liten);
    expect(floatingIssue(checklist(l, analyse(l)))).toBeNull();
  });

  it('passes locale and realSize to the renderer', async () => {
    const p = fromRowsJson(liten);
    const render = vi.fn(async () => new Uint8Array());
    await exportPdf(p, analyse(p), { locale: 'sv', realSize: true }, render);
    expect(render).toHaveBeenCalledWith(expect.objectContaining({ locale: 'sv', realSize: true }));
  });

  it('renders with the chosen locale and options, names the file after the title', async () => {
    const p = { ...fromRowsJson(liten), title: 'Liten Flagga!' };
    const render = vi.fn(async () => new Uint8Array([37, 80, 68, 70]));
    const out = await exportPdf(p, analyse(p), { locale: 'en', realSize: false }, render);
    expect(out.name).toBe('liten-flagga.pdf');
    expect(out.bytes).toEqual(new Uint8Array([37, 80, 68, 70]));
    expect(render).toHaveBeenCalledWith(
      expect.objectContaining({ pattern: p, locale: 'en', realSize: false }),
    );
    const arg = render.mock.calls[0] as unknown as [{ table: { total: number } }];
    expect(arg[0].table.total).toBe(231);
  });
});
