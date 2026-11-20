import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, t, type AnalysisSettings, type Pattern } from '../../src/core';
import {
  appliedSettings,
  colourCount,
  defaultPane,
  pictureView,
  applyBlock,
  goTo,
  initialSteps,
  initialWizard,
  linesResetValue,
  modeSwitchPatch,
  nextStep,
  prevStep,
  runSettings,
  savedSettings,
  selectedSizePreset,
  sizePresetPatch,
  stepDone,
  retainThumbs,
  thumbKey,
  thumbMisses,
  WIZARD_STEPS,
} from '../../src/ui/state/import-wizard';
import {
  backgroundChoice,
  backgroundPatch,
  removalAutoPatch,
  removalPatch,
  removalSlider,
  settingsToForm,
  type ImportForm,
} from '../../src/ui/state/import-settings';
import { autoFixReport, wizardBase } from '../../src/ui/state/import-merge';
import {
  buildNewPattern,
  starterPattern,
  type NewPatternChoice,
} from '../../src/ui/state/new-pattern';
import { sizePresets } from '../../src/ui/state/presets';
import { pictureLegend } from '../../src/ui/state/overlay';

const form = (s: Partial<AnalysisSettings> = {}): ImportForm =>
  settingsToForm({ ...DEFAULT_SETTINGS, ...s });

const choice: NewPatternChoice = {
  beadType: 'delica15',
  mode: 'panel',
  width: 15,
  height: 30,
  background: 'DB-010',
};

describe('step machine', () => {
  it('starts on Beskär with only it visited', () => {
    const s = initialSteps();
    expect(s.step).toBe('crop');
    expect(s.visited).toEqual(['crop']);
    expect(WIZARD_STEPS).toEqual(['crop', 'background', 'colours', 'details', 'done']);
  });

  it('steps forward and back, clamped, and records visits', () => {
    let s = nextStep(initialSteps());
    expect(s.step).toBe('background');
    s = nextStep(nextStep(nextStep(nextStep(s))));
    expect(s.step).toBe('done');
    expect(nextStep(s)).toBe(s);
    expect(s.visited).toEqual(WIZARD_STEPS);
    s = prevStep(s);
    expect(s.step).toBe('details');
    expect(prevStep(initialSteps())).toEqual(initialSteps());
  });

  it('jumps to any step; visited steps other than the current one are done', () => {
    const s = goTo(initialSteps(), 'details');
    expect(s.step).toBe('details');
    expect(s.visited).toEqual(['crop', 'details']);
    expect(stepDone(s, 'crop')).toBe(true);
    expect(stepDone(s, 'details')).toBe(false);
    expect(stepDone(s, 'background')).toBe(false);
    expect(goTo(s, 'crop').visited).toEqual(['crop', 'details']);
  });

  it('guards Apply: invalid, then working, failed, empty; null when ready', () => {
    const ok = { valid: true, working: false, failed: false, empty: false };
    expect(applyBlock(ok)).toBeNull();
    expect(applyBlock({ ...ok, valid: false, working: true })).toBe('import.invalid');
    expect(applyBlock({ ...ok, working: true, failed: true })).toBe('import.working');
    expect(applyBlock({ ...ok, failed: true })).toBe('import.failed');
    expect(applyBlock({ ...ok, empty: true })).toBe('import.empty');
  });
});

