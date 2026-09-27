# App Store screenshots

Ten portrait screenshots: a headline, a grey subline, and an iPhone frame showing the matching Tenfold screen. The screens are drawn in HTML/CSS with the app's own tokens (`src/design/tokens.ts`). They contain no footage: every video area is a neutral charcoal "clip" placeholder.

## Re-render

```bash
node marketing/screenshots/build.mjs    # writes src/NN-slug.html from the shared styles
node marketing/screenshots/render.mjs   # writes out/6.9/NN.png and out/6.7/NN.png
node marketing/screenshots/render.mjs 03 07   # only some pages
```

- Edit `build.mjs`, not the HTML files. It holds the shared CSS, the SF Symbol stand-ins (inline SVG) and all ten screens.
- Every screen is authored at the 6.9" logical size, 440 × 956 pt, with a 62 pt top inset and a 34 pt bottom inset. It is scaled into the frame with CSS `zoom: 2.3`.
- **6.9"** is rendered at 1320 × 2868. **6.7"** is rendered at 1290 × 2796: the page is re-laid out with `?size=6.7` (stage `zoom: 0.977273`), not resized from the 6.9" PNG.
- The PNGs are re-encoded as 8-bit RGB with no alpha, which App Store Connect requires. This uses `pngjs`, which is already in `node_modules` as a dependency of Expo's image utilities.
- `render.mjs` checks each page at both sizes and exits non-zero if any check fails:
  - the headline is at most 2 lines
  - the subline is 1 line
  - the phone is centred, with at least 24 px margins
  - the headline block stays clear of the phone
  - no font fails to load
- Fonts: interface text uses the system font (SF Pro on macOS). Text-tool and caption faces load from `assets/fonts/` by relative path (TikTok Sans, Poppins, Comic Neue, Inter Black, Bebas Neue). Didot, Bodoni 72, American Typewriter, Noteworthy and Georgia are macOS system fonts, so render on a Mac.
- Needs the `playwright` devDependency and its Chromium: `npx playwright install chromium`.

## What each image says

| # | Headline (amber part in brackets) | Subline | Screen |
|---|---|---|---|
| 01 | Film ten takes. Post [ten videos.] | Import a batch. Get finished videos back. | Batch screen: ring at 100%, "6 of 6 ready", grid of results with "0:52 → 0:37" badges, "Export 6 videos" button |
| 02 | Pauses, fillers and retakes, [cut for you] | Removed 14 s · 6 fillers · 3 pauses | Editor with Cuts open: preview badge "0:48 → 0:34", timeline split at each cut, one part selected, Split / Delete |
| 03 | Captions that follow [every word] | 12 styles. Yours to restyle. | Pop caption on the preview; Captions sheet: Style · Pop, Font · Poppins, Background, Outline, Shadow, Text colour |
| 04 | Hooks and titles, [TikTok style] | Nine text styles. Drag, pinch, rotate. | Text tool: "POV: you stopped editing", toolbar (size, colour, box, align, Done), style chips in their own fonts, hook chips, keyboard |
| 05 | Music and voiceover, [ducked] under your voice | Add from Files or record in the app. | Editor with Music selected: Volume and Ducking on; Original, Voiceover 1 and Music lanes |
| 06 | Framed for vertical. [Or any ratio.] | 9:16 · 4:5 · 1:1 · 16:9, auto or by hand. | Editor with a 4:5 canvas; Frame panel with the aspect tiles and Fit / Fill / Auto |
| 07 | Join clips into [one video] | Reorder, trim, split. Captions carry across. | Three-clip timeline (Clip 1–3), Clip 2 selected with trim handles, "+" tile |
| 08 | Fix any word. [Undo anything.] | Tap a caption to edit, split, merge or hide. | Caption selected: Edit text · Split · Merge · Hide · Done |
| 09 | Everything on your iPhone. [Nothing uploaded.] | Apple’s on-device speech. No account. | Onboarding demo result: "0:40 → 0:26 · 6 fillers · 9 pauses", kept/cut bar |
| 10 | Ready in minutes, [ready to post] | Every plan starts with a 3-day free trial. | Home: In progress row with an amber progress bar, Recent exported batches, tab bar |
