import { describe, expect, it } from 'vitest';
import { ICONS, type IconName } from '../../src/ui/icons';

const USED: readonly IconName[] = [
  'check',
  'alert',
  'start',
  'chevron',
  'chevron-left',
  'chevron-down',
  'ruler',
  'brush',
  'eraser',
  'fill',
  'pipette',
  'ring',
  'undo',
  'redo',
  'image',
  'print',
  'download',
  'plus',
  'minus',
  'pencil',
  'folder',
  'more',
  'close',
  'search',
  'crop',
  'wand',
  'info',
  'mirror',
  'rotate-left',
  'rotate-right',
  'grid',
];

describe('icons (R45)', () => {
  it.each(USED)('has a path for %s', (name) => {
    expect(ICONS[name]).toMatch(/^M[\d .,a-zA-Z-]+$/);
  });

  it('has no out-of-scope icons (R43)', () => {
    for (const n of ['hand', 'clock', 'heart']) expect(Object.keys(ICONS)).not.toContain(n);
  });
});
