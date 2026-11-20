import { untrack } from 'svelte';
import {
  analyse,
  BEAD_TYPES,
  analyseImage,
  createDetailsCache,
  createThinCache,
  cropImage,
  diagramScene,
  lineParams,
  type AnalysisSettings,
  type AnalysisTarget,
  type BeadTypeId,
  type ImageAnalysis,
  type PatternMode,
  type RgbaImage,
  type Rotation,
  type Scene,
} from '../../core';
import type { CropRect } from './crop';
import type { EditorStore } from './editor.svelte';
import { sliderHighlight, type ActiveSlider } from './highlight';
import {
  autoFixReport,
  candidatePalette,
  defaultIncludeExtra,
  importStats,
  mergeImport,
  wizardBase,
  type ImportStats,
} from './import-merge';
import { validTarget, type ImportForm } from './import-settings';
import {
  applyBlock,
  goTo,
  initialSteps,
  initialWizard,
  modeSwitchPatch,
  nextStep,
  pictureView,
  type PictureView,
  type ViewChoice,
  prevStep,
  runSettings,
  appliedSettings,
  selectedSizePreset,
  sizePresetPatch,
  retainThumbs,
  thumbKey,
  type ImportTarget,
  type WizardStep,
} from './import-wizard';
import { checklist, checklistPill } from './checklist';
import { motifSizeMm } from './real-size';
import { proportionalSize } from './proportions';
import { DETAIL_PRESETS, matchingPreset, type DetailPreset, type SizePreset } from './presets';

/** Preview debounce (SPEC §5.5). */
export const DEBOUNCE_MS = 250;
/** Idle time before the lines highlight's skeletons are warmed (R39). */
export const IDLE_MS = 600;

/** Last preview: analysis, merged pattern, its scene and stats, for crop/orientation `key`. */
export interface WizardResult {
  readonly a: ImageAnalysis;
  readonly scene: Scene;
  readonly stats: ImportStats;
  readonly key: string;
}

/**
 * Reactive state of the "Mönster från bild" wizard (SPEC R53): a thin runes wrapper over the
 * pure `import-wizard`, `import-settings` and `import-merge` modules. Effects (debounced preview,
 * warm-up) are run by `ImportView`.
 */
export class ImportWizard {
  readonly editor: EditorStore;
  readonly img: RgbaImage;
  readonly target: ImportTarget;
  readonly fileName: string;
  readonly #saved: AnalysisSettings;
  readonly thinCache = createThinCache();
  readonly detailsCache = createDetailsCache();
  readonly highlighter = sliderHighlight((s) => (this.activeSlider = s));

  steps = $state(initialSteps());
  form = $state<ImportForm>() as ImportForm;
  beadType = $state<BeadTypeId>('delica11');
  mode = $state<PatternMode>('panel');
  width = $state(11);
  height = $state(22);
  includeExtra = $state(false);
  detail = $state<Record<string, boolean>>({});
  crop = $state<CropRect | null>(null);
  /** The Original / Processed toggle, `null` until touched (the view then follows the step). */
  viewChoice = $state<ViewChoice>(null);
  customSize = $state(false);
  activeSlider = $state<ActiveSlider | null>(null);
  working = $state(true);
  failed = $state(false);
  result = $state.raw<WizardResult | null>(null);
  /** Detail preset chosen last ("Återställ" target, R52.7). */
  lastPreset = $state<DetailPreset['id'] | null>(null);
  /** Preset thumbnails (or `'failed'`) by {@link thumbKey}, current settings only. */
  thumbs = $state.raw<Record<string, Scene | 'failed'>>({});
  /** The user changed the size in the wizard (preset, Auto or fields): `autoSize` is saved. */
  sizeChanged = false;