describe('initial target', () => {
  const p: Pattern = { ...starterPattern(), mode: 'shaped', width: 20, height: 28 };

  it('editor: the current pattern and the saved settings', () => {
    const saved = { ...DEFAULT_SETTINGS, autoSize: 'width' as const, maxColors: 6 };
    const w = initialWizard({ source: 'editor' }, p, saved);
    expect(w).toMatchObject({ beadType: 'delica11', mode: 'shaped', width: 20, height: 28 });
    expect(w.form).toEqual(settingsToForm(saved));
  });

  it('start: the choice size with autoSize null', () => {
    const saved = { ...DEFAULT_SETTINGS, autoSize: 'height' as const };
    const w = initialWizard({ source: 'start', choice }, p, saved);
    expect(w).toMatchObject({ beadType: 'delica15', mode: 'panel', width: 15, height: 30 });
    expect(w.form.autoSize).toBeNull();
  });

  it('start: panel analysis uses the Grundfärg id; the saved settings keep auto', () => {
    const target = { source: 'start', choice } as const;
    const base = wizardBase(target, p);
    const grund = base.palette[0]!;
    expect(grund.db).toBe('DB-010');
    expect(runSettings(form(), DEFAULT_SETTINGS, target, base, 'panel').panelBackground).toBe(
      grund.id,
    );
    expect(runSettings(form(), DEFAULT_SETTINGS, target, base, 'shaped').panelBackground).toBe(
      'auto',
    );
    expect(savedSettings(form(), DEFAULT_SETTINGS).panelBackground).toBe('auto');
  });

  it('editor: analysis keeps the saved panelBackground', () => {
    const target = { source: 'editor' } as const;
    expect(runSettings(form(), DEFAULT_SETTINGS, target, p, 'panel').panelBackground).toBe('auto');
  });

  it('wizardBase: the current pattern from the editor, a new pattern of the choice from start', () => {
    expect(wizardBase({ source: 'editor' }, p)).toBe(p);
    expect(wizardBase({ source: 'start', choice }, p).palette).toEqual(
      buildNewPattern(choice).palette,
    );
  });
});

describe('background choice (R53 step 2)', () => {
  it('maps the form to a card', () => {
    expect(backgroundChoice(form())).toBe('auto');
    expect(backgroundChoice(form({ background: 'threshold' }))).toBe('light');
    expect(backgroundChoice(form({ background: 'none' }))).toBe('whole');
    expect(backgroundChoice(form({ background: 'alpha' }))).toBe('custom');
    expect(backgroundChoice(form({ background: 'borderKey' }))).toBe('custom');
    expect(backgroundChoice(form({ background: 'threshold', thresholdInvert: true }))).toBe(
      'custom',
    );
  });

  it('maps a card to a form patch', () => {
    expect(backgroundPatch('auto')).toEqual({ background: 'auto' });
    expect(backgroundPatch('light')).toEqual({ background: 'threshold', thresholdInvert: false });
    expect(backgroundPatch('whole')).toEqual({ background: 'none' });
    for (const c of ['auto', 'light', 'whole'] as const)
      expect(backgroundChoice({ ...form({ thresholdInvert: true }), ...backgroundPatch(c) })).toBe(
        c,
      );
  });
});

describe('removal slider (R53 step 2)', () => {
  it('auto/borderKey: tolerance 2-40, Mer = higher', () => {
    for (const background of ['auto', 'borderKey'] as const) {
      const s = removalSlider(form({ background, borderKeyTolerance: 12 }), 'borderKey');
      expect(s).toMatchObject({ visible: true, field: 'borderKeyTolerance', min: 2, max: 40 });
      expect(s.value).toBe(12);
      expect(s.status).toBeNull();
      expect(removalPatch(s, 30)).toEqual({ borderKeyTolerance: 30 });
    }
  });

  it('auto: the slider rests at 12 and is marked automatic; a manual value is not', () => {
    const auto = removalSlider(form(), 'borderKey');
    expect(auto).toMatchObject({ field: 'borderKeyTolerance', value: 12, auto: true });
    expect(removalPatch(auto, 20)).toEqual({ borderKeyTolerance: 20 });
    expect(removalSlider(form({ borderKeyTolerance: 20 }), 'borderKey').auto).toBe(false);
    expect(removalSlider(form({ background: 'threshold' }), 'threshold').auto).toBe(false);
  });

  it('automatic patch restores auto', () => {
    expect(removalAutoPatch).toEqual({ borderKeyTolerance: 'auto' });
  });

  it('threshold: reversed, Mer = lower threshold', () => {
    const s = removalSlider(form({ background: 'threshold', threshold: 200 }), 'threshold');
    expect(s).toMatchObject({ visible: true, field: 'threshold', min: 0, max: 255 });
    expect(s.value).toBe(55);
    expect(removalPatch(s, 255)).toEqual({ threshold: 0 });
    expect(removalPatch(s, 0)).toEqual({ threshold: 255 });
  });

  it('inverted threshold: Mer = higher threshold', () => {
    const s = removalSlider(
      form({ background: 'threshold', threshold: 200, thresholdInvert: true }),
      'threshold',
    );
    expect(s.value).toBe(200);
    expect(removalPatch(s, 210)).toEqual({ threshold: 210 });
  });

  it('hidden when none is chosen and when auto resolves to alpha (with status)', () => {
    expect(removalSlider(form({ background: 'none' }), 'none')).toMatchObject({
      visible: false,
      status: null,
    });
    expect(removalSlider(form({ background: 'alpha' }), 'alpha').visible).toBe(false);
    expect(removalSlider(form(), 'alpha')).toMatchObject({
      visible: false,
      status: 'wizard.bg.status.alpha',
    });
  });

  it('visible with a status when auto resolves to none', () => {
    expect(removalSlider(form(), 'none')).toMatchObject({
      visible: true,
      field: 'borderKeyTolerance',
      status: 'wizard.bg.status.none',
    });
  });

  it('visible without status before a result exists', () => {
    expect(removalSlider(form(), null)).toMatchObject({ visible: true, status: null });
  });
});

