# Redesign – implementation plan

Status: all phases (P1a–P7) are implemented; the shipped app is rendered in `png/after-*.png`. The mockups (`png/01…05b`, `html/*`) and before-captures were removed after implementation; they remain in git history up to commit 76481da.

Spec: `docs/SPEC.md` R43–R57 (all R52 items resolved 2026-11-19). Mockups: `docs/redesign/png/*`; "matches png/X" always means "minus the R43 out-of-scope items". Each phase is one mergeable chunk: `npm run check`, `npm run lint`, `npm test` and `npm run e2e` green; the SPEC R-item it implements updated for any correction. TDD: the listed tests are written first (red); pure logic in `src/ui/state/*.ts`; components stay thin.

## Order and parallelism

```
P1a tokens/fonts ─ P1b shell/routing ─┬─ P2a rail + palette ───────┐
                                      ├─ P2b checklist UI + canvas ┤
                                      ├─ P3 import wizard ─────────┼─ P6 touch/responsive ─ P7 e2e, docs, polish
                                      ├─ P4 print page ────────────┤
                                      └─ P5 start page ────────────┘
```

Group 1 (serial): P1a, then P1b. Group 2 (parallel): P2a, P2b, P3, P4, P5 — none depends on another; everything they share is created by P1b. Group 3 (serial): P6 (edits `Canvas.svelte` pointer code and every view's responsive CSS), then P7.

Shared-file rules for group 2:
- `src/ui/App.svelte`: final after P1b; nobody in group 2 edits it.
- `src/ui/views/EditorView.svelte`: P1b creates it with named regions (rail, palette, checklist, size tiles) and canvas overlay slots (tool card, real-size pair, zoom bar, toasts), one import line each. P2a replaces only the rail, palette and tool-card lines; P2b only the checklist, size-tiles and zoom-bar lines.
- `src/ui/state/editor.svelte.ts`: P1b adds every API group 2 needs (`saveStatus`, `theme`/`setTheme`, `newFromImport`, `requestShowWarning`/`consumeShowWarning`, `hasRealPattern`, `motifSizeMm`); group 2 does not edit it.
- `src/core/i18n/messages.{sv,en}.ts`: P1b adds one marker comment per prefix (`shell`, `theme`, `rail`, `palette`, `check`, `size`, `start`, `wizard`, `print`, `dock`); each phase adds keys only under its own marker and deletes only keys its own changes made unused.
- `CLAUDE.md` and `e2e/smoke.spec.ts`: touched only in P1b (smoke switched to `data-testid` hooks, R57) and P7. Each phase may add its own `e2e/<phase>.spec.ts`.
- `docs/SPEC.md`: each phase edits only the R-item(s) it implements.

What P1b delivered (group 2 builds on it; see SPEC R44 for the view contract):
- P1b owns the `check.*` keys the checklist logic uses and `size.realSize`, `size.mm`, `size.tooBig`, `size.showRealSize`, `size.preset.*`; P2b adds only its UI keys under those markers. Detail-preset labels are P3's (`wizard.*`).
- `src/ui/state/import-wizard.ts` exists with the `ImportTarget` type only; P3 extends this file.
- `components/ToolRail.svelte` exists (minimal: today's tools, icons, no roving); P2a rewrites it in place.
- `EditorStore` also has `checklist` (= `checklist(pattern, analysis)`), `motifSizeMm`, `showWarningPending`; `consumeShowWarning()` runs `cycleWarning` itself.
- `ViewNav` (`go`, `leave(to?)`, `openImage(file, target)`) is every view's only navigation; views own Escape; each view root has `data-view` and one `h1 tabindex="-1"`.
- Toasts (`BannerList`) render only in `EditorView`; P3 and P5 render `BannerList` themselves where their errors must show (e.g. open/decode errors on the start page).
- `StartView` receives `bind:start` (`StartState` from `state/new-pattern.ts`, kept by App for the session) and must export `drop(file)`.
- P3: for `target.source === 'start'` Apply calls `editor.newFromImport(choice, analysis, target)`, then `nav.leave()`; cancelling leaves with `nav.leave('new')` (to the editor for `source: 'editor'`).
- P3, P4 and P5 replace the stub views and must not use modal dialogs (the stubs wrap today's modal dialogs only as a bridge).

## P1a – Tokens, fonts, icons (done)

Files: `package.json` + lock (`@fontsource-variable/inter@5.3.0`, `@fontsource-variable/fraunces@5.3.0`), `src/ui/fonts.css` (new), `src/ui/app.css` (R45 tokens light/dark incl. `data-theme` selectors; `.btn`, `.card`, `.seg`, `.pill`, `.float`, `.check`, `.radio`, `.switch`, sliders, focus ring; aliases for the old variable names), `src/ui/main.ts`, `index.html` (`color-scheme`), `src/ui/icons.ts` + `src/ui/components/Icon.svelte` (new).

Tests first:
- `tests/ui/tokens.test.ts`: parses `app.css`; every light token has a dark value in both dark blocks (`[data-theme="dark"]` and the media query); contrast ≥ 4.5 for ink/muted on bg, surface, surface-2; accent-ink on accent; warn/ok/danger on their soft; ink on ladder; ≥ 3 for line-strong on surface and surface-2; both themes.
- `tests/ui/icons.test.ts`: every icon name used by R46–R55 (`check`, `alert`, `start`, `chevron`, `ruler`, tools, undo/redo, …) exists.

Acceptance: the app looks as before but in the new palette and fonts (aliases); Inter/Fraunces load with the network offline after the first load and no request leaves the origin; forcing `data-theme="dark"` in DevTools shows the dark tokens.

## P1b – Shell, routing, theme, shared state (done)

Files: `src/ui/App.svelte` (final: view switch, drop overlay, global keys), `src/ui/views/EditorView.svelte` (grid + overlay slots hosting today's PalettePanel, Canvas, RingPanel, WarningsBar, tool buttons), `src/ui/views/{Start,Import,Print}View.svelte` (stubs wrapping today's NewPatternDialog / ImportDialog / ExportPdfDialog full screen), `src/ui/components/TopBar.svelte` + `FileMenu.svelte` (new; `Toolbar.svelte` deleted), `BannerList.svelte` (toast slot), `src/ui/components/RealSizePair.svelte` (minimal: pair/single/none at real size, no collapse), `src/ui/state/route.ts`, `src/ui/state/autosave.ts` (status), `src/ui/state/settings.ts` (theme, v3 migration), `src/ui/state/checklist.ts`, `src/ui/state/real-size.ts`, `src/ui/state/presets.ts`, `src/ui/state/session.ts` (`newFromImport`), `src/ui/state/editor.svelte.ts` (APIs above), i18n markers + `shell.*` + `theme.*`, `e2e/smoke.spec.ts` (switch to `data-testid` hooks), `CLAUDE.md` (layout: `views/`, new state modules).

Tests first:
- `tests/ui/route.test.ts`: hash ↔ route; guards incl. reload (`#/import` without image → replace to editor; `#/print` empty → replace; reloaded `#/print` with pattern stays); first run → `#/new`; `leaveAction` → `back` when entered from the editor this session, else `replace`.
- `tests/ui/autosave.test.ts` (extend): `pending`/`saved`/`error`/`blocked`, `onStatus` once per change.
- `tests/ui/settings.test.ts` (extend): theme round trip; v1 and v2 stores load `system`; invalid → `system`; `fit: contain → auto` runs for unversioned only, not for v2; saves `settingsVersion: 3`.
- `tests/ui/checklist.test.ts`: one case per R48 table row (titles, params, first row R6-numbered; "Ta bort" only on shaped; "Välj åt mig" on manual / invalid manual); pill count excludes `segments`; empty pattern; plurals.
- `tests/ui/real-size.test.ts`: `pairLayout` pair/single/none at the box edges (liten 17.6 × 28.6 mm → pair; 80 × 120 delica11 → none).
- `tests/ui/presets.test.ts`: size presets per mode (Mellan = `defaultSize`); detail presets; `matchingPreset`.
- `tests/ui/session.test.ts` (extend): `newFromImport` = one undo step back to the previous pattern, palette from the choice, panel background = Grundfärg.
- `tests/ui/session.test.ts` (extend): pure helpers behind the store APIs — `showWarningRequest` is consumed once; `hasRealPattern({ restored, loadError, touched })` false for the untouched starter and after a load error, true after restore/edit/open/new.

Acceptance: top bar matches `png/01-editor.png` (logo, title + pencil, save pill, Ångra/Gör om, Arkiv with Utseende, Från bild, Skriv ut mönster, SV/EN); theme choice switches instantly and persists across reload; browser back from `#/print` returns to the editor and a reload of `#/import` lands in the editor; every existing feature still works through the stub views; smoke green on the new hooks.

## P2a – Tool rail, tool card, palette, colour picker (done)

Files: `components/ToolRail.svelte`, `components/ToolCard.svelte` (new; hosts the `RingPanel` content incl. its colour `<select>`), `RingPanel.svelte` (restyle only), `PalettePanel.svelte`, `PaletteEntryEditor.svelte` (popover), `ColorPicker.svelte` (grid + chips), `src/ui/state/colour-family.ts` (new), `src/ui/state/palette.ts` (row labels, family filter), `views/EditorView.svelte` (rail, palette, tool-card lines), i18n `rail.*`, `palette.*`, `e2e/rail.spec.ts`.

Tests first:
- `tests/ui/colour-family.test.ts`: every catalogue colour gets exactly one family; DB-200, DB-010, DB-1139 → white/grey; DB-723 → red, DB-726 → blue, DB-724 → green, DB-734 → brown; deterministic.
- `tests/ui/palette.test.ts` (extend): `paletteRowLabels(entry, locale)` name first, DB second, user name overrides seed, no duplicate when only DB; per-pair counts; `colorChoices` with family filter + query ("röd", "723").

Acceptance: matches `png/01-editor.png` rail (Måla, Sudda on shaped only, Fyll, Plocka färg, Ring; no badges) and palette (name, DB, per-pair count, key badge, selected style, "Lägg till färg"); matches `png/01b-editor-colour-picker.png` (search, chips without "Metall", swatch grid, detail row, Lägg till); Ring tool works unchanged inside the tool card (R36 keyboard, colour select, candidates).

## P2b – Checklist UI, size tiles, zoom, canvas restyle, start-row marker (done)

Files: `components/Checklist.svelte` (new; `WarningsBar.svelte` deleted), `components/SizeTiles.svelte`, `components/ZoomBar.svelte`, `RealSizePair.svelte` (collapse, editor card styling), `src/ui/state/zoom.ts` (new; `zoomBy` moves here), `src/ui/state/warnings.ts` (fold into checklist if unused), `components/Canvas.svelte` (sheet, start pill, gloss beads, dark classes, "Ändra" focus, consumes `requestShowWarning`; status bar removed), `src/core/scene/elements.ts` (+`class`), `views/EditorView.svelte` (checklist, size-tiles, zoom-bar lines), i18n `check.*`, `size.*`, `e2e/checklist.spec.ts`.

Tests first:
- `tests/ui/zoom.test.ts`: `zoomPercent` = 100 with `realSize`, `round(scale / (96/25.4) · 100)` otherwise, `fit` uses the passed fit scale; `zoomBy` clamps 1–80, starts from the effective scale and turns `realSize` off; "Visa allt" → fit, not real size.
- `tests/scene.test.ts` (extend): `shapeElements` adds the class per kind; `tests/export-pdf.test.ts` unchanged and green.

Acceptance: matches `png/01-editor.png` sheet, "Börja här" pill (icon, `--ink` number on `--ladder`), zoom bar with %, real-size card, "Går det att sy?" with an amber floating card (Visa, Ta bort den) and checked lines, "Ett örhänge" tiles; same in dark (`png/01c-editor-dark.png`); paint frame on 80 × 120 < 16 ms (Performance panel, numbers in the MR).

## P3 – "Mönster från bild" wizard (done)

Files: `views/ImportView.svelte` (replaces the stub), `components/import/{Stepper,PictureCard,PreviewCard,SizeBar,StepCrop,StepBackground,StepColours,StepDetails,StepDone,MoreSettings,PresetThumbs}.svelte` (new), `CropView.svelte` (tokens, legend chip), `src/ui/state/import-wizard.ts` (new; `ImportTarget`), `src/ui/state/import-settings.ts` (background-choice helpers), `src/ui/state/import-merge.ts` (report texts, candidate base palette for `source: 'start'`), `src/ui/state/overlay.ts` (captions for the segmented toggle), `src/core/analysis/despeckle.ts` + `pipeline.ts` (`despeckledBeads`), `ImportDialog.svelte` deleted, i18n `wizard.*`, `e2e/import.spec.ts`.

Tests first:
- `tests/ui/import-wizard.test.ts`: step machine (next/prev/goTo, visited set, Apply guard on working/invalid/empty); initial target from `ImportTarget` (editor → current pattern; start → choice size with `autoSize: null`, panelBackground = Grundfärg id, saved settings keep `auto`); `backgroundChoice(form)` ↔ form patch for auto/threshold/none and "Eget val" for alpha/borderKey/inverted; `removalSlider(form, resolved)` field, range, direction (Mer = higher tolerance / lower threshold), hidden for chosen `none` and resolved alpha, visible with the status text for auto → none; size presets → width + `autoSize: 'height'`; auto-fix report strings (0 → "Inga hittades", plurals).
- `tests/analysis.test.ts` (extend): `despeckledBeads` counts changed cells; output identical otherwise; 0 when `despeckle` is off.

Acceptance: matches `png/02-import-background.png` (step 2 cards, worded removal slider, pink highlight while dragging, size bar in mm, "Går att sy" pill) and `png/02b-import-details.png` (presets with real thumbnails, two worded sliders with highlights, "Laga automatiskt" with live counts, collapsed "Fler inställningar"); steps 1/3/5 per the R53 table; every R31/R34/R37/R38/R39/R42 behaviour reachable; Apply = one undo step from the editor and from the start page; settings saved on Apply only.

## P4 – "Skriv ut mönster" page (done)

Files: `views/PrintView.svelte` (replaces the stub), `src/ui/state/pdf-preview.ts` (new), `src/ui/state/export.ts`, `ExportPdfDialog.svelte` deleted, i18n `print.*`, `e2e/print.spec.ts`.

Tests first:
- `tests/ui/pdf-preview.test.ts`: 300 ms debounce (fake timers); stale result dropped; previous blob URL revoked on replace and dispose; error state; `pdfViewerEnabled === false` → summary mode.
- `tests/ui/export.test.ts` (extend): options → `renderPdf` args (locale, realSize).

Acceptance: matches `png/04-export-pdf.png` (language, "Bild i verklig storlek", print-at-100 % callout, "Åtgärda först" card that returns to the editor and runs "Visa" on the floating bead once the canvas has mounted, live PDF preview, "Ladda ner PDF" → `{slug}.pdf`); "Skriv ut" per R52.10; smoke hooks `pdf-locale`, `download-pdf` kept.

## P5 – "Nytt mönster" start page (done)

Files: `views/StartView.svelte` (replaces the stub), `components/ShapeCard.svelte`, `src/ui/state/new-pattern.ts` (mm ↔ beads, bead estimate, start flow), `NewPatternDialog.svelte` deleted, i18n `start.*`, `e2e/start.spec.ts`.

Tests first:
- `tests/ui/new-pattern.test.ts` (extend): slider mm readout for the selected bead type (11 beads delica11 = 17,6 mm); bead estimate exact for panels, "upp till" for shaped; start flow state machine: CTA → confirm when dirty → (draw) create / (image) open picker only after confirm; drop follows the same order; cancelled import keeps the choices.

Acceptance: matches `png/03-new-pattern.png` (start choice, Rektangel/Fri form, size presets + sliders in mm, bead type, Grundfärg on panels, real-size pair, tiles, "Bra att veta", "Skapa mönster"/"Välj bild"); "Fortsätt med {title}" only when `hasRealPattern`; first run lands here; image drop on the page opens the wizard with the page's choices; smoke hook `create-pattern` kept.

## P6 – Touch and responsive layouts (done)

Files: `src/ui/state/gesture.ts` (new), `src/ui/state/editor.ts` (`cancelStroke`), `src/ui/state/editor.svelte.ts` (`cancelStroke` passthrough), `src/ui/state/layout.ts` (new), `components/Canvas.svelte` (pointer section), `components/BottomDock.svelte`, `components/ChipRow.svelte`, `components/Sheet.svelte`, `components/TopBar.svelte` (tablet/phone variants, "···"), responsive CSS in `views/*` and `components/import/*`, i18n `dock.*`, `e2e/touch.spec.ts`.

Tests first:
- `tests/ui/gesture.test.ts`: one touch → paint down/move/up; second touch during a stroke → cancel + pinch; scale from distance ratio, anchor at midpoint, clamp 1–80, `realSize` off; pan from midpoint delta; no painting until all pointers are up; mouse/pen unaffected; ring: second finger cancels placement.
- `tests/ui/editor.test.ts` (extend): `cancelStroke` restores `stroke.before`, adds no history entry, no-op without a stroke.
- `tests/ui/layout.test.ts`: `layoutFor(width)` desktop ≥ 1024, tablet 600–1023, phone < 600.

Acceptance: matches `png/05-tablet-portrait.png` at 820 × 1180 (top bar, checklist chip, real-size card, zoom stack, hint, dock with named swatches and tools) and `png/05b-phone-portrait-dark.png` at 390 × 844 dark (chip row, dock, long-press entry editor); one finger paints, two fingers pan/zoom without leaving painted beads; targets ≥ 48 px under coarse pointer; import/print/start usable at 390 px with sticky footers.

## P7 – e2e, accessibility pass, docs, polish (done)

Files: `e2e/smoke.spec.ts` (rewritten), `playwright.config.ts` (mobile project with `hasTouch`), `e2e/assets/` (small test PNG), `src/ui/app.css` (remove old-variable aliases), `CLAUDE.md`, `docs/SPEC.md`.

Tests:
- Smoke: start page → Skapa mönster → paint drag → reload → restored → print page → download starts with `%PDF-`.
- Import: choose a small PNG → walk 5 steps (change the background choice, move Details with the keyboard) → Använd mönstret → one undo restores the previous pattern; same from the start page ("Välj bild").
- Touch (mobile project): two-pointer pinch via dispatched pointer events zooms and leaves the pattern unchanged; one-pointer drag paints.
- Theme: Mörkt persists across reload; System follows `emulateMedia({ colorScheme })`.
- Keyboard-only walkthrough of every view (tab order, focus visible, Escape closes sheets) and a VoiceOver/NVDA spot check, recorded in the MR.

Acceptance: all mockups compared side by side (light/dark, 1440 × 900, 820 × 1180, 390 × 844); R56 checklist ticked; no old-variable aliases left; `CLAUDE.md` layout lists `src/ui/views/`, `components/import/` and the new state modules; SPEC R43–R57 match the shipped behaviour.

As built: specs `smoke`, `import` (+ start-page file picker, choices kept on cancel; `e2e/assets/motif.png`), `theme` and `a11y` (R56 as built); touch stays in `touch.spec.ts` (file-level `hasTouch`, no separate Playwright project). Renders: `png/after-*.png`. The VoiceOver/NVDA spot check is left to the owner.
