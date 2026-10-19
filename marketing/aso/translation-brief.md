# Tenfold App Store localization brief (follow exactly)

Source: en-US.json (same folder). Produce, per assigned locale, a file loc/<locale>.json with EXACTLY these keys:
name, subtitle, keywords, promotionalText, description, headings (7 pairs [line1,line2]), sublines (7 strings).

## Product
Tenfold is a BULK / AUTO VIDEO EDITOR for talking-to-camera clips on iPhone: import a whole batch of videos at once, it automatically cuts silences, pauses, filler words and repeated takes, reframes for vertical. Captions exist but are SECONDARY: never put captions/subtitles words in name, subtitle or keywords.

## Source analysis
- BrandWord: "Tenfold" (proper noun). Latin-script locales: keep "Tenfold" verbatim. Non-Latin scripts (Cyrillic, Greek, CJK, Arabic, Hebrew, Thai, Indic): transliterate Tenfold into the local script (e.g. ru "Тенфолд", ja "テンフォールド", ko "텐폴드", zh "Tenfold" may stay Latin for zh-Hans/zh-Hant (Latin brands are normal in Chinese stores), ar "تينفولد", he "טנפולד", hi "टेनफोल्ड", th "เทนโฟลด์", el "Tenfold" may stay Latin) — decide per script, be consistent across all fields of that locale.
- DescriptorWord: "Auto Video Editor" = the main search keyword. Translate to the phrase locals actually SEARCH for an automatic video editor (e.g. de "Automatischer Videoeditor" is too long → prefer short searched forms like "Auto Video Editor"/"Video Editor automatisch"; ja "自動動画編集"; ko "자동 동영상 편집"; es "Editor de video automático"; pt-BR "Editor de vídeo automático"; fr "Montage vidéo automatique"). Name format everywhere: "<Descriptor> — <Brand>" (descriptor first). If too long, shorten the descriptor, never drop the brand.
- Subtitle concept: "Bulk Edit & Silence Remover". Use the locally searched term for silence remover. Research shows locals search: de "stille entfernen", fr "supprimer silences", es "quitar silencios", pt "remover silêncio", it "rimuovere silenzi", ja "無音カット", ko "무음 제거", tr "sessizlik silme"(verify by judgment), nl "stilte verwijderen". "Bulk edit" = edit many videos at once (de "Videos in Masse bearbeiten" too long → e.g. "Massenbearbeitung"), choose the natural short local phrase.
- Verbatim atoms (never translate/alter): iPhone, all URLs (https://ibrahim1774.github.io/tenfold/terms.html, .../privacy.html), aspect ratios 9:16, 4:5, 1:1, 16:9, numbers.
- "Photos" = Apple's Photos app: use the app's official local name (de "Fotos", fr "Photos", es "Fotos", ja "写真", ko "사진", zh-Hans "照片", zh-Hant "照片", ru "Фото", etc.).
- Filler-word examples ("um", "uh", "like"): keep them ONLY for English and Spanish (es "eh, este, o sea"); the engine's filler list knows only English and Spanish words, so every other locale drops the examples ("Removes filler words and repeated takes").
- Never name TikTok, Reels, Shorts, Instagram, YouTube, CapCut or any other app/platform (guideline 2.3.7 / 2.3.10), and never claim direct posting: the app exports to Photos. Use "Exports vertical 9:16 video, ready for any social app".
- Privacy: claim only what is true for VIDEOS ("Your videos are edited on your iPhone and never uploaded. No account needed."). Analytics, attribution and paywall data do reach servers, so no "everything runs on device" / "nothing leaves your phone" claims.
- Speech features (captions, filler-word and retake removal) are claimed for English, Spanish, French, German, Italian and Portuguese (the in-app language picker). Every locale in another language carries the line "Captions, filler-word and retake removal work for videos in English, Spanish, French, German, Italian and Portuguese; silence removal works in any language." No 4K/HDR, no batch sizes, no "unlimited".
- The description ends with the live subscription paragraph (local prices from App Store Connect, 3-day trial on Pro/Studio, auto-renewal, Terms of Use + Privacy Policy links). Never drop it; prices must match ASC for the named storefront.
- Idioms: "Film ten takes. Post ten videos." / "film today, post all week" / "Shoot. Tap. Post." → translate by MEANING, punchy, not literal.
- NO pricing words anywhere except the subscription paragraph (no free, trial, price, subscription, discount). NO "AI". No exclamation marks.
- English locales (en-AU, en-CA, en-GB): copy en-US but adapt spelling (colour/centre etc.) and you MAY vary the keywords field to fill unused ideas (e.g. "video editing,talking head") — still no repeats of name/subtitle words.

## Hard limits (count characters, not bytes): name ≤30, subtitle ≤30, keywords ≤100, promotionalText ≤170, description ≤4000.
Run: python3 -c "import json;d=json.load(open('loc/<loc>.json'));print({k:len(d[k]) for k in ['name','subtitle','keywords','promotionalText','description']})" and fix anything over.

## Keywords field rules
- Comma-separated, no spaces after commas, ≤100 chars.
- ADAPT the en-US concept list (automatic, auto cut, jump cut, batch, trim, cutter, pauses, filler words, creator, vlog) into the words locals search. Do NOT repeat any word already in that locale's name or subtitle (Apple combines words across fields). No captions/subtitles words. No geo filler, no competitor or platform brand names (no tiktok/reels/shorts/youtube/youtuber, in any script), no invented extras. If space is left, add local synonyms of "video editing / cut video".
- CJK: no need for commas between every character; use commas between terms.

## Screenshot headings & sublines
- headings: 7 two-line pairs, same meaning/order as en-US, SHORT (each line ideally ≤16 chars Latin, ≤8 CJK chars). Line 1 white, line 2 grey — keep the split meaningful. Use the same local vocabulary as name/subtitle (e.g. the local "silence"/"bulk edit" words).
- sublines: 7 one-liners (≤45 chars Latin), same meaning as en-US. Keep the "Photos" rule above. (The live en-US subline "Saved to Photos, ready for TikTok" still names TikTok and should be re-rendered.)
- No ALL-CAPS in scripts without case.

Write valid UTF-8 JSON (ensure_ascii false). Report back only: locale list + the char-count dict per locale + any concerns.