describe('size presets (R52.8 in import)', () => {
  it('a preset sets the width and autoSize height', () => {
    const [small] = sizePresets('panel');
    expect(sizePresetPatch(small!)).toEqual({ width: 9, autoSize: 'height' });
  });

  const sz = (width: number, height = 99) => ({ width, height });

  it('the selected preset matches width with autoSize height; else Egen', () => {
    expect(selectedSizePreset('panel', sz(11), 'height', false)).toBe('medium');
    expect(selectedSizePreset('shaped', sz(26), 'height', false)).toBe('large');
    expect(selectedSizePreset('panel', sz(11), null, false)).toBe('custom');
    expect(selectedSizePreset('panel', sz(12), 'height', false)).toBe('custom');
    expect(selectedSizePreset('panel', sz(11), 'width', false)).toBe('custom');
    expect(selectedSizePreset('panel', sz(11), 'height', true)).toBe('custom');
  });

  it('a manual size equal to a preset (e.g. a start-page choice) shows as that preset', () => {
    expect(selectedSizePreset('panel', sz(11, 22), null, false)).toBe('medium');
    expect(selectedSizePreset('shaped', sz(15, 22), null, false)).toBe('small');
    expect(selectedSizePreset('panel', sz(11, 23), null, false)).toBe('custom');
    expect(selectedSizePreset('panel', sz(11, 22), null, true)).toBe('custom');
  });

  it('switching mode keeps the selected preset', () => {
    expect(modeSwitchPatch('panel', sz(11), 'height', false, 'shaped')).toEqual({
      width: 20,
      autoSize: 'height',
    });
    expect(modeSwitchPatch('panel', sz(12), 'height', false, 'shaped')).toEqual({});
  });
});

describe('saved autoSize on Apply', () => {
  const saved = { ...DEFAULT_SETTINGS, autoSize: 'height' as const };
  const start = { source: 'start', choice } as const;

  it('start: keeps the stored autoSize unless the size was changed in the wizard', () => {
    const f = { ...form(), autoSize: null };
    expect(appliedSettings(f, saved, start, false).autoSize).toBe('height');
    expect(appliedSettings(f, saved, start, true).autoSize).toBeNull();
    expect(appliedSettings({ ...f, autoSize: 'width' }, saved, start, true).autoSize).toBe('width');
  });

  it('editor: saves the form autoSize', () => {
    expect(
      appliedSettings({ ...form(), autoSize: null }, saved, { source: 'editor' }, false).autoSize,
    ).toBeNull();
  });
});

describe('preset thumbnail cache', () => {
  it('lists the keys still to compute, in order', () => {
    expect(thumbMisses(['a', 'b', 'c'], { b: 1 })).toEqual(['a', 'c']);
  });

  it('keeps only the current keys', () => {
    expect(retainThumbs({ a: 1, b: 2, x: 3 }, ['a', 'b', 'c'])).toEqual({ a: 1, b: 2 });
  });
});

