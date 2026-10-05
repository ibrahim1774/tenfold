# Tenfold App Store localization brief (follow exactly)

Source: en-US.json (same folder). Produce, per assigned locale, a file loc/<locale>.json with EXACTLY these keys:
name, subtitle, keywords, promotionalText, description, headings (7 pairs [line1,line2]), sublines (7 strings).

## Product
Tenfold is a BULK / AUTO VIDEO EDITOR for talking-to-camera clips on iPhone: import up to 10 videos at once, it automatically cuts silences, pauses, filler words and repeated takes, reframes for vertical. Captions exist but are SECONDARY: never put captions/subtitles words in name, subtitle or keywords.

## Source analysis
- BrandWord: "Tenfold" (proper noun). Latin-script locales: keep "Tenfold" verbatim. Non-Latin scripts (Cyrillic, Greek, CJK, Arabic, Hebrew, Thai, Indic): transliterate Tenfold into the local script (e.g. ru "Тенфолд", ja "テンフォールド", ko "텐폴드", zh "Tenfold" may stay Latin for zh-Hans/zh-Hant (Latin brands are normal in Chinese stores), ar "تينفولد", he "טנפולד", hi "टेनफोल्ड", th "เทนโฟลด์", el "Tenfold" may stay Latin) — decide per script, be consistent across all fields of that locale.
- DescriptorWord: "Auto Video Editor" = the main search keyword. Translate to the phrase locals actually SEARCH for an automatic video editor (e.g. de "Automatischer Videoeditor" is too long → prefer short searched forms like "Auto Video Editor"/"Video Editor automatisch"; ja "自動動画編集"; ko "자동 동영상 편집"; es "Editor de video automático"; pt-BR "Editor de vídeo automático"; fr "Montage vidéo automatique"). Name format everywhere: "<Descriptor> — <Brand>" (descriptor first). If too long, shorten the descriptor, never drop the brand.
- Subtitle concept: "Bulk Edit & Silence Remover". Use the locally searched term for silence remover. Research shows locals search: de "stille entfernen", fr "supprimer silences", es "quitar silencios", pt "remover silêncio", it "rimuovere silenzi", ja "無音カット", ko "무음 제거", tr "sessizlik silme"(verify by judgment), nl "stilte verwijderen". "Bulk edit" = edit many videos at once (de "Videos in Masse bearbeiten" too long → e.g. "Massenbearbeitung"), choose the natural short local phrase.
- Verbatim atoms (never translate/alter): iPhone, TikTok, Reels, Shorts, all URLs (https://ibrahim1774.github.io/tenfold/terms.html, .../privacy.html), aspect ratios 9:16, 4:5, 1:1, 16:9, numbers.
- "Photos" = Apple's Photos app: use the app's official local name (de "Fotos", fr "Photos", es "Fotos", ja "写真", ko "사진", zh-Hans "照片", zh-Hant "照片", ru "Фото", etc.).
- Filler-word examples ("um", "uh", "like"): replace with the local language's typical fillers (de "äh, ähm, halt"; fr "euh, ben, genre"; es "eh, este, o sea"; ja "えー、あの"; ko "음, 어, 그"), keep the quotes style natural.
- Idioms: "Film ten takes. Post ten videos." / "film today, post all week" / "Shoot. Tap. Post." → translate by MEANING, punchy, not literal.
- NO pricing words anywhere (no free, trial, price, subscription, discount). NO "AI". No exclamation marks.
- English locales (en-AU, en-CA, en-GB): copy en-US but adapt spelling (colour/centre etc.) and you MAY vary the keywords field to fill unused ideas (e.g. "video editing,talking head") — still no repeats of name/subtitle words.

## Hard limits (count characters, not bytes): name ≤30, subtitle ≤30, keywords ≤100, promotionalText ≤170, description ≤4000.
Run: python3 -c "import json;d=json.load(open('loc/<loc>.json'));print({k:len(d[k]) for k in ['name','subtitle','keywords','promotionalText','description']})" and fix anything over.

## Keywords field rules
- Comma-separated, no spaces after commas, ≤100 chars.
- ADAPT the en-US concept list (automatic, auto cut, jump cut, batch, trim, cutter, pauses, filler words, reels, shorts, tiktok, creator, vlog) into the words locals search. Do NOT repeat any word already in that locale's name or subtitle (Apple combines words across fields). No captions/subtitles words. No geo filler, no competitor brand names, no invented extras. Keep reels,shorts,tiktok as-is in Latin. If space is left, add local synonyms of "video editing / cut video".
- CJK: no need for commas between every character; use commas between terms.

## Screenshot headings & sublines
- headings: 7 two-line pairs, same meaning/order as en-US, SHORT (each line ideally ≤16 chars Latin, ≤8 CJK chars). Line 1 white, line 2 grey — keep the split meaningful. Use the same local vocabulary as name/subtitle (e.g. the local "silence"/"bulk edit" words).
- sublines: 7 one-liners (≤45 chars Latin), same meaning as en-US. Keep "TikTok", "Photos" rule above.
- No ALL-CAPS in scripts without case.

Write valid UTF-8 JSON (ensure_ascii false). Report back only: locale list + the char-count dict per locale + any concerns.
