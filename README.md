# 🧶 Mon Crochet

A web app for managing a collection of crochet patterns, tracking progress round by
round, and previewing the finished piece before starting: a realistic fabric view in 2D
and an assembled 3D model.

- **No account and no server.** All data stays in the browser (IndexedDB).
- **Works offline** after the first visit (service worker), **installable** (PWA).
- **Interface in French (default) or English.**

## Getting started

```sh
npm install
npm run dev        # http://localhost:5173
npm run build      # static site in dist/
npm test           # unit tests (Vitest)
npm run e2e        # end-to-end tests (Playwright, builds first)
```

`npm run dev` and `npm run build` first copy the OCR engine and the French and English
language data from `node_modules` into `public/tesseract/` (see `scripts/copy-tesseract.mjs`).

## Deployment

`.github/workflows/pages.yml` builds the site on every push to `main` and publishes `dist/`
to the `gh-pages` branch. GitHub Pages serves that branch
(**Settings → Pages → Deploy from a branch: `gh-pages` / root**) at
https://adrien-image.github.io/test_project_crochet/.
The build uses relative paths and hash routing, so it works from any sub-folder.

## Features

| Area | What it does |
| --- | --- |
| Library | Covers (photo, or a generated swatch in the yarn colours), search by name / tag / yarn, filters by progress and tag, four sorts, duplicate (from zero or with progress), undoable deletion (several at once), three example patterns, statistics (totals, 12-week chart with data table, per-pattern table). |
| Pattern page | Tick rounds directly in the text, current round highlighted; photos with gallery, full-screen viewer and cover choice; attached PDF / image / text with preview; editable, reorderable checklist; timer (total and last 7 days); yarn per colour (pieces, length with margin, weight, "guessed" colours with a picker), suggested yarn weight and material; finished size (stated or estimated) and how it changes with another hook; printable sheet. |
| Counter | One round at a time with a large touch ring, "Round done — next" and undo, the round's stitches, colour changes and back / front loop; screen kept awake; Space / Enter / Backspace; a note and a photo per round; hands-free with headphone / watch / lock-screen buttons (Media Session) and voice commands in French and English. |
| Rounds view | Fabric drawn strand by strand (unrolled for stuffed pieces, concentric for flat discs), undone rounds faded; chart with international symbols; count checks; SVG export and print. |
| 3D preview | Each piece rebuilt from its stitch counts and heights with a stitch texture; automatic assembly from piece names (head, body, ears, arms, legs, tail, snout, eyes, nose, wings, antennae, horns, spikes, heart lobes, cushion layers…); positions from the text ("eyes between rounds 9 and 10, 7 sts apart"); construction slider; yarn colours and round-by-round colour changes; manual placement by tapping (mirrored for pairs); assembled / separate; keyboard controls; PNG export. |
| Adding a pattern | Typed: live check of the current line, abbreviation suggestions (Tab completes), "Next round" in the same label style. PDF: text in reading order (columns, sidebars, repeated headers / footers removed, tables), name / hook / yarn pre-filled, photos imported (logos, backgrounds, full-page scans left out), clean-up (wrapped rounds joined, "[3]" photo references removed, superscripts kept), chart-only count tables turned into rounds with missing counts inferred, OCR for scans and unreadable fonts (French + English bundled; Spanish, German, Italian, Portuguese, Dutch downloaded when needed; common misreadings fixed; unreadable round numbers inferred; junk lines discarded), review screen with the pages next to the editable lines. |
| Formats | French, English (US and UK), Spanish, Portuguese, German, Italian, Dutch and XVA notation; labels (R1, Rang 1, Tour 1, Rnd 1, Round 1, Row 1, ranges, ordinals, bare numbers); repeats (`*…* x6`, `(…) x6`, `[…] x6`, "rep from * around", "in each stitch", "around", "As 4th rnd"); counts (`(18)`, `= 16 sc`, `(6 sc)`, "Join. 20 sc.", `[10 Dc, 2 Picots]`); pieces (titles, "make 2" / "(x2)", continued pieces, rows); colours (legend, named, codes, change lines, two-colour pieces); multi-size `6 (8, 10) sc`. |
| Sharing | Share link (pattern compressed into the URL, no progress or notes), printable link, `.crochet.json` file, Markdown export. Links are validated field by field and can't carry files. |
| Backup | Full JSON export / import with photos, persistent storage request, export reminder, optional sync with a file (Chrome / Edge — put it in a Drive / Dropbox / iCloud folder), storage dialog. |
| Comfort | Light / dark / system theme, phone layout with a bottom tab bar, direct links (`#/patron/<id>/<tab>`), tabs kept in sync (BroadcastChannel), strict Content Security Policy. |

Tabs in direct links: `instructions`, `compteur`, `rangs`, `3d`, `fil`, `photos`, `notes`,
`modifier`, `imprimer`.

## Code map

```
src/
  parser/       lexicon (7 languages + XVA), instruction grammar, pattern reader, colours
  core/         types, i18n, yarn & size estimates, examples, progress, DOM helpers
  store/        IndexedDB, pattern store with undoable deletes and cross-tab sync
  render/       stitch layout, fabric (canvas), chart (SVG), cover swatch
  three/        3D piece building and assembly (three.js)
  pdf/          pdf.js loading, layout (reading order), clean-up, OCR (tesseract.js)
  features/     share links, backup, file sync, hands-free, images, actions
  views/        library, stats, editor, import, print, shared link, pattern page + tabs
tests/          unit tests (parser, layout, clean-up, yarn)
e2e/            Playwright tests and PDF fixtures (scripts/make-fixtures.py rebuilds them)
```

## Known limits

- Data stays in the browser. File sync works only on Chrome / Edge; elsewhere use
  export / import or share links.
- Sync carries the cover and attached file at full size, other photos as thumbnails.
- 3D assembly is guessed from piece names; it can be corrected by hand.
- Colourwork within a single round (tapestry, jacquard) isn't drawn.
- Stitches worked into chain spaces aren't count-checked.
- The yarn estimate is an order of magnitude (± 20 %).
- OCR text should be reviewed, especially for handwriting or poor scans.
- Rounds ticked before dates were recorded don't appear in weekly statistics.
- Voice commands depend on the browser (Chrome, Edge, Safari) and its speech service may
  send audio to the vendor's servers.
