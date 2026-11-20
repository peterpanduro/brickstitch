# Brick Stitch

Static, client-only web app (Svelte 5 + TypeScript + Vite) for designing brick stitch bead patterns (Miyuki Delica 11/0, 15/0): paint or import an image onto a lattice, get live feasibility feedback, and export a real-size PDF guide. Swedish and English. Spec: `docs/SPEC.md` (§13b revisions supersede earlier sections).

## Layout

```
src/core/        pure TS, no DOM (geometry, pattern, palette, feasibility, instructions,
                 scene, imaging, analysis, persist, i18n, ring); imports only from src/core
  analysis/      image → pattern pipeline (stage, pipeline, thicken, details = Details slider,
                 debug = layers for the processed import picture, ring-fix, cluster + reduce = R59.3
                 palette reduction, match = R59.5 hue-preserving entry match, autodetail = R59.4, ...)
  imaging/       pixel primitives; borderKey + keying = R59.1 multi-seed adaptive background keying,
                 specks = speck removal
src/export-pdf/  Analysis + Scene + i18n -> PDF bytes (jsPDF, Helvetica/WinAnsi, runs in node);
                 content.ts (texts), draw.ts (scene shapes), crop.ts (motif crop, diagram paging),
                 page.ts (page flow helpers), rows.ts (row list columns), render.ts, winansi.ts
src/ui/          Svelte 5 app: App.svelte (final shell: hash routing, drop overlay, global keys,
                 theme), app.css (R45 tokens + shared classes .btn/.card/.seg/.pill/.float/...),
                 fonts.css (bundled Inter/Fraunces), icons.ts, storage.ts (localStorage + downloads),
                 shortcuts.ts, image.ts (image decode)
  views/         one per route (R44): EditorView (#/), StartView (#/new), ImportView (#/import),
                 PrintView (#/print); root has data-view, one h1 tabindex=-1, gets `nav: ViewNav`
  state/         pure TS logic, one module per concern: history, editor (+ editor.svelte.ts,
                 thin runes wrapper), session, autosave, palette, colour-family, settings, errors,
                 roving, file, warnings, checklist, export, pdf-preview, route, new-pattern,
                 presets, proportions, real-size, size-tiles, zoom, rail, ring, overlay, crop,
                 highlight, slider, gesture, layout, import-settings, import-merge,
                 import-wizard (+ import-wizard.svelte.ts)
  components/    thin Svelte components: TopBar, Logo, FileMenu, ToolRail, ToolCard, Popover
                 (popover/bottom sheet), Canvas, SceneShapes/ShapeList, PalettePanel,
                 PaletteEntryEditor, ColorPicker, RingPanel, ShapeCard, Checklist, SizeTiles,
                 ZoomBar, RealSizePair, BannerList (toasts), BottomDock, ChipRow, CropView
                 (processed import picture + crop), Icon
    import/      wizard parts: Stepper, StepHead, StepCrop/Background/Colours/Details/Done,
                 PictureCard, PreviewCard, SizeBar, PresetThumbs, RadioCards, Segmented,
                 WordSlider, MoreSettings
tests/           vitest (tests/ui = UI state logic, incl. tokens.test.ts parsing app.css;
                 tests/quality + analysis-quality.test.ts = import benchmark, BENCH_REPORT=1 + --reporter=verbose prints it);
                 tests/fixtures = read-only golden data; tests/adapters.ts = test-only loaders;
                 tests/pdf-text.ts = text of uncompressed PDFs
e2e/             Playwright specs (not in hooks), one per view/feature + a11y.spec.ts and theme.spec.ts;
                 smoke.spec.ts uses only the R57 data-testid hooks; assets/ = test images
build/           optional-stub.js: aliases jsPDF's html2canvas/dompurify/canvg out of the bundle
                 notices.ts (+ node-fs.d.ts): Vite plugin writing dist/THIRD_PARTY_LICENSES.txt (fails on a missing licence)
docs/            SPEC.md; redesign/ (README.md, PLAN.md, png/after-*.png renders of the shipped app)
.githooks/       pre-commit (gitleaks, prettier, eslint), pre-push (check + test)
```

Dependency direction: `ui -> export-pdf -> core`, `ui -> core`. Enforced by `tsconfig.core.json` (no DOM lib; covers core and export-pdf) and the ESLint `no-restricted-imports` rules. The UI loads `export-pdf` via dynamic `import()` (separate chunk).

## Commands

- `npm run dev | build | preview`
- `npm test` / `npm run test:watch` (vitest)
- `npm run check` (svelte-check + `tsc -p tsconfig.core.json --noEmit`)
- `npm run lint`, `npm run format`
- `npm run e2e` (Playwright; builds and serves on port 4317 with `--strictPort`, so the port must
  be free). Needs `npx playwright install chromium`,
  or `PW_CHANNEL=chrome npm run e2e` to use an installed Chrome.
- `npm install` sets `core.hooksPath=.githooks`; gitleaks must be installed (`brew install gitleaks`).
- CI: `.github/workflows/pages.yml` runs check, lint, prettier, test, e2e and build on every push and PR;
  pushes to `main` deploy `dist/` to GitHub Pages. Actions are pinned by commit SHA.

## Conventions

- Licence: GPL-3.0-only (`LICENSE`, `README.md`). New runtime dependencies must be GPL-3.0 compatible.

- TDD: failing test first, then code. Small, pure, independently testable modules; inject dependencies.
- Core is pure and DOM-free; `strict` + `noUncheckedIndexedAccess`.
- tsdoc on exports, no inline comments.
- Fixtures in `tests/fixtures` are read-only golden data; never edit them.
- Dependencies are pinned exactly; add only what SPEC §12 lists.
- SPEC §13b supersedes earlier sections; on conflict update spec, then tests/docs, then code.
- Commit directly to `main` (owner decision D4); never push without owner confirmation.
- No mention of AI authorship in commits, comments or docs.
- i18n: new keys go under their prefix marker comment (`// shell`, `// theme`, `// rail`, ...) in
  both `messages.sv.ts` and `messages.en.ts`.
- Colours only via the R45 tokens in `app.css`; icons only via `Icon.svelte` (never text glyphs).