describe('detail presets (R52.7 in import)', () => {
  it('"Återställ" returns Linjer to the last preset, else the default', () => {
    expect(linesResetValue('detailed')).toBe(0.8);
    expect(linesResetValue(null)).toBe(DEFAULT_SETTINGS.lineSensitivity);
  });

  it('thumbnail key changes with the settings but not with the preset sliders', () => {
    const a = thumbKey({ ...form(), lineSensitivity: 0.1 }, 'x');
    expect(thumbKey({ ...form(), lineSensitivity: 0.9, details: 1 }, 'x')).toBe(a);
    expect(thumbKey({ ...form(), coverage: 0.6 }, 'x')).not.toBe(a);
    expect(thumbKey(form(), 'y')).not.toBe(thumbKey(form(), 'x'));
  });
});

describe('auto-fix report (R53 step 4)', () => {
  const tr = (key: string, p?: Record<string, string | number>) => t('sv', key as never, p);
  const text = (x: { key: string; params?: Record<string, string | number> } | null) =>
    x && tr(x.key, x.params);
  const on = { fixRings: true, despeckle: true, autoPrune: true };

  it('counts with plurals; 0 is "Inga hittades"', () => {
    const r = autoFixReport({ ringsReplaced: 1, despeckledBeads: 3, prunedBeads: 0 }, on, 'shaped');
    expect(text(r.rings)).toBe('1 ring rättad');
    expect(text(r.despeckle)).toBe('3 borttagna');
    expect(text(r.prune)).toBe('Inga hittades');
    const r2 = autoFixReport(
      { ringsReplaced: 2, despeckledBeads: 1, prunedBeads: 0 },
      on,
      'shaped',
    );
    expect(text(r2.rings)).toBe('2 ringar rättade');
    expect(text(r2.despeckle)).toBe('1 borttagen');
    expect(
      text(
        autoFixReport({ ringsReplaced: 0, despeckledBeads: 0, prunedBeads: 0 }, on, 'shaped').rings,
      ),
    ).toBe('Inga hittades');
  });

  it('no report for a switched-off fix, and none for prune on panels', () => {
    const r = autoFixReport(
      { ringsReplaced: 1, despeckledBeads: 3, prunedBeads: 2 },
      { fixRings: false, despeckle: false, autoPrune: false },
      'shaped',
    );
    expect(r).toEqual({ rings: null, despeckle: null, prune: null });
    expect(
      autoFixReport({ ringsReplaced: 0, despeckledBeads: 0, prunedBeads: 0 }, on, 'panel').prune,
    ).toBeNull();
  });
});

describe('picture legend chip', () => {
  const tr = (key: string, p?: Record<string, string | number>) => t('sv', key as never, p);

  it('explains the active highlight; none without one', () => {
    expect(pictureLegend(null, tr, '1,5')).toBeNull();
    expect(pictureLegend('edge', tr, '1,5')).toBe('Rosa = tas bort, blir inga pärlor');
    expect(pictureLegend('details', tr, '1,5')).toContain('Grönt');
    expect(pictureLegend('lines', tr, '1,5')).toContain('1,5');
  });
});

describe('pictureView', () => {
  it('follows the step until the user chooses', () => {
    expect(pictureView('crop', null)).toBe('original');
    expect(pictureView('background', null)).toBe('cutout');
    for (const s of ['colours', 'details', 'done'] as const)
      expect(pictureView(s, null)).toBe('processed');
  });

  it('keeps the user choice on every step', () => {
    for (const s of WIZARD_STEPS) expect(pictureView(s, 'original')).toBe('original');
    expect(pictureView('crop', 'processed')).toBe('processed');
    expect(pictureView('background', 'processed')).toBe('cutout');
    expect(pictureView('colours', 'processed')).toBe('processed');
  });
});

describe('defaultPane', () => {
  it('shows the picture on crop and background, the beads after', () => {
    expect(defaultPane('crop')).toBe('picture');
    expect(defaultPane('background')).toBe('picture');
    for (const s of ['colours', 'details', 'done'] as const) expect(defaultPane(s)).toBe('beads');
  });
});

describe('colourCount', () => {
  it('clamps to the candidates and says when it is limited', () => {
    expect(colourCount(4, 2)).toEqual({ shown: 2, max: 2, limited: true });
    expect(colourCount(4, 41)).toEqual({ shown: 4, max: 8, limited: false });
    expect(colourCount(4, 4)).toEqual({ shown: 4, max: 4, limited: false });
    expect(colourCount(8, 6)).toEqual({ shown: 6, max: 6, limited: true });
  });
});
