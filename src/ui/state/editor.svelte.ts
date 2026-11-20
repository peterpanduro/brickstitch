import {
  analyse,
  createAutosave,
  DEFAULT_SETTINGS,
  diagramScene,
  removePaletteEntry,
  t,
  updatePaletteEntry,
  type AnalysisSettings,
  type AnalysisTarget,
  type ColorId,
  type Coord,
  type ImageAnalysis,
  type KeyValueStore,
  type Locale,
  type MessageKey,
  type PaletteEntry,
  type Params,
  type Pattern,
  type PluralKey,
  type RingCandidate,
  type RingSearchParams,
  type Scene,
  type WarningCode,
} from '../../core';
import { createAutosaveController, type AutosaveController, type SaveStatus } from './autosave';
import { checklist, type ChecklistItem } from './checklist';
import * as ed from './editor';
import { errorKey } from './errors';
import { patternFile } from './file';
import { canRedo, canUndo } from './history';
import { isStarter, starterPattern as starter, type NewPatternChoice } from './new-pattern';
import { loadLibrary, saveLibrary, upsertLibrary, type ColorSpec } from './palette';
import {
  addColorAndSelect,
  cycleWarning,
  emptyCycle,
  isDirty,
  newNeedsConfirm,
  applyImport,
  consumeShowWarningRequest,
  hasRealPattern,
  newFromImport,
  openText,
  startNewPattern,
  type Focus,
  type ShowWarningRequest,
} from './session';
import { motifSizeMm, type SizeMm } from './real-size';
import {
  initRingTool,
  memoRingSearch,
  placeRingEdit,
  resnapAnchor,
  ringAnchor,
  ringCentred,
  ringSearchParams,
  ringSelectedIndex,
  type RingToolState,
} from './ring';
import { loadSettings, saveSettings, type Settings, type Theme, type Zoom } from './settings';

/** localStorage key of the autosaved pattern (SPEC §9). */
export const AUTOSAVE_KEY = 'bs:v1:autosave';
const APP_VERSION = '0.1.0';

/** Non-blocking messages shown above the canvas, as message keys of the error detail. */
export interface Banners {
  readonly loadError: MessageKey | null;
  readonly saveError: MessageKey | null;
  readonly openError: MessageKey | null;
}

/** Effects injected into {@link EditorStore}. */
export interface EditorDeps {
  readonly store: KeyValueStore;
  readonly setTimer: (fn: () => void, ms: number) => unknown;
  readonly clearTimer: (id: unknown) => void;
  readonly defaultLocale: Locale;
}

/** Reactive editor: thin wrapper over the pure state modules plus persistence. */
export class EditorStore {
  #s = $state.raw<ed.EditorState>(ed.createEditor(starter()));
  #saved = $state.raw<Pattern | null>(null);
  #autosave: AutosaveController;
  #deps: EditorDeps;
  #cycle = emptyCycle();
  #lastScene: Scene | undefined;
  #ringSearch = memoRingSearch();
  settings = $state.raw<Settings>({
    locale: 'sv',
    zoom: 'fit',
    realSize: false,
    analysis: DEFAULT_SETTINGS,
    analysisApplied: false,
    theme: 'system',
  });
  library = $state.raw<PaletteEntry[]>([]);
  banners = $state.raw<Banners>({ loadError: null, saveError: null, openError: null });
  focus = $state.raw<Focus | null>(null);
  /** Ring tool options (SPEC R36). */
  ring = $state.raw<RingToolState>(initRingTool(starter()));
  /** Beads of the last ring placement that fell off the canvas; `0` hides the banner. */
  ringClipped = $state(0);
  /** Live-region text after a placement ("Ring placed (N beads)"). */
  ringStatus = $state('');
  /** Increments when the pattern is replaced by New or Open (not on edits). */
  patternEpoch = $state(0);
  /** `true` when nothing was stored, i.e. the first visit. */
  readonly firstRun: boolean;
  /** Autosave state for the top-bar save pill (SPEC R50). */
  saveStatus = $state<SaveStatus>('saved');
  #restored = false;
  #touched = $state(false);
  #showWarning = $state<ShowWarningRequest>(null);

