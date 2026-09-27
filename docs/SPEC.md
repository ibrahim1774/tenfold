# TENFOLD — iOS Batch AI Video Editor — Full Build Spec

> This file is the source of truth for the product, the architecture, the design system and the milestones. Build in the milestone order at the bottom. Do not skip the "Do not" list.

---

## 0. Your role and how to work

You are a principal iOS engineer (Swift 6, AVFoundation, Core Animation, Core ML, Expo Modules API) and a senior React Native / Expo engineer. You are building a production App Store app, not a demo. Rules:

- Target **iOS 26.0 minimum**, Xcode 26, Swift 6 language mode with strict concurrency. Expo SDK **57** (current stable) with the New Architecture, `expo-router`, and a **custom dev client** (`expo-dev-client`). Expo Go cannot run this app because it has native code.
- All heavy work (audio extraction, transcription, silence detection, cutting, zooms, caption rendering, export) lives in **one local Expo Module written in Swift** at `modules/tenfold-engine`. React Native only does UI, navigation, state, and purchases.
- **Everything runs on device. There is no backend, no API key, no upload, no account.** If you ever find yourself adding a network call for processing, stop; that is wrong.
- Preview must be **WYSIWYG with export**: the same Core Animation layer tree that draws captions and zooms in the player is the one used for export. Never draw captions in React Native views.
- Write real tests for the algorithms (silence detection, filler detection, caption grouping, zoom planning) with synthetic inputs. Ship fixture videos in `fixtures/` for integration tests.
- After each milestone, run `npx expo run:ios` on a physical iPhone (not just the simulator; the simulator has no hardware video encoder and Core ML runs on CPU) and report exact timings.
- When a native API is uncertain, read the Apple docs or the package source before guessing. Do not invent APIs.

---

## 1. Product in one paragraph

**Tenfold** turns raw talking-head clips into finished, post-ready vertical videos, ten at a time. The user picks up to 20 videos from their camera roll, chooses a preset, taps **Edit all**, and every video gets: silences cut, filler words ("um", "uh", "like", "you know") cut, jump cuts hidden with alternating punch-in zooms, word-by-word animated captions in a chosen style, optional auto 9:16 crop, and a clean export to Photos. Each video can then be opened in an editor to fix words, toggle any cut, move captions, or change style. Because processing is on device, Pro is **truly unlimited**: no credits, no minutes, no queue. Tagline: *Drop in 10 clips. Get 10 finished videos.*

Positioning versus competitors (do not copy their names into the UI): CapCut and Captions charge credits or per-minute; Descript is desktop-first; Jumpcut is on-device but single-video; none do a real batch with a preset applied to many clips at once. Tenfold's whole identity is **batch + unlimited + private**.

---

## 2. Stack decisions (final)

| Layer | Choice | Why |
|---|---|---|
| App shell | Expo SDK 57, TypeScript, `expo-router`, New Architecture, Hermes | Fast UI iteration, file-based routing, EAS Build to TestFlight |
| Native engine | Local Expo Module `tenfold-engine` (Swift) exposing an `AsyncFunction` API, events, and one native view | Only way to reach AVFoundation / Core ML / Core Animation properly from Expo |
| Speech engine, primary | **FluidAudio → Parakeet TDT 0.6B v3 (Core ML)** via Swift Package Manager | Native **word-level timestamps**, keeps disfluencies so filler removal works, 25 European languages incl. English/Spanish/French/German/Portuguese, roughly 1 min of audio in about 1–3 s on A17/A18, permissive license, zero API cost |
| Speech engine, fallback | Apple `SpeechAnalyzer` + `SpeechTranscriber` (iOS 26) | Zero download, system model; use when the Parakeet model is not yet downloaded or the language is unsupported. Its `audioTimeRange` is currently **phrase-level**, so when this engine is active, word timings are interpolated by character length inside each phrase and filler removal is disabled |
| Model delivery | Download Parakeet Core ML bundle (~600 MB) on first launch with a progress screen, stored in Application Support, excluded from iCloud backup. Host the model files on your own CDN (Cloudflare R2) so you never depend on Hugging Face uptime | Keeps the App Store binary small |
| Video pipeline | `AVMutableComposition` (cuts) + `AVMutableVideoComposition` + `AVVideoCompositionCoreAnimationTool` (captions + zooms) + `AVAssetExportSession` (HEVC) | Hardware encoded, stable, preview and export share one layer tree |
| Preview | Native Expo view `TenfoldPreviewView` wrapping `AVPlayerLayer` inside a parent layer, with `AVSynchronizedLayer` driving the same caption/zoom layers | WYSIWYG |
| Silence detection | Own RMS energy detector on 16 kHz mono PCM (no third-party) | 30 lines of Swift, fully controllable |
| Face awareness | Vision `VNDetectFaceRectanglesRequest` on 1 frame every 2 s | Zoom anchor follows the face; auto-crop keeps the face |
| State | `zustand` + `expo-sqlite` (projects, transcripts, edits) | Simple, offline |
| Purchases | **Superwall** (`expo-superwall`), the owner's existing account; replaces RevenueCat | Remote paywalls, StoreKit 2 purchases, trials, restore |
| UI libs | `react-native-reanimated`, `react-native-gesture-handler`, `expo-blur`, `expo-linear-gradient`, `expo-haptics`, `@shopify/flash-list`, `expo-font` (Poppins), `expo-image` | Match the reference design |
| Analytics | None in v1. Privacy label: "Data Not Collected" | Selling point |

