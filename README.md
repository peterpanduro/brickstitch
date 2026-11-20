# Brick Stitch

A browser app for designing brick stitch bead patterns (Miyuki Delica 11/0 and 15/0): paint
bead by bead or start from a picture, get live feedback on whether the pattern can be stitched,
and print a real-size PDF guide. Swedish and English. Everything runs in the browser; patterns
are stored only in your own browser.

## Development

```bash
npm install
npm run dev
```

`npm test`, `npm run check`, `npm run lint` and `npm run e2e` run the checks; `npm run build`
writes the static site to `dist/`. See `CLAUDE.md` for the project layout and `docs/SPEC.md`
for the specification.

## Licence

Copyright (C) 2026 Peter Panduro.

This program is free software: you can redistribute it and/or modify it under the terms of the
GNU General Public License, version 3, as published by the Free Software Foundation. It is
distributed WITHOUT ANY WARRANTY. See [`LICENSE`](LICENSE) for the full text.

Third-party software shipped with the app (jsPDF, Svelte, the Inter and Fraunces fonts and
their dependencies) keeps its own licence; the build writes the full list and licence texts to
`dist/THIRD_PARTY_LICENSES.txt`.

Miyuki and Delica are trademarks of Miyuki Co., Ltd. This project is not affiliated with or
endorsed by Miyuki. Colour values are approximations for planning only.