  /** Pattern merged into: the current one, or a new pattern of the start-page choice. */
  base = $derived.by(() => wizardBase(this.target, this.editor.pattern));
  size = $derived.by(() =>
    this.form.autoSize === null
      ? { width: this.width, height: this.height }
      : proportionalSize({
          imgW: this.crop?.width ?? this.img.width,
          imgH: this.crop?.height ?? this.img.height,
          rotation: this.form.rotation,
          beadType: this.beadType,
          ...(this.form.autoSize === 'height' ? { width: this.width } : { height: this.height }),
        }),
  );
  lattice = $derived<AnalysisTarget>({
    beadType: this.beadType,
    mode: this.mode,
    width: this.size.width,
    height: this.size.height,
  });
  valid = $derived(validTarget(this.lattice));
  settings = $derived.by(() =>
    runSettings(this.form, this.#saved, this.target, this.base, this.mode),
  );
  palette = $derived.by(() =>
    candidatePalette(this.base, {
      includeExtra: this.includeExtra,
      library: this.editor.library,
      detail: this.detail,
    }),
  );
  line = $derived(lineParams(this.form.lineSensitivity));
  /** Crop and orientation the processed picture is valid for. */
  key = $derived(JSON.stringify([this.crop, this.form.rotation, this.form.flipH]));
  view = $derived<PictureView>(pictureView(this.steps.step, this.viewChoice));
  processed = $derived(
    this.view !== 'original' && this.result?.a.debug && this.result.key === this.key
      ? {
          debug: this.result.a.debug,
          highlight: this.activeSlider,
          view: this.view,
        }
      : null,
  );
  merged = $derived(this.result && mergeImport(this.base, this.result.a, this.lattice));
  mergedAnalysis = $derived(this.merged && analyse(this.merged));
  checklist = $derived(
    this.merged && this.mergedAnalysis ? checklist(this.merged, this.mergedAnalysis) : [],
  );
  pill = $derived(checklistPill(this.checklist));
  motifMm = $derived(
    this.merged && this.mergedAnalysis
      ? motifSizeMm(this.merged, this.mergedAnalysis)
      : {
          width: this.size.width * BEAD_TYPES[this.beadType].widthMm,
          height: this.size.height * BEAD_TYPES[this.beadType].rowPitchMm,
        },
  );
  empty = $derived(this.result?.stats.beads === 0);
  block = $derived(
    applyBlock({
      valid: this.valid,
      working: this.working || (!this.result && !this.failed),
      failed: this.failed,
      empty: this.empty,
    }),
  );
  sizePreset = $derived(
    selectedSizePreset(this.mode, this.size, this.form.autoSize, this.customSize),
  );
  report = $derived(
    this.result &&
      autoFixReport(
        this.result.a.stats,
        {
          fixRings: this.form.fixRings,
          despeckle: this.form.despeckle,
          autoPrune: this.form.autoPrune,
        },
        this.mode,
      ),
  );

  /** Initial values from `target` and the editor's saved analysis settings. */
  constructor(editor: EditorStore, img: RgbaImage, target: ImportTarget, fileName: string) {
    this.editor = editor;
    this.img = img;
    this.target = target;
    this.fileName = fileName;
    this.#saved = untrack(() => editor.settings.analysis);
    const init = initialWizard(
      target,
      untrack(() => editor.pattern),
      this.#saved,
    );
    this.form = init.form;
    this.beadType = init.beadType;
    this.mode = init.mode;
    this.width = init.width;
    this.height = init.height;
    this.lastPreset = matchingPreset(DETAIL_PRESETS, init.form);
    this.includeExtra = defaultIncludeExtra(untrack(() => wizardBase(target, editor.pattern)));
  }

  /** Detail preset equal to the form (none after a manual change). */
  detailPreset = $derived(matchingPreset(DETAIL_PRESETS, this.form));
  #thumbContext = $derived(
    JSON.stringify([
      this.lattice,
      this.palette.map((e) => [e.id, e.hex, e.detail === true]),
      this.crop,
      this.settings.panelBackground,
    ]),
  );

  /** Selects a detail preset (Linjer and Små detaljer). */
  applyPreset(p: DetailPreset): void {
    this.lastPreset = p.id;
    this.set({ lineSensitivity: p.lineSensitivity, details: p.details });
  }

  /** Thumbnail cache keys of the detail presets for the current settings, in preset order. */
  thumbKeys = $derived.by(() =>
    DETAIL_PRESETS.map((p) => thumbKey(this.form, `${p.id}|${this.#thumbContext}`)),
  );

  /**
   * Computes the thumbnail of the preset with cache key `key` (bead shapes only) into
   * {@link thumbs}; a failed analysis is stored as `'failed'`.
   */
  computeThumb(key: string): void {
    const i = this.thumbKeys.indexOf(key);
    const p = DETAIL_PRESETS[i];
    if (!p || key in this.thumbs) return;
    let entry: Scene | 'failed';
    try {
      const a = this.analyseWith({ lineSensitivity: p.lineSensitivity, details: p.details });
      const pattern = mergeImport(this.base, a, this.lattice);
      entry = diagramScene(pattern, analyse(pattern), {});
    } catch {
      entry = 'failed';
    }
    this.thumbs = { ...this.thumbs, [key]: entry };
  }

  /** Drops cached thumbnails of other settings than the current ones. */
  pruneThumbs(): void {
    this.thumbs = retainThumbs(this.thumbs, this.thumbKeys);
  }