Explicitly **not** used: `ffmpeg-kit` (retired, binaries pulled), `react-native-video` for the editor preview (cannot draw synchronized captions), `SFSpeechRecognizer` (older, worse, server path has a 1-minute cap), any cloud transcription.

---

## 3. Repository layout

```
tenfold/
  app/                         # expo-router screens
    _layout.tsx
    index.tsx                  # Home / Library
    import.tsx                 # Multi-select picker (native)
    batch/setup.tsx            # Preset + options before "Edit all"
    batch/[batchId].tsx        # Processing queue
    editor/[projectId].tsx     # Single video editor
    editor/captions.tsx        # Caption style sheet (modal)
    paywall.tsx
    settings.tsx
    onboarding.tsx             # 3 slides + model download
  src/
    design/tokens.ts           # colors, radii, type scale, gradients
    design/components/         # GlassCard, Chip, GradientButton, RoundTool, Pill, ProgressRing, Sheet
    state/                     # zustand stores: projects, batch, settings, entitlements
    db/                        # expo-sqlite schema + migrations + repositories
    engine/                    # TS wrapper around the native module + types
    captions/presets.ts        # the caption style presets (also mirrored in Swift)
    batch/queue.ts             # JS-side orchestration of the native queue events
  modules/tenfold-engine/
    expo-module.config.json
    ios/
      TenfoldEngineModule.swift      # Expo Module definition (functions, events, view)
      TenfoldPreviewView.swift       # ExpoView subclass with AVPlayerLayer + AVSynchronizedLayer
      Engine/
        MediaImporter.swift          # PHPicker, copies/links source, probes metadata
        AudioExtractor.swift         # AVAssetReader -> 16 kHz mono Float32 PCM
        Transcriber.swift            # protocol + ParakeetTranscriber + AppleTranscriber
        SilenceDetector.swift
        FillerDetector.swift
        CutPlanner.swift             # merges silence + filler + manual into keep segments
        ZoomPlanner.swift
        FaceTracker.swift
        CaptionGrouper.swift
        CaptionLayerBuilder.swift    # builds the CALayer tree for captions
        CompositionBuilder.swift     # AVMutableComposition + video composition + CA tool
        Exporter.swift
        ThumbnailGenerator.swift
        JobQueue.swift               # actors: analysis queue + export queue
        Models.swift                 # Codable structs shared with JS
      Tests/                          # XCTest for the algorithms
  fixtures/                      # 3 short test videos (clean speech, noisy, music-only)
  eas.json, app.json, package.json
```

`app.json` must set `ios.deploymentTarget: "26.0"` via `expo-build-properties`, bundle id `com.<yourcompany>.tenfold`, `newArchEnabled: true`, and the Info.plist strings listed in section 9.

---

## 4. Native engine: `tenfold-engine`

### 4.1 Public API exposed to JS (Expo Modules API DSL)

