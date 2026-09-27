# App Store screenshots

Five portrait screenshots on a dark charcoal background (`#0F1114` → `#0A0B0D`). Each has a two-line headline at the top left: the first line is white and the second is amber `#FFB020`. Under it is a one-line grey subline (`#A0A3A8`). Below the text, an iPhone is tilted in 3D and shows a real Tenfold screen. The screens are drawn in HTML/CSS with the app's own tokens (`src/design/tokens.ts`). Their video areas show frames from licensed stock footage: see `FOOTAGE.md`.

The earlier ten-image set (flat centred phone, no footage) is in git history at commit `0d6b2ab`.

## Re-render

```bash
node marketing/screenshots/build.mjs    # clears src/*.html, writes src/NN-slug.html
node marketing/screenshots/render.mjs   # clears out/*/*.png, writes out/6.9/NN.png and out/6.7/NN.png
node marketing/screenshots/render.mjs 03 05   # only some pages (does not clear the others)
```

- Edit `build.mjs`, not the HTML files. It holds the shared CSS, the SF Symbol stand-ins (inline SVG), the footage map (`FOOT`) and all five screens.
- **Screen size.** Every screen is authored at the 6.9" logical size, 440 × 956 pt, with a 62 pt top inset and a 34 pt bottom inset. It is scaled into the device with CSS `zoom: 2.3`.
- **Device.** `.phone` is the frame: dark titanium gradient, inner bezel and edge highlight, side buttons, and a back plate at `translateZ(-26px)` that shows as thickness. It also has a soft drop shadow and a 5% white screen reflection (`.glare`).
- **Tilt.** `.pw` sets `perspective: 3400px`. Each device takes a centre (`cx`, `cy`) and a transform from `tilt(rotateY, rotateX, rotateZ, scale)` in `page()`.
- **Headline.** It is written as two spans with a `<br>`, so it is always exactly two lines. Type is SF Pro Display 96 px semibold; the subline is 40 px regular. The text block starts 96 px from the left edge.
- **Footage.** Images are `<img class="foot">` with `object-fit: cover` and a per-image `object-position`. The app's badges and captions are drawn on top. Timeline filmstrips use the same frames: `timeline({ strip })`, or `strip` on each clip.
- **6.9"** is rendered at 1320 × 2868. **6.7"** is rendered at 1290 × 2796: the page is re-laid out with `?size=6.7` (stage `zoom: 0.977273`), not resized from the 6.9" PNG.
- **PNG format.** The PNGs are 8-bit RGB with no alpha, which App Store Connect requires. They are re-encoded with `pngjs`.
- **Checks.** `render.mjs` checks each page at both sizes and exits non-zero if any check fails:
  - the headline is at most 2 lines
  - the subline is 1 line and ends at least 24 px from the right edge
  - every phone's projected box, after rotation, is at least 24 px inside the canvas on all four sides (`getBoundingClientRect` on a 3D-transformed element returns the projected box)
  - the text block, grown by 24 px, does not intersect any phone
  - no font fails to load
- **Fonts.** Interface text uses the system font (SF Pro on macOS), so render on a Mac. Caption faces (Poppins) load from `assets/fonts/` by relative path.
- **Requirements.** Needs the `playwright` devDependency and its Chromium: `npx playwright install chromium`.

## What each image says

| # | Headline (amber line second) | Subline | Screen |
|---|---|---|---|
| 01 | Import ten takes. / It edits itself. | Pauses, fillers and retakes, cut | Batch screen: ring at 100%, "6 of 6 ready", four result tiles with footage and "0:52 → 0:37" badges, "Export 6 videos" |
| 02 | Post-ready / in minutes. | From raw clips to finished videos | Onboarding demo while it runs (`DemoPending`): "Editing a real take", the clip poster, a card showing "Transcribing 29%" with its progress bar, and the button disabled |
| 03 | Captions on / every word. | 12 styles. Restyle any of them. | Editor: Pop caption "the part that matters" with the spoken word in yellow, Captions tool selected, timeline with a footage filmstrip |
| 04 | A real editor, / when you want it. | Trim, split, reorder on a full timeline | Editor: three clips on the timeline (Clip 2 selected), "+" tile, Split / Delete / Done |
| 05 | Ten videos, / one tap. | Export the whole batch to Photos | Home: "In progress · Exporting 7 of 10" at 72%, Recent batch cards with footage posters |

Screen 02 shows the demo exactly as the app draws it. `src/onboarding/Demo.tsx` has no progress ring and no stage dots, so neither is drawn.