  /** Merges `patch` into the form. */
  set(patch: Partial<ImportForm>): void {
    this.form = { ...this.form, ...patch };
  }

  #dragging: ActiveSlider | null = null;

  /** Slider handlers for the live highlight (R39): pointer drag until release, or a keyboard change. */
  track(s: ActiveSlider): {
    onpointerdown: () => void;
    oninput: () => void;
    onlostpointercapture: () => void;
  } {
    return {
      onpointerdown: () => {
        this.#dragging = s;
        this.highlighter.press(s);
      },
      oninput: () => {
        if (this.#dragging !== s) this.highlighter.pulse(s);
      },
      onlostpointercapture: this.releaseSlider,
    };
  }

  /** Releases a dragged slider (pointer up/cancel anywhere, window blur). */
  readonly releaseSlider = (): void => {
    if (this.#dragging) this.highlighter.release(this.#dragging);
    this.#dragging = null;
  };

  /** Goes to `step`. */
  go(step: WizardStep): void {
    this.steps = goTo(this.steps, step);
  }

  next(): void {
    this.steps = nextStep(this.steps);
  }

  prev(): void {
    this.steps = prevStep(this.steps);
  }

  /** Rotates the source a quarter turn (R31). */
  rotate(deg: 90 | -90): void {
    this.set({ rotation: ((this.form.rotation + deg + 360) % 360) as Rotation });
  }

  /** Switches the mode, keeping a selected size preset. */
  setMode(mode: PatternMode): void {
    const p = modeSwitchPatch(this.mode, this.size, this.form.autoSize, this.customSize, mode);
    this.mode = mode;
    if (p.width !== undefined) this.width = p.width;
    if (p.height !== undefined) this.height = p.height;
  }

  /** Selects a size preset (width, automatic height). */
  setSizePreset(p: SizePreset): void {
    const s = sizePresetPatch(p);
    this.customSize = false;
    this.sizeChanged = true;
    this.width = s.width;
    this.set({ autoSize: s.autoSize });
  }

  /** Turns the automatic side on or off; off keeps the shown value as a manual size (R34). */
  setAuto(side: 'width' | 'height', on: boolean): void {
    if (!on) ({ width: this.width, height: this.height } = this.size);
    this.customSize = true;
    this.sizeChanged = true;
    this.set({ autoSize: on ? side : null });
  }

  /** Sets one side from the "Egen" fields. */
  setSide(side: 'width' | 'height', n: number): void {
    this.customSize = true;
    this.sizeChanged = true;
    this[side] = n;
  }

  /** Runs the analysis for the current settings (debounced by the caller). */
  compute(): void {
    const t0 = performance.now();
    try {
      const key = this.key;
      const a = analyseImage(
        this.crop ? cropImage(this.img, this.crop) : this.img,
        this.lattice,
        this.palette,
        this.settings,
        {
          ringCandidates: this.editor.ringSearch,
          debug: true,
          thinCache: this.thinCache,
          detailsCache: this.detailsCache,
        },
      );
      const ms = performance.now() - t0;
      const pattern = mergeImport(this.base, a, this.lattice);
      const scene = diagramScene(pattern, analyse(pattern), {
        ladder: true,
        slots: this.mode === 'shaped',
      });
      this.result = { a, scene, stats: importStats(a, ms), key };
      this.failed = false;
      if (ms > DEBOUNCE_MS) console.warn(`import preview took ${Math.round(ms)} ms`);
    } catch {
      this.result = null;
      this.failed = true;
    }
    this.working = false;
  }

  /** Analysis of the current settings with other `lineSensitivity`/`details` (preset thumbnails). */
  analyseWith(patch: Partial<ImportForm>): ImageAnalysis {
    return analyseImage(
      this.crop ? cropImage(this.img, this.crop) : this.img,
      this.lattice,
      this.palette,
      runSettings({ ...this.form, ...patch }, this.#saved, this.target, this.base, this.mode),
      { ringCandidates: this.editor.ringSearch },
    );
  }

  /**
   * Applies the result (one undo step) and saves the settings (R33): into the current pattern,
   * or as a new pattern of the start-page choice. Returns `false` when blocked.
   */
  apply(): boolean {
    const r = this.result;
    if (!r || this.block) return false;
    this.editor.setAnalysis(appliedSettings(this.form, this.#saved, this.target, this.sizeChanged));
    if (this.target.source === 'start')
      this.editor.newFromImport({ ...this.target.choice, ...this.lattice }, r.a, this.lattice);
    else this.editor.applyImport(r.a, this.lattice);
    return true;
  }
}