```swift
public class TenfoldEngineModule: Module {
  public func definition() -> ModuleDefinition {
    Name("TenfoldEngine")
    Events("onJobProgress", "onJobStateChange", "onModelDownloadProgress")

    AsyncFunction("pickVideos") { (maxCount: Int) -> [ImportedAsset] in ... }   // presents PHPickerViewController
    AsyncFunction("ensureSpeechModel") { () -> SpeechModelStatus in ... }        // downloads Parakeet if missing
    AsyncFunction("enqueueAnalysis") { (projectIds: [String], options: AnalysisOptions) in ... }
    AsyncFunction("getAnalysis") { (projectId: String) -> AnalysisResult in ... }
    AsyncFunction("applyEdits") { (projectId: String, edits: EditDocument) in ... } // rebuilds composition for preview
    AsyncFunction("enqueueExport") { (projectIds: [String], options: ExportOptions) in ... }
    AsyncFunction("cancel") { (jobId: String) in ... }
    AsyncFunction("thumbnails") { (projectId: String, count: Int) -> [String] in ... } // file URLs
    AsyncFunction("deleteProjectFiles") { (projectId: String) in ... }

    View(TenfoldPreviewView.self) {
      Prop("projectId") { (view, id: String) in view.load(projectId: id) }
      Prop("playing") { (view, p: Bool) in view.setPlaying(p) }
      Prop("seekTo") { (view, t: Double) in view.seek(to: t) }
      Events("onTime", "onReady", "onEnd")
    }
  }
}
```

All records are `Codable` Swift structs mirrored 1:1 as TypeScript types in `src/engine/types.ts`. Progress events carry `{jobId, projectId, stage, fraction}` where `stage ∈ extractingAudio | transcribing | detecting | planning | rendering | exporting | saving`.

### 4.2 Import (`MediaImporter`)

- Use `PHPickerViewController` with `filter = .videos`, `selectionLimit = 20`, `preferredAssetRepresentationMode = .current` (no transcoding). PHPicker needs **no photo library permission**.
- For each result, load the file representation with `NSItemProvider.loadFileRepresentation`, copy into `Application Support/Tenfold/projects/<uuid>/source.mov`. Show per-item progress because iCloud-only videos download first.
- Probe with `AVURLAsset`: duration, natural size, preferred transform (rotation), frame rate, whether the video track is HDR (`hasMediaCharacteristic(.containsHDRVideo)`), audio track presence.
- Reject > 10 minutes in v1 with a friendly message. Skip no-audio clips in the silence/caption steps but still allow crop/export.

### 4.3 Audio extraction (`AudioExtractor`)

`AVAssetReader` with `AVAssetReaderAudioMixOutput`, output settings Linear PCM Float32, 16 000 Hz, mono, non-interleaved. Return `[Float]` plus sample rate. Also compute a 20 ms RMS envelope array once and reuse it for silence detection and the timeline waveform.

### 4.4 Transcription (`Transcriber` protocol)

```swift
protocol Transcriber { func transcribe(pcm16k: [Float], locale: Locale) async throws -> Transcript }
struct Word: Codable { let text: String; let start: Double; let end: Double; let confidence: Float; var isFiller: Bool }
struct Transcript: Codable { let words: [Word]; let language: String; let engine: String; let wordTimingIsExact: Bool }
```

- `ParakeetTranscriber`: FluidAudio `AsrManager` with Parakeet TDT v3, word timestamps enabled, batch mode. Chunk audio into ≤ 30 s windows with 1 s overlap, merge on word boundaries, dedupe overlap words by time. `wordTimingIsExact = true`.
- `AppleTranscriber`: `SpeechAnalyzer` + `SpeechTranscriber(locale:, transcriptionOptions: [], reportingOptions: [], attributeOptions: [.audioTimeRange, .transcriptionConfidence])`, feed via `AnalyzerInput` from an `AVAudioPCMBuffer`; call `AssetInventory.assetInstallationRequest` first. Split each attributed run into words and interpolate start/end across the run's `audioTimeRange` by character count. `wordTimingIsExact = false`.
- Engine selection: Parakeet if model present and language supported, else Apple. Expose engine name in the editor's info sheet.
- Language: auto from the device locale, overridable per batch.
- Run transcriptions **serially** through one actor (one model in memory at a time).

### 4.5 Silence detection (`SilenceDetector`)

Inputs: RMS envelope (20 ms frames), transcript. Algorithm:
1. Noise floor = 10th percentile of frame RMS (in dB). Speech threshold = max(noiseFloor + 12 dB, −38 dBFS).
2. A frame is "quiet" if below threshold. A silence = run of quiet frames ≥ `minSilence` (preset: Light 0.6 s, Medium 0.4 s, Aggressive 0.25 s).
3. Shrink each silence by `padding` on both sides (preset: 0.12 / 0.08 / 0.05 s) so consonants are not clipped. Never cut inside a transcript word.
4. Keep at most `maxGapKept` of each silence (0.15 s) instead of removing all of it, so speech still breathes.
5. Output `[Cut]` with `reason = .silence`.

