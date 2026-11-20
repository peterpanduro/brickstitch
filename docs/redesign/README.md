# Brick Stitch – redesign proposal

Status: implemented (phases P1a–P7 in `PLAN.md`). `png/after-*.png` are renders of the shipped app. The mockups (`png/01…05b`, `html/*`) and before-captures were removed after implementation; they remain in git history up to commit 76481da.

The pattern, the "photo" and all numbers in the mockups are illustrative. Colour names/codes come from `src/core/palette/catalog.ts`.

## Critique of the current UI (prioritised)

1. **Import is one modal with ~15 pipeline controls.** Kanttolerans 12, Linjekänslighet 0.50, Täckning 0.50, Marginal, Anpassning are engine parameters with no visible cause and effect; the settings scroll inside a fieldset and the bead preview is cut off below the fold.
2. **Toolbar is a flat row of identical text buttons.** File actions, undo, tools, title and language have equal weight; no icons, no primary action, the title is an unlabelled placeholder.
3. **Palette shows codes, not colours.** "DB-200 ≈ 175 [1]" with a 14 px swatch; no names, the catalogue is hidden behind "Lägg till färg", editing is a separate button.
4. **Sewing feedback is jargon and passive.** "Stegsöm: rad 1 (auto) [Auto]", an "S" badge, "Utan stöd", "Extra stegsöm" – no explanation of what to do, no fix next to the problem.
5. **Size is abstract.** New pattern asks for beads × rows; millimetres are a grey bullet list; "Panel/Formad" is unexplained; "Verklig storlek" is a zoom mode, not a constant reference.
6. **Export is a blind two-field dialog.** No preview of the PDF, the "print at 100 %" rule is only inside the PDF.
7. **Phone/tablet is unusable.** The toolbar wraps to four rows, the palette takes half the width, the pattern is a thumbnail, targets are small.
8. **Canvas hierarchy is inverted.** Row numbers and counts are larger than the beads; beads are grey outlined boxes; no save state, no visible history, Ring tool lists "topp 4 / botten 4".

## Concept

**Information architecture.** Three places instead of one screen plus modals: *Editor*, *Mönster från bild* (guided, full screen), *Skriv ut mönster* (full screen with preview). "Nytt mönster" is a start page that also offers recent patterns.

**Editor layout.** Top bar = document (name, saved state, undo/redo/history, Mina mönster, Från bild, one primary: Skriv ut mönster). Left rail = tools with icon + label. Centre = the pattern on a paper sheet with quiet row numbers and a "Börja här" marker on the start row. Right panel = Färger (real bead swatches, Swedish name first, DB number second, count per pair), "Går det att sy?" (plain-language checklist with Visa / Ta bort den), and size/bead totals. A floating real-size pair is always visible.

**Import.** Five steps (Beskär, Bakgrund, Färger, Detaljer, Klart), one question per step. Picture and bead result stay side by side. Choices are worded as outcomes; sliders have worded ends instead of numbers; presets are thumbnails (Enkel/Lagom/Detaljerad); auto-fixes report what they did; engine parameters sit under "Fler inställningar – behövs sällan". Size is always visible in mm.

**Visual language.** Warm paper neutrals, one spruce-green accent, amber only for the start row and warnings, red only for errors. Fraunces for headings, Inter for UI; 4/8 px spacing, 10–14 px radii, 40 px controls (48 px on touch). Stroke icons always paired with labels. Light and dark from the same tokens.

**Touch.** Canvas first; colours and tools in a bottom dock; one finger paints, two fingers pan/zoom; warnings and real size become chips.

**New ideas that need an owner decision** (not in the spec today): Spegla (symmetric painting), shape starters (Droppe, Romb), click-to-pick background, symbols for B/W print and mirrored pair in export (spec P3), screen calibration (spec P3), "Mina mönster" list, coin for scale.

## Screens (shipped app)

| PNG | Caption |
|---|---|
| `png/after-01-editor.png` | Editor, desktop 1440×900. |
| `png/after-01c-editor-dark.png` | Editor in dark mode. |
| `png/after-02-import-background.png` | Import step 2 "Vad är bakgrund?". |
| `png/after-02b-import-details.png` | Import step 4 "Hur detaljerat?". |
| `png/after-03-start.png` | Start page "Nytt mönster". |
| `png/after-04-print.png` | Print page with live PDF preview. |
| `png/after-05-tablet.png` | Editor on tablet portrait 820×1180. |
| `png/after-05b-phone-dark.png` | Editor on phone 390×844, dark mode. |