  locale = $derived(this.settings.locale);
  /** Colour theme choice (SPEC R45). */
  theme = $derived<Theme>(this.settings.theme);
  pattern = $derived(ed.current(this.#s));
  tool = $derived(this.#s.tool);
  color = $derived(this.#s.color);
  stroking = $derived(this.#s.stroke !== null);
  canUndo = $derived(canUndo(this.#s.history));
  canRedo = $derived(canRedo(this.#s.history));
  dirty = $derived(isDirty(this.#saved, this.pattern));
  newNeedsConfirm = $derived(
    newNeedsConfirm({ dirty: this.dirty, loadError: this.banners.loadError !== null }),
  );
  analysis = $derived(analyse(this.pattern, ed.pinnedLadder(this.#s)));
  /** "Går det att sy?" items of the current pattern (SPEC R48). */
  checklist = $derived<ChecklistItem[]>(checklist(this.pattern, this.analysis));
  /** Motif size in mm (instructions size, canvas size when empty; SPEC R46). */
  motifSizeMm = $derived<SizeMm>(motifSizeMm(this.pattern, this.analysis));
  /** Restored, or edited/opened/created this session (SPEC R55 "Fortsätt med"). */
  hasRealPattern = $derived(
    hasRealPattern({
      restored: this.#restored,
      loadError: this.banners.loadError !== null,
      touched: this.#touched,
    }),
  );
  ringCandidates = $derived(this.#ringSearch(ringSearchParams(this.pattern, this.ring)));
  /** Memoised ring search shared by the Ring tool and the import's `fixRings` (R37). */
  readonly ringSearch = (p: RingSearchParams): readonly RingCandidate[] => this.#ringSearch(p);
  ringSelected = $derived(ringSelectedIndex(this.ring, this.ringCandidates.length));
  ringCandidate = $derived<RingCandidate | null>(this.ringCandidates[this.ringSelected] ?? null);
  ringCentred = $derived(ringCentred(this.pattern, this.ring));
  scene = $derived.by(() => {
    const opts = {
      rowNumbers: true,
      counts: true,
      ladder: true,
      loop: true,
      warnings: true,
      slots: this.pattern.mode === 'shaped',
    };
    return (this.#lastScene = diagramScene(this.pattern, this.analysis, opts, this.#lastScene));
  });

  /** Restores settings, library and the autosaved pattern (blocking writes if it is unreadable). */
  constructor(deps: EditorDeps) {
    this.#deps = deps;
    this.settings = loadSettings(deps.store, deps.defaultLocale);
    this.library = loadLibrary(deps.store);
    this.#autosave = createAutosaveController({
      autosave: createAutosave(deps.store, AUTOSAVE_KEY, APP_VERSION),
      setTimer: deps.setTimer,
      clearTimer: deps.clearTimer,
      onError: (e) => this.#banner('saveError', e),
      onSaved: () => this.banners.saveError && this.#banner('saveError', null),
      onStatus: (status) => (this.saveStatus = status),
    });
    const restored = this.#autosave.restore();
    if (restored.pattern) this.#s = ed.createEditor(restored.pattern);
    this.#restored = restored.pattern !== undefined && !isStarter(restored.pattern);
    this.ring = initRingTool(this.pattern);
    if (restored.error) this.#banner('loadError', restored.error);
    this.firstRun = !restored.pattern && !restored.error;
    this.#saved = this.firstRun ? this.pattern : null;
  }

  /** Localised message in the current locale. */
  t = (key: MessageKey | PluralKey, params?: Params): string => t(this.locale, key, params);

  #banner(k: keyof Banners, code: string | null): void {
    this.banners = { ...this.banners, [k]: code === null ? null : errorKey(code) };
  }

  #set(s: ed.EditorState): void {
    if (s === this.#s) return;
    if (ed.current(s) !== ed.current(this.#s)) this.#touched = true;
    this.#s = s;
  }

  #edit(f: (p: Pattern) => Pattern): void {
    this.#set(ed.applyEdit(this.#s, f));
  }

  #saveSettings(s: Partial<Settings>): void {
    this.settings = { ...this.settings, ...s };
    saveSettings(this.#deps.store, this.settings);
  }

  /** Schedules an autosave of `p` (call from an effect on {@link pattern}). */
  autosave(p: Pattern): void {
    this.#autosave.schedule(p);
  }

  /** Writes any pending autosave now. */
  flush(): void {
    this.#autosave.flush();
  }

  /** Dismisses a banner. */
  dismiss(k: keyof Banners): void {
    this.#banner(k, null);
  }

  /** Allows autosave to overwrite unreadable stored data (explicit user action). */
  discardStored(): void {
    this.#autosave.unblock();
    this.#banner('loadError', null);
    this.#autosave.schedule(this.pattern);
  }

  setLocale(locale: Locale): void {
    this.#saveSettings({ locale });
  }

  /** Saves and applies the colour theme (SPEC R45). */
  setTheme(theme: Theme): void {
    this.#saveSettings({ theme });
  }

  setView(zoom: Zoom, realSize: boolean): void {
    this.#saveSettings({ zoom, realSize });
  }

  /** Remembers the image-import settings. */
  setAnalysis(analysis: AnalysisSettings): void {
    this.#saveSettings({ analysis, analysisApplied: true });
  }

  /** Applies an image analysis as one undo step (marks the pattern unsaved). */
  applyImport(a: ImageAnalysis, target: AnalysisTarget): void {
    this.#set(applyImport(this.#s, a, target));
  }

  /**
   * New pattern from an image chosen on the start page (SPEC R53): `choice` plus the analysis
   * as one undo step; marked saved, ring options and `patternEpoch` reset like New.
   */
  newFromImport(c: NewPatternChoice, a: ImageAnalysis, target: AnalysisTarget): void {
    this.#set(newFromImport(this.#s, c, a, target));
    this.#saved = this.pattern;
    this.#replaced();
    this.discardStored();
  }

  /** Shows the open/import error banner for `code`. */
  openFailed(code: string): void {
    this.#banner('openError', code);
  }

  /** Replaces the pattern with a new blank one (one undo step); call after confirmation. */
  newPattern(c: NewPatternChoice): void {
    this.#set(startNewPattern(this.#s, c));
    this.#saved = this.pattern;
    this.#replaced();
    this.discardStored();
  }

  /** Opens `.brickstitch.json` text as one undo step; shows a banner on failure. */
  open(text: string): void {
    const r = openText(this.#s, text);
    this.#banner('openError', r.error);
    if (r.error) return;
    this.#set(r.state);
    this.#saved = this.pattern;
    this.#replaced();
  }

  #replaced(): void {
    this.ring = initRingTool(this.pattern);
    this.ringClipped = 0;
    this.patternEpoch++;
  }

  /** Serialises the pattern for download and marks it saved. */
  saveFile(): { name: string; text: string } {
    this.#saved = this.pattern;
    return patternFile(this.pattern, APP_VERSION);
  }

  /** Converts a panel to a free shape (one undo step). */
  convertToShaped(): void {
    this.#set(ed.convertToShaped(this.#s));
  }

  setTitle(title: string): void {
    this.#edit((p) => (p.title === title ? p : { ...p, title }));
  }

  setTool(tool: ed.Tool): void {
    this.#set(ed.setTool(this.#s, tool));
    this.ringClipped = 0;
  }

  setColor(color: ColorId): void {
    this.#set({ ...this.#s, color });
  }

  selectColorIndex(n: number): void {
    this.#set(ed.selectColorIndex(this.#s, n));
  }

  undo(): void {
    this.#set(ed.undoEdit(this.#s));
    this.ringClipped = 0;
  }

  redo(): void {
    this.#set(ed.redoEdit(this.#s));
    this.ringClipped = 0;
  }

  down(c: Coord): void {
    this.#set(ed.pointerDown(this.#s, c));
  }

  /** Continues the stroke over several cells in one state update. */
  move(cells: readonly Coord[]): void {
    this.#set(cells.reduce(ed.pointerMove, this.#s));
  }

  up(): void {
    this.#set(ed.pointerUp(this.#s));
  }

  /** Aborts the stroke in progress without an undo step (second finger, R51). */
  cancelStroke(): void {
    this.#set(ed.cancelStroke(this.#s));
  }

  setLadder(r: number): void {
    this.#edit((p) => ed.setManualLadder(p, r));
  }

  autoLadder(): void {
    this.#edit(ed.autoLadder);
  }

  removeUnsupported(): void {
    this.#edit(ed.removeUnsupported);
    this.focus = null;
  }

  /** Focuses the next warning of `code`. */
  cycleWarning(code: WarningCode): void {
    const r = cycleWarning(this.#cycle, this.analysis.warnings, code);
    this.#cycle = r.cycle;
    this.focus = r.focus;
  }

  /** Pending "Visa" request for the Canvas (SPEC R48); `null` when none. */
  get showWarningPending(): ShowWarningRequest {
    return this.#showWarning;
  }

  /** Asks the Canvas to run "Visa" for `code` once it has mounted and measured. */
  requestShowWarning(code: WarningCode): void {
    this.#showWarning = code;
  }

  /** Runs and clears a pending "Visa" request (call from the mounted Canvas); returns its code. */
  consumeShowWarning(): WarningCode | null {
    const r = consumeShowWarningRequest(this.#showWarning);
    this.#showWarning = r.next;
    if (r.code) this.cycleWarning(r.code);
    return r.code;
  }

  addColor(spec: ColorSpec): void {
    this.#set(addColorAndSelect(this.#s, spec));
  }

  /** Edits a palette entry and remembers it in the user library. */
  updateColor(id: ColorId, changes: Partial<Omit<PaletteEntry, 'id'>>): void {
    this.#edit((p) => updatePaletteEntry(p, id, changes));
    const e = this.pattern.palette.find((x) => x.id === id);
    if (!e) return;
    this.library = upsertLibrary(this.library, e);
    const r = saveLibrary(this.#deps.store, this.library);
    if (!r.ok) this.#banner('saveError', r.error);
  }

  /** Updates the ring tool options. */
  setRing(f: (s: RingToolState) => RingToolState): void {
    this.ring = f(this.ring);
  }

  /** Anchor of the selected ring for the pointer at lattice-local mm; `null` without a ring. */
  ringAnchor(xMm: number, yMm: number): Coord | null {
    const c = this.ringCandidate;
    return c ? ringAnchor(this.pattern, this.ring, c, xMm, yMm) : null;
  }

  /** `a` snapped to the middle column when centring (see `resnapAnchor`). */
  resnapRing(a: Coord): Coord {
    const c = this.ringCandidate;
    return c ? resnapAnchor(this.pattern, this.ring, c, a) : a;
  }

  /** Places the selected ring at `anchor` as one undo step; remembers clipped beads. */
  placeRing(anchor: Coord): void {
    const c = this.ringCandidate;
    if (!c) return;
    const r = placeRingEdit(this.#s, c, anchor);
    this.#set(r.state);
    this.ringClipped = r.clipped;
    if (r.placed > 0) this.ringStatus = t(this.locale, 'ui.ringPlaced', { n: r.placed });
  }

  removeColor(id: ColorId, replacement?: ColorId): void {
    this.#edit((p) => removePaletteEntry(p, id, replacement));
  }
}