Safety rule: if speech covers < 20 % of the clip (music-only, b-roll), skip silence and filler removal entirely and flag the project "no speech detected".

### 4.6 Filler detection (`FillerDetector`)

- Lexical list, English v1: `um, uh, uhm, er, ah, hmm, mm, like (only when between two commas or followed by a pause ≥ 0.2 s), you know, I mean, sort of, kind of, basically, literally, right? (sentence-final)`. Keep the list in `FillerLexicon.swift` keyed by language, ship English + Spanish (`eh, este, o sea, pues`).
- Match normalised word text (lowercase, strip punctuation). Multi-word fillers use a sliding window.
- Acoustic fallback when the active engine drops fillers (Apple engine, or any gap): a gap between consecutive words ≥ 0.25 s **whose RMS is above the speech threshold for ≥ 60 % of its frames** is a "voiced non-word" → candidate filler, confidence 0.6, shown in the editor as a dashed cut the user can accept or reject. Preset "Aggressive" accepts them automatically.
- Cut range = word.start − 0.03 to word.end + 0.03, snapped so it never overlaps a kept word.

### 4.7 Cut planning (`CutPlanner`)

Merge silence cuts, filler cuts and manual cuts into a sorted, non-overlapping list; invert to `keepSegments: [TimeRange]`. Drop any keep segment shorter than 0.18 s (merge into neighbour). Store both the cuts (with reason and `accepted: Bool`) and the derived keep segments so the editor can toggle any single cut.

### 4.8 Zoom planning (`ZoomPlanner`)

Produce `[ZoomEvent] { at: Double (composition time), scale: 1.0 | 1.12 | 1.18, anchor: CGPoint (normalised), easeMs: 140 }`.
- At every cut boundary alternate 1.00 → 1.12 → 1.00 to mask the jump (this is what hides the cut).
- Additional punch-in at the first word of a sentence (transcript punctuation or gap ≥ 0.7 s) when the previous zoom is ≥ 1.4 s ago. Preset "Off / Subtle / Dynamic" maps to none / cuts only / cuts + sentences.
- Anchor = face centroid from `FaceTracker` (Vision, one frame per 2 s, exponential smoothing); default (0.5, 0.42) if no face.
- Zooms are implemented as `CAKeyframeAnimation` on the **video container layer** `transform.scale` and `position`, with `.easeOut` timing, `beginTime` set in composition time, `isRemovedOnCompletion = false`, `fillMode = .forwards`. Same animation objects feed preview and export.

### 4.9 Caption grouping (`CaptionGrouper`)

Words → caption "cards":
- Max 4 words per card in Karaoke/Pop styles, max 22 characters per line, max 2 lines, max card duration 2.2 s, min 0.6 s.
- Break on punctuation, on gaps ≥ 0.35 s, or when limits hit.
- Card times use the composition timeline (after cuts), not source time: build a `TimeMapper` that converts source → composition time through the keep segments.
- Each card carries its words with composition-time start/end for per-word highlight.

### 4.10 Caption rendering (`CaptionLayerBuilder`)

Build one `CALayer` tree per project:
```
overlayLayer (video size, e.g. 1080×1920)
  ├─ videoContainerLayer  (zoom animations live here; contains videoLayer)
  └─ captionsLayer
       └─ cardLayer × N   (opacity keyframes: 0 before start, 1 during, 0 after)
            └─ wordLayer × M (CATextLayer, contentsScale 3, custom font via CTFont)
                 animations: foregroundColor (base → active → base), transform.scale pop 1.0→1.08→1.0 over 120 ms, optional background pill via a sibling CAShapeLayer
```
- Fonts bundled: Poppins (Bold/SemiBold), Inter Black, Bebas Neue, Montserrat ExtraBold, SF Pro Rounded (system). Register with `CTFontManagerRegisterFontsForURL`.
- Style presets (mirror in `captions/presets.ts`): **Pop** (bold white, active word yellow, stroke 6 px black, scale pop), **Karaoke** (white, active word gradient fill, subtle glow), **Boxed** (white text on rounded dark pill, active word lighter), **Outline** (uppercase Bebas, thick outline, no fill change), **Minimal** (SemiBold white, active underline), **Subtle** (small sans, bottom, no animation). Each preset: font, size (relative to width, default 0.052 × width), colours, stroke, shadow, uppercase flag, position (0..1 vertical, default 0.66 for TikTok/Reels safe zone), animation type, max words per card.
- Emphasis: the loudest word per card (from RMS) gets +10 % size in Pop and Karaoke.
- Safe zone: default vertical position keeps captions above the bottom 30 % and below the top 12 % of the frame (TikTok UI overlap). Show a translucent safe-zone guide in the editor.
- Everything must be deterministic from the `EditDocument` so preview and export match.

