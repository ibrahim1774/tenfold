# App Store listing, 50 languages (vibe-aso skill)

`locales/<locale>.json` holds each language's App Store text (name, subtitle, keywords, promotional text,
description) plus the 7 screenshot headlines and sublines. en-US is the source.

- Name: **Auto Video Editor — Tenfold**, subtitle **Bulk Edit & Silence Remover** (chosen 2026-10-05 from
  Apple search-suggestion data: "auto video editor" is suggested from "auto vid…" and only one app uses it in its
  name; "silence remover" is suggested with weak competitors; "batch/bulk video editor" is not searched).
  Captions are deliberately kept out of name, subtitle and keywords.
- `translation-brief.md`: the rules every translation followed (descriptor first, brand kept in Latin scripts and
  transliterated in others, verbatim iPhone/TikTok/Reels/Shorts/URLs, no pricing words, local search terms).
- `validate.py`: character limits, verbatim atoms, no repeats between keywords and name/subtitle, no English left.
- `upload.mjs <locale>…`: writes name/subtitle/privacy URL and description/keywords/promo/URLs to App Store
  Connect, then reads every field back. `hints.py` / `sweep.py`: the keyword research (Apple search hints per
  storefront, competitors via the iTunes Search API).
- Screenshots: `SHOT_LOCALE=xx SHOT_LOC=locales/xx.json SHOT_SRC=<tmp> SHOT_FONTS=~/.claude/skills/vibe-aso/renderer/fonts node marketing/screenshots/build.mjs`,
  then `render.mjs` with `SHOT_SRC/SHOT_OUT/SHOT_SIZES=6.7`, then `SHOT_LOCALE=xx SHOT_DIR=<out>/6.7 node scripts/asc-screenshots.mjs`.

**Do not run `eas metadata:push`:** store.config.json only has en-US and would not carry the other 49 languages.
Edit the JSON here and use `upload.mjs` instead.