### 4.11 Composition (`CompositionBuilder`)

- `AVMutableComposition`: for each keep segment `insertTimeRange` for video and audio tracks. Apply the source `preferredTransform` in a single `AVMutableVideoCompositionLayerInstruction` so portrait videos come out upright.
- Render size: source size, or 1080×1920 when auto-crop 9:16 is on (crop rect follows smoothed face centre; landscape sources get a face-following pan via `setTransform` per instruction).
- **HDR rule:** iPhones record Dolby Vision/HLG by default and `AVVideoCompositionCoreAnimationTool` does not colour-manage layers, so text goes wrong over HDR. Set the video composition to SDR: `colorPrimaries = ITU_R_709_2`, `colorTransferFunction = ITU_R_709_2`, `colorYCbCrMatrix = ITU_R_709_2`. TikTok/Instagram flatten to SDR anyway. Add a Settings toggle "Keep HDR (no captions)" for users who insist.
- Frame duration = source frame rate (30 or 60 fps). `renderScale = 1`.
- Audio: `AVMutableAudioMix` with a 10 ms fade at every cut boundary to avoid clicks. "Normalize loudness" is v1.1 (AVAudioEngine offline render + measured gain), not v1.
- Preview: `AVPlayerItem(asset: composition)` with `videoComposition` (without the CA tool) and an `AVSynchronizedLayer(playerItem:)` that hosts a **clone** of the caption/zoom layer tree. Export: the same builder output wrapped in `AVVideoCompositionCoreAnimationTool(postProcessingAsVideoLayer:in:)`. The builder function must be pure: `func buildLayers(doc: EditDocument, renderSize: CGSize) -> (overlay: CALayer, video: CALayer)` called twice.

### 4.12 Export (`Exporter`)

- `AVAssetExportSession(asset:, presetName: AVAssetExportPresetHEVCHighestQuality)`; if the user picks 4K and source ≥ 2160p use the 3840×2160 HEVC preset. Output `.mp4`, `shouldOptimizeForNetworkUse = true`. Use the iOS 18+ async `export(to:as:)` and `states()` for progress.
- Watermark: on the free tier, add a small "Tenfold" `CATextLayer` bottom-right (opacity 0.7) to the export layer tree only.
- Save with `PHPhotoLibrary.shared().performChanges { PHAssetChangeRequest.creationRequestForAssetFromVideo(atFileURL:) }` into a "Tenfold" album (add-only permission). Keep the file in the project folder until the user deletes the project.
- One export at a time (hardware encoder); overlap with the next project's analysis.

### 4.13 Job queue (`JobQueue`)

Two actors: `AnalysisQueue` (serial) and `ExportQueue` (serial). A batch = list of project ids; the pipeline pumps analysis of project N+1 while project N exports. Cancellation via `Task` cancellation checked between stages. Keep `UIApplication.shared.isIdleTimerDisabled = true` while a batch runs and request `beginBackgroundTask` to finish the current export if the app goes to background; persist queue state so a killed app resumes from the last completed stage on relaunch. Emit `onJobStateChange` for `queued | analyzing | ready | exporting | done | failed(reason)`.

### 4.14 Preview view (`TenfoldPreviewView`)

`ExpoView` subclass. Owns `AVPlayer`, `AVPlayerLayer` inside `videoContainerLayer`, `AVSynchronizedLayer`. Reloads when `projectId` or the edit document changes (debounced 150 ms). Reports `onTime` at 30 Hz for the transcript highlight and timeline playhead. Aspect-fit inside its bounds with the reference design's 28 pt corner radius.

---

## 5. App (React Native / Expo)

### 5.1 Design system (dark cinematic theme, updated 2026-09-26)

> Supersedes the original pastel glassmorphism direction. Reference: `docs/design-reference-v2.png` (kept locally, not committed). Tokens: `src/design/tokens.ts`.

- **Canvas:** near-black `#0A090E` with a soft plum `rgba(120,36,92,0.55)` / violet `rgba(76,40,140,0.45)` glow bleeding in from the top (`Background`).
- **Surfaces:** cards `#15141B` (raised `#1C1B23`), 1 px border `rgba(255,255,255,0.08)`, radius 24 (tiles 20), continuous corners. Dashed variant for the clip drop zone.
- **Primary CTA:** gradient violet `#7C4DFF` → magenta `#C94FC0` → orange `#FF7A30`, 56 pt, radius 20 (or full pill for bottom CTAs), sparkles icon, optional trailing arrow.
- **Secondary:** hairline outline buttons (`rgba(255,255,255,0.18)`), and a violet-tinted variant for suggestion actions.
- **Controls:** outlined circle back button; chips 40 pt, dark fill with hairline border, selected = white with dark text; outlined pill toggles; line-icon tool buttons with small labels.
- **Tiles:** image tiles with the label underneath; selected tile gets a violet `#A98BFF` border and glow.
- **Navigation:** floating frosted pill tab bar (Home, Library, Create action, Settings); the active tab is a white rounded square.
- **Type:** Poppins. Hero 32 SemiBold (−0.6 tracking), Display 30, Title 22 Medium, Section 19 Medium, Body 15, Label 13, Caption 12.
- **Editor:** header (back, title, outlined Export, more), preview card with an "Auto-edited" badge, transport row (undo/redo, play, fullscreen), tool row (Cuts, Words, Captions, Zoom, Crop, Audio), timeline (ruler, keep-segment clips with a trim handle at every cut, caption track, waveform, white playhead), then a suggestion card or the active tool's panel.
- **Motion:** reanimated springs (damping 18, stiffness 160), staggered `FadeInDown` on entry, press scale 0.97 with haptics, onboarding steps slide.

### 5.2 Screens

1. **Onboarding** (first launch): 3 slides (Batch, Unlimited, Private) → "Download speech model (600 MB, one time)" with progress ring; allow skip (falls back to Apple engine, shows a banner in Home until downloaded).
2. **Home / Library** (`index`): header "Tenfold", search, grid of batches (cover = first video thumb, count badge "10 videos", status ring). Empty state: big gradient **New batch** button. Bottom tab: Library, Settings.
3. **Import**: native picker (max 20). Returns to **Batch setup** with a horizontal thumbnail row (each thumb shows duration; long-press to remove).
4. **Batch setup** (mirrors reference screen 2): glass card stack, collapsible sections:
   - **Preset** chips: Clean Talk, Punchy, Podcast, Story, Custom.
   - **Captions** chips: Pop, Karaoke, Boxed, Outline, Minimal, Subtle, Off; font chips; colour dots; position slider (with safe-zone hint).
   - **Cleanup**: Silence (Off/Light/Medium/Aggressive), Fillers (Off/Standard/Aggressive), language chip (auto).
   - **Zoom & Crop**: Zoom (Off/Subtle/Dynamic), Auto 9:16 crop toggle, face follow toggle.
   - **Audio**: keep original / normalize (v1.1) / mute.
   - Gradient button **Edit all 10 videos** (count live). Free tier shows "3 of 3 free exports left" above it.
5. **Processing** (`batch/[id]`): list rows with thumb, title, stage label, progress bar, ETA; overall ring at top; "Runs on your iPhone. Keep the app open." Row tap → editor once `ready`. Buttons: Pause, Cancel batch, **Export all** (enabled when all ready) or auto-export toggle set in setup.
6. **Editor** (`editor/[id]`, mirrors reference screen 1): `TenfoldPreviewView` top (60 % height), transport (play, −1 s, +1 s, time), **transcript strip** under it (words as chips; removed words struck through in red, filler candidates dashed; tap toggles cut; long-press edits text; fixes propagate to captions), **timeline** filmstrip with cut markers, then four round tools: **Cuts** (sheet: silence/filler sliders, "restore all"), **Captions** (style sheet), **Zoom** (mode + intensity), **Export** (quality, watermark notice, save/share). Undo/redo in the header. Changes call `applyEdits` (debounced) and re-render preview.
7. **Caption style sheet**: live preview thumbnail of each preset using the project's own words, font row, colour row, size stepper, position drag handle over a mini frame.
8. **Export/Share**: progress, then "Saved to Photos" with buttons: Open in TikTok (uses `tiktok://` URL scheme if installed, otherwise Photos), Share sheet (`expo-sharing`), Done.
9. **Paywall** (mirrors reference screen 3): title **"Edit Without Limits"**, subtitle "Batch edit unlimited videos on your iPhone. No credits. No uploads.", Monthly | Yearly (save 58 %) pill, feature rows with icons: **Unlimited exports** (no credits, ever), **Batches of 20** (free: 10), **No watermark**, **4K export**, **All caption styles**. Price block "$49.99/year", "Billed annually. Cancel anytime." Gradient button "Start 7-day free trial". Small links: Restore, Terms, Privacy. Driven by Superwall (paywall configured in the Superwall dashboard, matching this design); never hardcode prices in UI text.
10. **Settings**: speech model (installed / download / delete), engine in use, default preset, keep HDR toggle, storage used + clear exports, Manage subscription, Privacy ("Nothing leaves your phone").

### 5.3 Free vs Pro (enforced in JS, checked in native before export)

Free: 3 exports per month, batches up to 10, watermark, 1080p, 3 caption styles. Pro: unlimited everything, no watermark, 4K, all styles. Products: `tenfold_pro_monthly` $9.99, `tenfold_pro_yearly` $49.99 with 7-day trial. Entitlement id `pro`.

---

## 6. Data model (SQLite via expo-sqlite; JSON columns for documents)

```
batches(id, createdAt, presetJson, status)
projects(id, batchId, sourcePath, title, durationSec, width, height, fps, isHDR, hasAudio,
         status, engine, transcriptJson, analysisJson, editDocJson, exportPath, exportedAt, errorText)
settings(key, value)
```

`EditDocument` (single source of truth for rendering):
```ts
{ version: 1,
  cuts: { id, start, end, reason: 'silence'|'filler'|'manual', accepted: boolean, confidence }[],
  wordOverrides: { wordIndex, text }[],
  captions: { styleId, font, sizeScale, colors: {base, active, stroke, bg}, position: {y}, uppercase, maxWords, enabled },
  zoom: { mode: 'off'|'subtle'|'dynamic', intensity: 1|2|3, faceFollow: boolean },
  crop: { auto916: boolean },
  audio: { mode: 'original'|'normalize'|'mute' } }
```

---

## 7. Performance targets (physical iPhone 15 Pro or newer; report actuals)

| Step | Target per 60 s clip |
|---|---|
| Audio extraction | < 1 s |
| Parakeet transcription | < 4 s (Apple engine < 8 s) |
| Silence + filler + zoom planning | < 0.3 s |
| Preview rebuild after an edit | < 250 ms |
| 1080p60 HEVC export with captions | < 35 s |
| 10 × 90 s batch, end to end | < 9 min, phone stays under thermal throttling (check `ProcessInfo.thermalState`, pause exports at `.serious`) |

Memory: never hold more than one decoded audio array and one composition in memory; release the Core ML model only when the app backgrounds for > 2 min.

---

## 8. Edge cases to handle explicitly

Portrait vs landscape sources; rotation metadata; 60 fps; HDR (section 4.11); videos with no speech; music under speech (raise threshold using the noise floor); multiple speakers (no diarisation in v1); very fast speech (cards capped by duration); clips shorter than 3 s; iCloud downloads failing; Low Power Mode (show a warning, keep going); insufficient storage (need 2 × source size free before export); app killed mid-batch (resume); model download interrupted (resumable `URLSessionDownloadTask`); unsupported language (Apple engine only, filler removal off); user denies Photos add permission (offer Share sheet instead).

---

## 9. Permissions and App Store

Info.plist: `NSPhotoLibraryAddUsageDescription` ("Tenfold saves your finished videos to Photos."), `NSSpeechRecognitionUsageDescription` ("Tenfold transcribes your videos on your iPhone to add captions and cut silences."), `NSMicrophoneUsageDescription` only if a record feature is added later (not v1). No special entitlements, no background modes beyond the default. Privacy nutrition label: Data Not Collected. App Review notes: "All processing is on device; a 600 MB speech model is downloaded on first launch from our CDN; no account required." Category: Photo & Video. Name on the store: **Tenfold: Batch AI Video Editor**. Subtitle: **Captions, cuts & zooms, 10 at once**.

---

## 10. Milestones (build in this order; each has a demo and acceptance criteria)

**M0 Scaffold (day 1–2):** Expo 57 app, router, design tokens, GlassCard/Chip/GradientButton/RoundTool components, static versions of all screens with mock data matching the reference design. Local module compiles and returns `"pong"`. `npx expo run:ios` on device works.

**M1 Import + analysis (week 1):** PHPicker, source copy, metadata probe, audio extraction, Parakeet model download + transcription with word timestamps, Apple fallback, silence/filler/zoom planners with unit tests. Acceptance: a fixture clip returns a transcript JSON with word times within ±80 ms of a hand-checked reference, and the cut list matches expectations.

**M2 Preview (week 2):** Composition builder, caption layer builder, `TenfoldPreviewView` with synchronized layers, editor screen wired (toggle cut, edit word, change style) with < 250 ms rebuild. Acceptance: captions highlight in sync at 1× and after scrubbing; a zoom hides a cut.

**M3 Export (week 3):** Exporter with CA tool, SDR handling, watermark, save to Photos album, share. Acceptance: export frame at t matches preview frame at t (screenshot compare), plays in the TikTok upload flow.

**M4 Batch queue (week 4):** Analysis + export actors, processing screen with live progress, resume after kill, thermal pause, "Export all". Acceptance: 10 fixture clips complete unattended.

**M5 Monetization + polish (week 5):** Superwall, paywall, free limits, onboarding, settings, empty states, haptics, accessibility labels, App Store screenshots, EAS Build to TestFlight.

---

## 11. Do not

- Do not use Expo Go, `ffmpeg-kit`, `react-native-video` for the editor, `SFSpeechRecognizer`, or any cloud API.
- Do not render captions in React Native; do not burn captions with a second pass; do not re-encode twice.
- Do not draw over HDR without converting the composition to SDR.
- Do not hardcode prices; do not add analytics/tracking SDKs; do not ask for full Photos read permission (PHPicker only, add-only for saving).
- Do not put the 600 MB model in the app bundle.
- Do not block the JS thread: every engine call is `AsyncFunction` on a background actor.

---

## 12. Assumptions you may change only by asking

- English + Spanish filler lexicons in v1; other languages captions only.
- Speech engine order is under review (2026-09-26): the owner prefers Apple's built-in `SpeechTranscriber` (no 600 MB download). M1 builds the Apple engine first and measures word-timing accuracy and filler retention on the owner's fixture clips; Parakeet is added only if Apple falls short.
- Parakeet TDT v3 via FluidAudio was the planned primary engine; if its licence or size turns out unacceptable, WhisperKit (`whisperkit` Swift package, `DecodingOptions(wordTimestamps: true)`, `large-v3-turbo` or `base` model) is the drop-in replacement behind the same `Transcriber` protocol.
- Apple's `SpeechTranscriber` gives phrase-level `audioTimeRange` on iOS 26; if a later iOS exposes true per-word ranges, set `wordTimingIsExact = true` for it and re-enable filler removal on that engine.

---

## 13. Implementation notes (deviations, 2026-09-26)

Decided during the build; each keeps the spec's intent.

- **Speech:** Apple `SpeechAnalyzer` + `SpeechTranscriber` only (owner's choice; no 600 MB download). Word timing is taken from per-run `audioTimeRange`; `wordTimingIsExact` is set when ≥ 90 % of timed runs are single words, which is measured per clip and shown in the editor's ⋯ sheet (runs, % single-word, fillers found). Parakeet can still be added behind the `Transcriber` protocol.
- **Bridge:** structured values cross the Expo bridge as JSON strings (Swift `Codable` ↔ TS types) instead of Expo `Record`s.
- **Queue:** orchestrated in JS (`src/batch/queue.ts`) with two serial lanes (analysis, export), resume after kill and thermal pause; native functions are plain `AsyncFunction`s, cancellable by project id.
- **Storage:** the batch/project/edit index is a zustand store persisted in `expo-sqlite/kv-store`; per-project media, analysis JSON, thumbnails and exports live in `Application Support/Tenfold/projects/<id>/`.
- **Zoom and crop:** rendered as `AVMutableVideoCompositionLayerInstruction` transforms (instant at cuts, eased at sentence punch-ins, face-follow pans), shared by the preview player item and the export, instead of Core Animation keyframes on a container layer.
- **Captions:** each word is rasterised with CoreText into an image-backed `CALayer`, because `CATextLayer` does not render in offline `AVVideoCompositionCoreAnimationTool` exports. The same tree is built for the preview (`AVSynchronizedLayer`) and the export.
- **Planning:** the plan (keep segments, zoom events, caption cards) is computed natively (`plan`) and used by the JS timeline, so the timeline can't drift from what is rendered. `suggestCuts` re-runs silence/filler detection at a new strength without re-transcribing.
- **Photos:** saved with add-only access to the camera roll; the "Tenfold" album isn't created (add-only can't create albums).
- **Routes** live in `src/app/` (SDK 57 template).
- **Tests:** `modules/tenfold-engine/scripts/test-core.sh` (55 checks on the pure core) and `scripts/test-render.sh` (synthetic clip → analysis → HEVC export with every caption style) run on a Mac without Xcode.
