import Foundation

// Plain test runner for the pure engine core (no XCTest needed).
// Run: modules/tenfold-engine/scripts/test-core.sh

nonisolated(unsafe) var failures = 0
nonisolated(unsafe) var passes = 0

func check(_ cond: @autoclosure () -> Bool, _ msg: String, file: String = #file, line: Int = #line) {
  if cond() { passes += 1 } else {
    failures += 1
    print("  FAIL \(msg)  (\((file as NSString).lastPathComponent):\(line))")
  }
}

func near(_ a: Double, _ b: Double, _ tol: Double = 0.021) -> Bool { abs(a - b) <= tol }

func test(_ name: String, _ body: () throws -> Void) {
  print("• \(name)")
  do { try body() } catch {
    failures += 1
    print("  FAIL threw \(error)")
  }
}

/// Envelope builder: list of (duration, dB) spans at 20 ms frames.
func env(_ spans: [(Double, Float)]) -> [Float] {
  spans.flatMap { Array(repeating: $0.1, count: Int(($0.0 / Envelope.frameSec).rounded())) }
}

func w(_ t: String, _ s: Double, _ e: Double) -> Word { Word(text: t, start: s, end: e) }

@main
struct CoreTests {
  static func main() {
    test("envelope computes dBFS per 20 ms") {
      let sr = 16000.0
      let tone = (0..<16000).map { Float(0.5 * sin(Double($0) * 2 * .pi * 220 / sr)) }
      let e = Envelope.compute(samples: tone + [Float](repeating: 0, count: 8000), sampleRate: sr)
      check(e.count == 75, "75 frames for 1.5 s, got \(e.count)")
      check(abs(Double(e[10]) - (-9.03)) < 0.5, "sine 0.5 peak ≈ −9 dBFS RMS, got \(e[10])")
      check(e.last == Envelope.floorDb, "silence hits the floor")
    }

    test("speech levels: floor, threshold, coverage") {
      let e = env([(1, -60), (3, -20), (1, -60)])
      let l = SpeechLevels.measure(e)
      check(near(l.noiseFloorDb, -60, 0.01), "floor −60, got \(l.noiseFloorDb)")
      check(near(l.thresholdDb, -38, 0.01), "threshold clamps to −38, got \(l.thresholdDb)")
      check(near(l.coverage, 0.6, 0.01), "60% speech")
    }

    test("silence detector: pauses are shortened to a natural beat, not deleted") {
      // speech 0–2, pause 2–3, speech 3–5, short pause 5–5.3, speech 5.3–7
      let e = env([(2, -20), (1, -70), (2, -20), (0.3, -70), (1.7, -20)])
      let words = [w("a", 0.1, 1.9), w("b", 3.1, 4.9), w("c", 5.4, 6.9)]
      let l = SpeechLevels.measure(e)
      let cuts = SilenceDetector.detect(envelope: e, levels: l, words: words, params: SilenceParams.forLevel(.medium)!)
      check(cuts.count == 1, "one cut, got \(cuts.count)")
      if let c = cuts.first {
        check(near(c.start, 2.15), "medium keeps 0.3 s: starts at \(c.start)")
        check(near(c.end, 2.85), "ends at \(c.end)")
        check(c.reason == .silence && c.accepted, "accepted silence")
      }
      let light = SilenceDetector.detect(envelope: e, levels: l, words: words, params: SilenceParams.forLevel(.light)!)
      check(light.count == 1 && near(light[0].start, 2.2), "light keeps 0.4 s")
      let aggr = SilenceDetector.detect(envelope: e, levels: l, words: words, params: SilenceParams.forLevel(.aggressive)!)
      check(aggr.count == 1, "aggressive leaves the 0.3 s pause alone (min 0.3, keep 0.2), got \(aggr.count)")
      // A pause after a sentence end keeps a longer beat.
      let sentence = [w("done.", 0.1, 1.9), w("b", 3.1, 4.9), w("c", 5.4, 6.9)]
      let sc = SilenceDetector.detect(envelope: e, levels: l, words: sentence, params: SilenceParams.forLevel(.medium)!)
      check(sc.count == 1 && near(sc[0].start, 2.225), "sentence end keeps 0.45 s: starts at \(sc.first?.start ?? -1)")
    }

    test("retake detector: cuts the earlier attempt, ignores deliberate repetition") {
      func line(_ text: String, from t0: Double, step: Double = 0.3) -> [Word] {
        text.split(separator: " ").enumerated().map { i, t in w(String(t), t0 + Double(i) * step, t0 + Double(i) * step + 0.25) }
      }
      // Exact retake of 6 words → applied automatically.
      var words = line("so today we are going to", from: 0) + line("so today we are going to talk about it.", from: 2.5)
      var cuts = RetakeDetector.detect(words: words)
      check(cuts.count == 1 && cuts[0].accepted && cuts[0].reason == .retake, "exact retake auto-applied (\(cuts.count))")
      if let c = cuts.first { check(c.start < 0.1 && near(c.end, 2.47, 0.01), "cut spans the first attempt \(c.start)–\(c.end)") }
      // False start with a stumble ("we we-"), then the full sentence.
      words = line("so today we are we", from: 0) + line("so today we are going to talk.", from: 2.2)
      cuts = RetakeDetector.detect(words: words)
      check(cuts.count == 1, "stumbled false start found (\(cuts.count))")
      check(cuts.first?.accepted == false, "a 4-word match is a suggestion, not applied")
      // Deliberate repetition: too few distinct words.
      cuts = RetakeDetector.detect(words: line("no no no no no no", from: 0))
      check(cuts.isEmpty, "'no no no' is not a retake")
      // Same sentence said again 20 s later is not a retake.
      words = line("thanks for watching this one", from: 0) + line("thanks for watching this one", from: 25)
      check(RetakeDetector.detect(words: words).isEmpty, "far-apart repeat is not a retake")
      // Fillers between attempts don't break the match.
      var withUm = line("so today we are going to", from: 0)
      var um = w("um", 1.9, 2.1); um.isFiller = true
      withUm.append(um)
      withUm += line("so today we are going to talk.", from: 2.3)
      check(RetakeDetector.detect(words: withUm).count == 1, "fillers are ignored when matching")
    }

    test("silence detector never cuts inside a word") {
      let e = env([(1, -20), (1, -70), (1, -20)])
      let words = [w("quiet", 0.9, 1.6)]  // a soft word spoken inside the quiet run
      let cuts = SilenceDetector.detect(envelope: e, levels: SpeechLevels.measure(e), words: words, params: SilenceParams.forLevel(.aggressive)!)
      for c in cuts { check(c.end <= 0.9 || c.start >= 1.6, "cut \(c.start)–\(c.end) avoids the word") }
    }

    test("leading and trailing silence are trimmed") {
      let e = env([(1, -70), (2, -20), (1, -70)])
      let cuts = SilenceDetector.detect(envelope: e, levels: SpeechLevels.measure(e), words: [], params: SilenceParams.forLevel(.medium)!)
      check(cuts.count == 2, "two edge cuts")
      if cuts.count == 2 {
        check(cuts[0].start == 0, "starts at 0")
        check(near(cuts[1].end, 4), "ends at clip end")
      }
    }

    test("filler detector: lexical um/uh accepted, soft markers are candidates") {
      let words = [w("So", 0, 0.2), w("um,", 0.3, 0.5), w("this", 0.6, 0.8), w("is,", 0.9, 1.0), w("you", 1.1, 1.2), w("know,", 1.2, 1.4), w("great.", 1.5, 1.9)]
      let e = env([(2, -20)])
      let r = FillerDetector.detect(words: words, language: "en", envelope: e, levels: SpeechLevels.measure(e), level: .standard, acoustic: false)
      check(r.cuts.count == 2, "um + you know, got \(r.cuts.count)")
      check(r.cuts.first?.accepted == true, "um accepted on standard")
      check(r.cuts.last?.accepted == false, "you know is a candidate on standard")
      check(r.words[1].isFiller && r.words[4].isFiller && r.words[5].isFiller, "fillers marked")
      if let c = r.cuts.first { check(c.start >= 0.2 - 1e-9 && c.end <= 0.6 + 1e-9, "um cut stays between neighbours") }
      let aggr = FillerDetector.detect(words: words, language: "en", envelope: e, levels: SpeechLevels.measure(e), level: .aggressive, acoustic: false)
      check(aggr.cuts.allSatisfy(\.accepted), "aggressive accepts candidates")
      let off = FillerDetector.detect(words: words, language: "en", envelope: e, levels: SpeechLevels.measure(e), level: .off, acoustic: false)
      check(off.cuts.isEmpty, "off does nothing")
    }

    test("filler 'like' rule") {
      let e = env([(4, -20)])
      let l = SpeechLevels.measure(e)
      let verb = [w("I", 0, 0.1), w("like", 0.15, 0.4), w("pizza", 0.45, 0.8)]
      check(FillerDetector.detect(words: verb, language: "en", envelope: e, levels: l, level: .aggressive, acoustic: false).cuts.isEmpty, "verb 'like' kept")
      let filler = [w("it's,", 0, 0.2), w("like,", 0.3, 0.5), w("huge", 0.6, 0.9)]
      check(FillerDetector.detect(words: filler, language: "en", envelope: e, levels: l, level: .aggressive, acoustic: false).cuts.count == 1, "comma-wrapped 'like' cut")
      let pause = [w("it's", 0, 0.2), w("like", 0.3, 0.5), w("huge", 0.9, 1.1)]
      check(FillerDetector.detect(words: pause, language: "en", envelope: e, levels: l, level: .aggressive, acoustic: false).cuts.count == 1, "'like' + pause cut")
    }

    test("acoustic filler candidates for voiced gaps") {
      // Words at 0–0.5 and 1.0–1.5; the gap 0.5–1.0 is loud (a dropped "uhh").
      let e = env([(1.5, -20), (0.5, -70)])
      let words = [w("hello", 0, 0.5), w("there", 1.0, 1.5)]
      let r = FillerDetector.detect(words: words, language: "en", envelope: e, levels: SpeechLevels.measure(e), level: .standard, acoustic: true)
      check(r.cuts.count == 1 && r.cuts[0].confidence == 0.6 && !r.cuts[0].accepted, "voiced gap is a dashed candidate")
    }

    test("spanish lexicon") {
      let e = env([(2, -20)])
      let words = [w("eh", 0, 0.2), w("o", 0.3, 0.4), w("sea", 0.4, 0.6), w("bien", 0.7, 0.9)]
      let r = FillerDetector.detect(words: words, language: "es-ES", envelope: e, levels: SpeechLevels.measure(e), level: .aggressive, acoustic: false)
      check(r.cuts.count == 2, "eh + o sea, got \(r.cuts.count)")
    }

    test("cut planner merges, inverts and drops slivers") {
      let cuts = [
        Cut(id: "a", start: 1, end: 2, reason: .silence, accepted: true, confidence: 1),
        Cut(id: "b", start: 1.5, end: 2.5, reason: .filler, accepted: true, confidence: 1),
        Cut(id: "c", start: 2.6, end: 3, reason: .manual, accepted: true, confidence: 1),  // leaves a 0.1 s sliver
        Cut(id: "d", start: 5, end: 6, reason: .filler, accepted: false, confidence: 0.6),
      ]
      let keep = CutPlanner.keepSegments(cuts: cuts, duration: 8)
      check(keep == [TimeRange(start: 0, end: 1), TimeRange(start: 3, end: 8)], "keep \(keep)")
    }

    test("time mapper round-trips") {
      let m = TimeMapper(keep: [TimeRange(start: 0, end: 1), TimeRange(start: 3, end: 8)])
      check(near(m.compDuration, 6, 1e-9), "6 s long")
      check(near(m.toComp(4), 2, 1e-9), "4 → 2")
      check(near(m.toComp(2), 1, 1e-9), "cut time snaps forward")
      check(near(m.toSource(2.5), 4.5, 1e-9), "2.5 → 4.5")
      check(m.isKept(3.5, 4) && !m.isKept(1.2, 2.8), "kept checks")
    }

    test("zoom planner alternates at cuts and respects mode") {
      let m = TimeMapper(keep: [TimeRange(start: 0, end: 2), TimeRange(start: 3, end: 5), TimeRange(start: 6, end: 9)])
      let words = [w("Hello.", 0.2, 0.8), w("Next", 1.8, 2.0), w("idea", 3.2, 3.6), w("here.", 3.7, 4.0), w("Then", 6.2, 6.5), w("more", 7.4, 7.8)]
      let off = ZoomPlanner.plan(mapper: m, words: words, faces: [], settings: ZoomSettings(mode: .off))
      check(off.count == 1 && off[0].scale == 1, "off = identity only")
      let subtle = ZoomPlanner.plan(mapper: m, words: words, faces: [], settings: ZoomSettings(mode: .subtle, intensity: 2))
      check(subtle.map(\.scale) == [1, 1.12, 1], "alternates at the 2 cuts, got \(subtle.map(\.scale))")
      check(subtle.dropFirst().allSatisfy { $0.ramp == 0 }, "cut zooms are instant")
      check(near(subtle[1].at, 2, 1e-9) && near(subtle[2].at, 4, 1e-9), "at cut boundaries")
      let dyn = ZoomPlanner.plan(mapper: m, words: words, faces: [], settings: ZoomSettings(mode: .dynamic, intensity: 3))
      check(dyn.count > subtle.count, "dynamic adds sentence punch-ins")
      check(dyn.contains { $0.scale == 1.18 }, "intensity 3 uses 1.18")
      let faces = [FacePoint(time: 0, x: 0.3, y: 0.3), FacePoint(time: 9, x: 0.3, y: 0.3)]
      let f = ZoomPlanner.plan(mapper: m, words: words, faces: faces, settings: ZoomSettings(mode: .subtle, faceFollow: true))
      check(f.allSatisfy { near($0.anchorX, 0.3, 1e-9) }, "anchor follows the face")
    }

    test("caption grouper limits, breaks and timeline") {
      let words = [
        w("One", 0, 0.3), w("two", 0.3, 0.6), w("three", 0.6, 0.9), w("four", 0.9, 1.2), w("five", 1.2, 1.5),
        w("six.", 1.5, 1.8), w("Seven", 2.5, 2.8), w("eight", 2.8, 3.1),
      ]
      let m = TimeMapper(keep: [TimeRange(start: 0, end: 4)])
      let cards = CaptionGrouper.group(words: words, overrides: [], mapper: m, maxWords: 4, uppercase: false, envelope: [], emphasis: false)
      check(cards.map { $0.words.count } == [4, 2, 2], "4 + 2 (punct) + 2 (gap), got \(cards.map { $0.words.count })")
      check(cards.allSatisfy { $0.end - $0.start >= 0.6 - 1e-9 }, "min duration")
      let upper = CaptionGrouper.group(words: words, overrides: [WordOverride(wordIndex: 0, text: "Uno")], mapper: m, maxWords: 3, uppercase: true, envelope: [], emphasis: false)
      check(upper.first?.words.first?.text == "UNO", "override + uppercase")
      let cut = TimeMapper(keep: [TimeRange(start: 0, end: 0.6), TimeRange(start: 0.9, end: 4)])
      let c2 = CaptionGrouper.group(words: words, overrides: [], mapper: cut, maxWords: 4, uppercase: false, envelope: [], emphasis: false)
      check(!c2.flatMap(\.words).contains { $0.text == "three" }, "cut word hidden")
      check(near(c2[0].words[2].start, 0.6, 1e-9), "times are composition times")
    }

    test("emphasis marks the loudest word") {
      let e = env([(0.3, -30), (0.3, -10), (0.3, -30)])
      let words = [w("soft", 0, 0.3), w("LOUD", 0.3, 0.6), w("soft", 0.6, 0.9)]
      let cards = CaptionGrouper.group(words: words, overrides: [], mapper: TimeMapper(keep: [TimeRange(start: 0, end: 1)]), maxWords: 4, uppercase: false, envelope: e, emphasis: true)
      check(cards.first?.words.map(\.emphasis) == [false, true, false], "middle word emphasised")
    }

    test("analysis planner: no-speech safety rule") {
      let music = env([(10, -65)])
      let r = AnalysisPlanner.detect(envelope: music, words: [], wordTimingIsExact: true, language: "en", options: AnalysisOptions())
      check(r.noSpeech && r.cuts.isEmpty, "no cuts on music-only")
    }

    test("edit document decodes the JS shape and plans") {
      let json = """
      {"version":1,"cuts":[{"id":"s1","start":1,"end":2,"reason":"silence","accepted":true,"confidence":1}],
       "wordOverrides":[],"captions":{"styleId":"boxed","font":"poppins","sizeScale":1,
       "colors":{"base":"#FFFFFF","active":"#FFFFFF","stroke":"transparent","bg":"rgba(15,18,34,0.85)"},
       "position":{"y":0.66},"uppercase":false,"maxWords":5,"enabled":true},
       "zoom":{"mode":"subtle","intensity":2,"faceFollow":true},"crop":{"auto916":true},"audio":{"mode":"original"}}
      """
      let doc = try decodeJSON(EditDocument.self, json)
      check(doc.captions.styleId == "boxed" && doc.zoom.mode == .subtle, "decoded")
      let analysis = Analysis(
        media: MediaInfo(durationSec: 4, width: 1080, height: 1920, fps: 30, isHDR: false, hasAudio: true),
        transcript: Transcript(words: [w("hi", 0.2, 0.5), w("there", 2.2, 2.6)], language: "en", engine: "test", wordTimingIsExact: true),
        envelopeDb: [], noiseFloorDb: -60, speechThresholdDb: -38, speechCoverage: 0.5, noSpeech: false, cuts: [], faces: [], warnings: [])
      let plan = EditPlanner.plan(doc: doc, analysis: analysis)
      check(near(plan.compDuration, 3, 1e-9), "3 s after cut")
      check(near(plan.removedSec, 1, 1e-9), "1 s removed")
      check(plan.zoom.count == 2, "one cut → one punch-in")
      check(plan.cards.flatMap(\.words).map(\.text) == ["hi", "there"], "captions")
      let back = try encodeJSON(plan)
      check(back.contains("\"compDuration\":3"), "plan encodes")
    }

    test("crop aspect ratios decode, with the legacy switch as fallback") {
      let r = { (j: String) throws -> Double? in try decodeJSON(CropSettings.self, j).ratio }
      let legacyOn = try r(#"{"auto916":true}"#), legacyOff = try r(#"{"auto916":false}"#)
      let wide = try r(#"{"auto916":true,"aspect":"16:9"}"#), square = try r(#"{"auto916":false,"aspect":"1:1"}"#)
      let original = try r(#"{"auto916":true,"aspect":"original"}"#)
      check(legacyOn == 9.0 / 16, "legacy on → 9:16")
      check(legacyOff == nil, "legacy off → original")
      check(wide == 16.0 / 9, "aspect wins")
      check(square == 1, "square")
      check(original == nil, "original")
    }

    test("manual framing: fit, fill, clamp (same numbers as src/editor/frame.ts tests)") {
      // 9:16 video (1080×1920) on a 16:9 canvas (1920×1080).
      let fit = Framing.fitScale(canvasW: 1920, canvasH: 1080, videoW: 1080, videoH: 1920)
      check(near(fit, 0.5625, 1e-9), "fit scale \(fit)")
      let fill = Framing.fillUserScale(canvasW: 1920, canvasH: 1080, videoW: 1080, videoH: 1920)
      check(near(fill, 3.160493827, 1e-6), "fill user scale \(fill)")
      let p = Framing.place(crop: CropSettings(aspect: "16:9", scale: 1, offsetX: 0, offsetY: 0), canvasW: 1920, canvasH: 1080, videoW: 1080, videoH: 1920)
      check(near(p.videoW, 607.5, 1e-6) && near(p.videoH, 1080, 1e-6), "fit size \(p.videoW)×\(p.videoH)")
      check(near(p.originX, 656.25, 1e-6) && near(p.originY, 0, 1e-6), "centred with bars \(p.originX),\(p.originY)")
      // Offsets clamp: at Fit the centre stays on the canvas.
      let c1 = Framing.clamp(scale: 1, offsetX: 0.9, offsetY: -0.9, canvasW: 1920, canvasH: 1080, videoW: 1080, videoH: 1920)
      check(near(c1.offsetX, 0.5, 1e-9) && near(c1.offsetY, -0.5, 1e-9), "fit offsets clamp to ±0.5")
      // Zoomed 3×: the video is 1822.5×3240, so vertical pan reaches 1.5 (edge to canvas centre).
      let c2 = Framing.clamp(scale: 3, offsetX: 0, offsetY: 9, canvasW: 1920, canvasH: 1080, videoW: 1080, videoH: 1920)
      check(near(c2.offsetY, 1.5, 1e-9), "zoomed pan limit \(c2.offsetY)")
      let c3 = Framing.clamp(scale: 9, offsetX: 0, offsetY: 0, canvasW: 1920, canvasH: 1080, videoW: 1080, videoH: 1920)
      check(c3.scale == Framing.maxScale, "scale capped")
      let c4 = Framing.clamp(scale: 0.2, offsetX: 0, offsetY: 0, canvasW: 1920, canvasH: 1080, videoW: 1080, videoH: 1920)
      check(c4.scale == Framing.minScale, "scale floored at Fit")
      let legacy = try decodeJSON(CropSettings.self, #"{"auto916":true,"aspect":"9:16"}"#)
      check(!legacy.isManual, "documents without scale stay on automatic framing")
    }

    // Caption edits. Eight words in two natural groups of four ("One two three four" / "five six seven eight").
    let cw = [
      w("One", 0, 0.3), w("two", 0.3, 0.6), w("three", 0.6, 0.9), w("four", 0.9, 1.2),
      w("five", 1.2, 1.5), w("six", 1.5, 1.8), w("seven", 1.8, 2.1), w("eight", 2.1, 2.4),
    ]
    let cm = TimeMapper(keep: [TimeRange(start: 0, end: 4)])
    func groups(_ edits: CaptionEdits?) -> CaptionGrouper.Output {
      CaptionGrouper.groupAll(words: cw, overrides: [], mapper: cm, maxWords: 4, uppercase: false, envelope: [], emphasis: false, edits: edits)
    }

    test("caption ids come from the first word and survive re-grouping") {
      let g = groups(nil)
      check(g.cards.map(\.id) == ["w0", "w4"], "ids \(g.cards.map(\.id))")
      // The editor's split stores the split point and pins the group's old end (the next group's start),
      // so later groups keep their words and ids.
      let split = groups(CaptionEdits(boundaries: [0.6, 1.2]))
      check(split.cards.map(\.id) == ["w0", "w2", "w4"], "splitting the first group keeps w4 (\(split.cards.map(\.id)))")
      check(split.cards[2].words.count == 4, "w4 keeps its 4 words")
    }

    test("caption split at a word boundary produces two groups") {
      let g = groups(CaptionEdits(boundaries: [1.5]))  // start of "six"
      check(g.cards.map { $0.words.count } == [4, 1, 3], "4 + 1 + 3, got \(g.cards.map { $0.words.count })")
      check(g.cards.map(\.id) == ["w0", "w4", "w5"], "ids \(g.cards.map(\.id))")
      check(g.cards[2].words.first?.text == "six", "second half starts at the split")
    }

    test("caption merge joins two groups, even past the word limit") {
      let g = groups(CaptionEdits(merges: [1.2]))  // start of "five"
      check(g.cards.count == 1 && g.cards[0].words.count == 8, "one group of 8, got \(g.cards.map { $0.words.count })")
      check(g.cards.first?.id == "w0", "merged group keeps the first id")
      // A merge also overrides punctuation and pauses.
      var punct = cw
      punct[3].text = "four."
      let p = CaptionGrouper.group(words: punct, overrides: [], mapper: cm, maxWords: 8, uppercase: false, envelope: [], emphasis: false, edits: CaptionEdits(merges: [1.2]))
      check(p.count == 1, "merge beats the full stop (\(p.count))")
      // A split at the same place wins over a merge.
      let both = groups(CaptionEdits(boundaries: [1.2], merges: [1.2]))
      check(both.cards.count == 2, "split wins over merge at the same boundary (\(both.cards.count))")
    }

    test("hidden caption groups are removed from the render and listed separately") {
      let g = groups(CaptionEdits(hidden: ["w4"]))
      check(g.cards.map(\.id) == ["w0"], "only w0 shown")
      check(g.hidden.map(\.id) == ["w4"], "w4 listed as hidden")
      let visible = CaptionGrouper.group(words: cw, overrides: [], mapper: cm, maxWords: 4, uppercase: false, envelope: [], emphasis: false, edits: CaptionEdits(hidden: ["w0"]))
      check(visible.map(\.id) == ["w4"], "group() returns visible cards only")
    }

    test("caption retime moves edges and clamps to neighbours") {
      let moved = groups(CaptionEdits(timing: [CaptionTiming(id: "w4", start: 1.4, end: 3.0)]))
      check(near(moved.cards[1].start, 1.4, 1e-9) && near(moved.cards[1].end, 3.0, 1e-9), "retimed w4 \(moved.cards[1].start)–\(moved.cards[1].end)")
      // Pulling w4's start into w0 stops at w0's end.
      let early = groups(CaptionEdits(timing: [CaptionTiming(id: "w4", start: 0.5)]))
      check(near(early.cards[1].start, early.cards[0].end, 1e-9), "start clamps to previous end (\(early.cards[1].start) vs \(early.cards[0].end))")
      // Pushing w0's end past w4's start stops there.
      let late = groups(CaptionEdits(timing: [CaptionTiming(id: "w0", end: 2.0)]))
      check(near(late.cards[0].end, late.cards[1].start, 1e-9), "end clamps to next start (\(late.cards[0].end))")
      // Never shorter than 0.3 s.
      let tiny = groups(CaptionEdits(timing: [CaptionTiming(id: "w4", start: 2.0, end: 2.05)]))
      check(tiny.cards[1].end - tiny.cards[1].start >= CaptionGrouper.minRetimeSec - 1e-9, "min 0.3 s (\(tiny.cards[1].end - tiny.cards[1].start))")
      // Never past the clip end.
      let past = groups(CaptionEdits(timing: [CaptionTiming(id: "w4", end: 9)]))
      check(near(past.cards[1].end, 4, 1e-9), "clamped to the clip (\(past.cards[1].end))")
      // Retime is in source time: a cut before the card shifts it with the composition.
      let cut = TimeMapper(keep: [TimeRange(start: 0, end: 0.3), TimeRange(start: 0.6, end: 4)])
      // With "two" cut, the groups are [One three four five] and [six seven eight] (w5).
      let shifted = CaptionGrouper.group(words: cw, overrides: [], mapper: cut, maxWords: 4, uppercase: false, envelope: [], emphasis: false, edits: CaptionEdits(timing: [CaptionTiming(id: "w5", start: 1.6)]))
      check(shifted.last?.id == "w5" && shifted.last.map { near($0.start, 1.3, 1e-9) } == true, "source 1.6 → comp 1.3 (\(shifted.last?.start ?? -1))")
    }

    test("old documents without captionEdits or style overrides decode") {
      let json = """
      {"version":1,"cuts":[],"wordOverrides":[],"captions":{"styleId":"pop","font":"poppins","sizeScale":1,
       "colors":{"base":"#FFFFFF","active":"#FFE14D","stroke":"#000000","bg":"transparent"},
       "position":{"y":0.66},"uppercase":false,"maxWords":4,"enabled":true},
       "zoom":{"mode":"off","intensity":2,"faceFollow":true},"crop":{"auto916":true},"audio":{"mode":"original"}}
      """
      let doc = try decodeJSON(EditDocument.self, json)
      check(doc.captionEdits == nil && doc.captions.background == nil && doc.captions.animation == nil, "optional fields absent")
      let withEdits = try decodeJSON(EditDocument.self, json.replacingOccurrences(of: "\"version\":1,", with: #""version":1,"captionEdits":{"hidden":["w3"],"timing":[{"id":"w0","end":1.5}]},"#))
      check(withEdits.captionEdits?.hidden == ["w3"] && withEdits.captionEdits?.timing?.first?.end == 1.5, "captionEdits decode")
      check(withEdits.captionEdits?.boundaries == nil, "missing lists stay nil")
    }

    test("caption style resolve merges overrides onto the preset") {
      let pop = CaptionStyle.resolve(CaptionSettings(styleId: "pop"))
      check(pop == CaptionStyle.forId("pop") && pop.background == .none && pop.strokeWidth == 6, "no overrides = preset")
      check(CaptionStyle.forId("boxed").background == .box && CaptionStyle.forId("highlight").background == .highlight, "preset backgrounds")
      let o = CaptionStyle.resolve(CaptionSettings(styleId: "pop", background: "translucent", outline: "thick", shadow: false, animation: "karaoke"))
      check(o.background == .translucent && o.strokeWidth == 10 && !o.shadow && o.animation == .karaoke, "all overrides applied")
      check(o.sizeRatio == CaptionStyle.forId("pop").sizeRatio, "size stays the preset's")
      let thin = CaptionStyle.resolve(CaptionSettings(styleId: "outline", outline: "thin"))
      check(thin.strokeWidth == 4, "thin = 4")
      let none = CaptionStyle.resolve(CaptionSettings(styleId: "boxed", background: "none", outline: "none"))
      check(none.background == .none && none.strokeWidth == 0, "overrides can switch off")
      let custom = CaptionStyle.resolve(CaptionSettings(styleId: "custom", baseStyleId: "karaoke", shadow: false))
      check(custom.animation == .karaoke && custom.emphasis && !custom.shadow, "custom builds on its base preset")
      let junk = CaptionStyle.resolve(CaptionSettings(styleId: "boxed", background: "sparkles", animation: "wiggle"))
      check(junk == CaptionStyle.forId("boxed"), "unknown values keep the preset")
    }

    test("text overlay clamp keeps the rotated box inside the canvas (same cases as tests/queue)") {
      // Mirrored in tests/queue/textOverlays.ts: change both together.
      let W = 1080.0, H = 1920.0
      let centred = TextOverlayMetrics.clampCenter(x: 0.5, y: 0.5, boxW: 200, boxH: 100, rotation: 0, canvasW: W, canvasH: H)
      check(near(centred.x, 0.5, 1e-9) && near(centred.y, 0.5, 1e-9), "centred box stays (\(centred))")
      let right = TextOverlayMetrics.clampCenter(x: 0.95, y: 0.5, boxW: 400, boxH: 100, rotation: 0, canvasW: W, canvasH: H)
      check(near(right.x, 880.0 / 1080, 1e-9) && near(right.y, 0.5, 1e-9), "past the right edge pulls back to 0.8148 (\(right.x))")
      let turned = TextOverlayMetrics.clampCenter(x: 0.05, y: 0.02, boxW: 400, boxH: 100, rotation: 90, canvasW: W, canvasH: H)
      check(near(turned.x, 0.05, 1e-9) && near(turned.y, 200.0 / 1920, 1e-9), "90° swaps the extents (\(turned))")
      let huge = TextOverlayMetrics.clampCenter(x: 0.9, y: 0.3, boxW: 1200, boxH: 100, rotation: 0, canvasW: W, canvasH: H)
      check(near(huge.x, 0.5, 1e-9) && near(huge.y, 0.3, 1e-9), "wider than the canvas centres (\(huge))")
    }

    test("text overlay colours, sizes and windows") {
      check(TextOverlayMetrics.contrastText("#FFFFFF") == "#000000" && TextOverlayMetrics.contrastText("#FFE14D") == "#000000", "light boxes get black text")
      check(TextOverlayMetrics.contrastText("#000000") == "#FFFFFF" && TextOverlayMetrics.contrastText("#FF3B30") == "#FFFFFF", "dark boxes get white text")
      // Mirrored in tests/queue/textOverlays.ts.
      check(near(TextOverlayMetrics.luminance("#FF3B30"), 0.2126 + 0.7152 * 59 / 255 + 0.0722 * 48 / 255, 1e-9), "luma of #FF3B30")
      check(TextOverlayMetrics.clampSize(1) == 0.2 && TextOverlayMetrics.clampSize(0) == 0.03 && TextOverlayMetrics.clampSize(.nan) == 0.07, "size clamps")
      let whole = TextOverlayMetrics.window(TextOverlay(text: "Hi"), total: 12)
      check(whole.start == 0 && whole.end == 12, "no times = whole clip")
      let late = TextOverlayMetrics.window(TextOverlay(text: "Hi", start: 10, end: 20), total: 12)
      check(late.start == 10 && late.end == 12, "clipped to the video")
      check(TextOverlayMetrics.styles.count == 9 && Set(TextOverlayMetrics.styles.map(TextOverlayMetrics.fontName)).count == 9, "nine styles, nine fonts")
    }

    test("documents without text overlays decode; partial overlays get defaults") {
      let json = """
      {"version":1,"cuts":[],"wordOverrides":[],"captions":{"styleId":"pop","font":"poppins","sizeScale":1,
       "colors":{"base":"#FFFFFF","active":"#FFE14D","stroke":"#000000","bg":"transparent"},
       "position":{"y":0.66},"uppercase":false,"maxWords":4,"enabled":true},
       "zoom":{"mode":"off","intensity":2,"faceFollow":true},"crop":{"auto916":true},"audio":{"mode":"original"}}
      """
      let old = try decodeJSON(EditDocument.self, json)
      check(old.textOverlays == nil, "old document: no overlays")
      let partial = try decodeJSON(EditDocument.self, json.replacingOccurrences(of: "\"version\":1,", with: #""version":1,"textOverlays":[{"id":"a","text":"POV: day 1","style":"retro"}],"#))
      let o = partial.textOverlays?.first
      check(o?.text == "POV: day 1" && o?.box == "none" && o?.align == "center" && o?.size == 0.07 && o?.x == 0.5 && o?.rotation == 0, "defaults filled in")
      check(o?.color == "#FFF3D6" && o?.start == nil && o?.end == nil, "retro default colour, whole clip")
      let round = try decodeJSON(EditDocument.self, try encodeJSON(partial))
      check(round == partial, "round-trips")
    }

    test("audio: original clips map through the cut plan (output → source)") {
      // Source 2–3 s cut: output 0–2 = source 0–2, output 2–5 = source 3–6.
      let mapper = TimeMapper(keep: [TimeRange(start: 0, end: 2), TimeRange(start: 3, end: 6)])
      let clip = AudioClip(id: "o", source: "original", start: 1.5, end: 3)
      let ranges = AudioPlanner.sourceRanges(clip: clip, segments: mapper.segments)
      check(ranges.count == 2, "spans the cut: two source pieces (\(ranges.count))")
      check(near(ranges[0].start, 1.5, 1e-9) && near(ranges[0].end, 2, 1e-9), "output 1.5–2 = source 1.5–2 (\(ranges[0]))")
      check(near(ranges[1].start, 3, 1e-9) && near(ranges[1].end, 4, 1e-9), "output 2–3 = source 3–4 (\(ranges[1]))")
      let pieces = AudioPlanner.originalPieces(clip: clip, segments: mapper.segments)
      check(pieces.map(\.segment) == [0, 1] && near(pieces[1].from, 0, 1e-9) && near(pieces[1].to, 1, 1e-9), "pieces are offsets into each segment")
      let late = AudioPlanner.sourceRanges(clip: AudioClip(id: "l", source: "original", start: 4, end: 9), segments: mapper.segments)
      check(late.count == 1 && near(late[0].start, 5, 1e-9) && near(late[0].end, 6, 1e-9), "past the end: only what exists")
    }

    test("audio: clips are trimmed to the video; mute drops the original; old documents get one original") {
      var doc = EditDocument()
      let legacy = AudioPlanner.clips(doc: doc, compDuration: 8)
      check(legacy.count == 1 && legacy[0].isOriginal && legacy[0].start == 0 && legacy[0].end == 8, "no audioClips = one original over the video")
      doc.audio.mode = .mute
      check(AudioPlanner.clips(doc: doc, compDuration: 8).isEmpty, "mute: nothing")
      doc.audioClips = [
        AudioClip(id: "o1", source: "original", start: 0, end: 3),
        AudioClip(id: "o2", source: "original", start: 2.5, end: 12),
        AudioClip(id: "f", source: "file", file: "audio/a.m4a", start: 6, end: 20, offset: -1, volume: 5),
        AudioClip(id: "x", source: "sampler", start: 0, end: 3),
      ]
      let muted = AudioPlanner.clips(doc: doc, compDuration: 8)
      check(muted.map(\.id) == ["f"], "mute keeps added sounds, drops originals and unknown sources (\(muted.map(\.id)))")
      check(muted[0].end == 8 && muted[0].offset == 0 && muted[0].volume == 2, "file trimmed to 8 s, offset ≥ 0, volume ≤ 200%")
      doc.audio.mode = .original
      let all = AudioPlanner.clips(doc: doc, compDuration: 8)
      check(all.map(\.id) == ["o1", "o2", "f"], "originals first, then files")
      check(all[1].start == 3 && all[1].end == 8, "overlapping originals: the later starts where the earlier ends (\(all[1].start)–\(all[1].end))")
    }

    test("audio: file inserts (trim head, short files, loops)") {
      let once = AudioPlanner.filePieces(offset: 2, fileDuration: 10, start: 1, end: 4, loop: false)
      check(once == [FilePiece(fileStart: 2, length: 3, at: 1)], "trimmed head plays from 2 s (\(once))")
      let short = AudioPlanner.filePieces(offset: 0, fileDuration: 3, start: 1, end: 9, loop: false)
      check(short.count == 1 && near(short[0].length, 3, 1e-9), "shorter than the window, no loop: what exists")
      let looped = AudioPlanner.filePieces(offset: 1, fileDuration: 3, start: 0, end: 10, loop: true)
      // 2 s (1→3), then 3 + 3 + 2 s.
      check(looped.count == 4, "loop: 4 inserts fill 10 s (\(looped.count))")
      check(near(looped.map(\.length).reduce(0, +), 10, 1e-9) && near(looped.last!.at, 8, 1e-9) && near(looped.last!.length, 2, 1e-9), "loop fills exactly to the end")
      check(looped.dropFirst().allSatisfy { $0.fileStart == 0 }, "repeats start from the top")
      check(AudioPlanner.filePieces(offset: 12, fileDuration: 10, start: 0, end: 5, loop: false).isEmpty, "offset past the end: nothing")
      let wrapped = AudioPlanner.filePieces(offset: 7, fileDuration: 3, start: 0, end: 4, loop: true)
      check(wrapped.first == FilePiece(fileStart: 1, length: 2, at: 0), "looping offset wraps into the file (\(wrapped))")
      check(AudioPlanner.filePieces(offset: 0, fileDuration: 0.01, start: 0, end: 5, loop: true).isEmpty, "a near-empty file never loops forever")
      check(AudioPlanner.filePieces(offset: 0, fileDuration: 0.1, start: 0, end: 1000, loop: true).count == AudioPlanner.maxLoopPieces, "loop count capped")
    }

    test("audio: ducking intervals (pad, merge, cap, only where the original is heard)") {
      let mapper = TimeMapper(keep: [TimeRange(start: 0, end: 2), TimeRange(start: 3, end: 10)])
      let words = [w("a", 0.5, 0.8), w("b", 0.9, 1.2), w("gone", 2.2, 2.6), w("c", 4.0, 4.3), w("d", 6.0, 6.5)]
      let sp = AudioPlanner.speech(words: words, mapper: mapper)
      // a+b merge (gap 0.1 + padding) → 0.35–1.35; "gone" is cut; c → output 3.0–3.3 → 2.85–3.45; d → 5.0–5.5 → 4.85–5.65.
      check(sp.count == 3, "three intervals (\(sp))")
      check(near(sp[0].start, 0.35, 1e-9) && near(sp[0].end, 1.35, 1e-9), "padded by 0.15 s and merged")
      check(near(sp[1].start, 2.85, 1e-9) && near(sp[2].end, 5.65, 1e-9), "mapped to output time across the cut")
      let close = AudioPlanner.merge([TimeRange(start: 0, end: 1), TimeRange(start: 1.25, end: 2), TimeRange(start: 2.4, end: 3)], gap: 0.3)
      check(close.count == 2 && close[0].end == 2, "gaps under 0.3 s merge (\(close))")
      let many = (0..<400).map { TimeRange(start: Double($0), end: Double($0) + 0.5) }
      check(AudioPlanner.capped(many).count <= AudioPlanner.maxSpeechIntervals, "capped to \(AudioPlanner.maxSpeechIntervals)")
      let heard = AudioPlanner.audibleSpeech(sp, originals: [AudioClip(id: "o", source: "original", start: 0, end: 1)])
      check(heard.count == 1 && near(heard[0].end, 1, 1e-9), "speech in a deleted stretch doesn't duck (\(heard))")
      check(AudioPlanner.audibleSpeech(sp, originals: [AudioClip(id: "o", source: "original", start: 0, end: 9, volume: 0)]).isEmpty, "an original at 0% isn't heard: no ducking")
    }

    test("audio: volume curve (fades, ducking, click guards) as non-overlapping ramps") {
      let clip = AudioClip(id: "f", source: "file", start: 0, end: 10, volume: 0.8, fadeIn: 1, fadeOut: 2)
      let curve = AudioPlanner.gainCurve(clip: clip, ducking: [TimeRange(start: 4, end: 5)])
      func at(_ t: Double) -> Double? { curve.first { abs($0.t - t) < 1e-6 }?.gain }
      check(at(0) == 0 && near(at(1) ?? -1, 0.8, 1e-9), "fades in to the volume over 1 s")
      check(near(at(4) ?? -1, 0.8, 1e-9) && near(at(4.12) ?? -1, 0.16, 1e-9) && near(at(5) ?? -1, 0.16, 1e-9) && near(at(5.12) ?? -1, 0.8, 1e-9), "ducks to 20% in 0.12 s and back")
      check(near(at(8) ?? -1, 0.8, 1e-9) && at(10) == 0, "fades out over the last 2 s")
      check(zip(curve, curve.dropFirst()).allSatisfy { $1.t > $0.t }, "strictly increasing times")
      let r = AudioPlanner.ramps(curve)
      check(zip(r, r.dropFirst()).allSatisfy { a, b in (a.until ?? a.t) <= b.t + 1e-9 }, "ramps never overlap")
      let squeezed = AudioPlanner.gainCurve(clip: AudioClip(id: "s", source: "file", start: 0, end: 1, fadeIn: 3, fadeOut: 1))
      check(squeezed.count >= 3 && squeezed.allSatisfy { $0.gain <= 1 } && near(squeezed.map(\.gain).max() ?? 0, 1, 1e-9), "fades longer than the clip are scaled to fit")
      let joined = AudioPlanner.gainCurve(clip: AudioClip(id: "o", source: "original", start: 0, end: 4), dips: [2], guardStart: true, guardEnd: true)
      check(joined.contains { abs($0.t - 2) < 1e-9 && $0.gain == 0 } && joined.first?.gain == 0, "10 ms dip at a cut join and at the edges")
      // A split: [0,2] at 100% then [2,4] at 50%, no guard where they meet.
      let left = AudioPlanner.gainCurve(clip: AudioClip(id: "l", source: "original", start: 0, end: 2), guardStart: true)
      let right = AudioPlanner.gainCurve(clip: AudioClip(id: "r", source: "original", start: 2, end: 4, volume: 0.5), guardEnd: true)
      check(left.last?.gain == 1 && right.first?.gain == 0.5, "no fade at a split")
      let joinRamps = AudioPlanner.ramps(left + right)
      check(joinRamps.allSatisfy { ($0.until ?? .infinity) > $0.t } && joinRamps.contains { abs($0.t - 2.005) < 1e-9 && $0.from == 0.5 }, "the level change at a split takes 5 ms, no zero-length ramp")
      check(joinRamps.contains { $0.t == 0.01 && $0.until == 2 && $0.from == 1 && $0.to == 1 }, "a hold is one flat ramp up to the next change")
      check(zip(joinRamps, joinRamps.dropFirst()).allSatisfy { a, b in a.until == b.t }, "ramps are back to back")
      check(zip(joinRamps, joinRamps.dropFirst()).allSatisfy { a, b in (a.until ?? a.t) <= b.t + 1e-9 }, "touching clips' ramps never overlap")
    }

    test("audio: documents without audio clips decode; partial clips get defaults; paths stay inside the project") {
      let json = """
      {"version":1,"cuts":[],"wordOverrides":[],"captions":{"styleId":"pop","font":"poppins","sizeScale":1,
       "colors":{"base":"#FFFFFF","active":"#FFE14D","stroke":"#000000","bg":"transparent"},
       "position":{"y":0.66},"uppercase":false,"maxWords":4,"enabled":true},
       "zoom":{"mode":"off","intensity":2,"faceFollow":true},"crop":{"auto916":true},"audio":{"mode":"mute"}}
      """
      let old = try decodeJSON(EditDocument.self, json)
      check(old.audioClips == nil && old.audio.mode == .mute, "old document: no audio clips, mute kept")
      let partial = try decodeJSON(EditDocument.self, json.replacingOccurrences(of: "\"version\":1,", with: #""version":1,"audioClips":[{"id":"v","source":"file","file":"audio/v.m4a","start":1,"end":4}],"#))
      let c = partial.audioClips?.first
      check(c?.volume == 1 && c?.fadeIn == 0 && c?.fadeOut == 0 && c?.offset == 0 && c?.loop == nil && c?.ducking == nil, "defaults filled in")
      let round = try decodeJSON(EditDocument.self, try encodeJSON(partial))
      check(round == partial, "round-trips")
      check(AudioPlanner.isSafeFile("audio/a.m4a") && !AudioPlanner.isSafeFile("../x.m4a") && !AudioPlanner.isSafeFile("/etc/x") && !AudioPlanner.isSafeFile("audio//a"), "safe relative paths only")
      let lv = Envelope.levels(samples: [Float](repeating: 0.1, count: 1000) + [Float](repeating: 0, count: 1000), buckets: 4)
      check(lv.count == 4 && near(lv[0], 0.8, 1e-6) && lv[3] == 0, "waveform levels on the timeline scale (\(lv))")
    }

    // MARK: Multi-clip projects

    func media(_ d: Double, w: Double = 1080, h: Double = 1920, audio: Bool = true) -> MediaInfo {
      MediaInfo(durationSec: d, width: w, height: h, fps: 30, isHDR: false, hasAudio: audio)
    }
    func clip(_ id: String, _ d: Double, w: Double = 1080, h: Double = 1920) -> ClipMeta {
      ClipMeta(id: id, sourceFile: "source-\(id).mov", media: media(d, w: w, h: h), posterFile: nil, title: "Clip \(id)")
    }
    func clipAnalysis(_ d: Double, words: [Word], cuts: [Cut] = [], faces: [FacePoint] = [], envFrames: Int? = nil) -> Analysis {
      let n = envFrames ?? ClipTimeline.frameCount(d)
      return Analysis(media: media(d), transcript: Transcript(words: words, language: "en", engine: "t", wordTimingIsExact: true),
                      envelopeDb: [Float](repeating: -20, count: n), noiseFloorDb: -60, speechThresholdDb: -38, speechCoverage: 0.8,
                      noSpeech: false, cuts: cuts, faces: faces, warnings: [])
    }

    test("clips: concatenation offsets words, levels, faces and cuts; ids stay unique") {
      let a = clip("c0", 3.01)
      let b = clip("k1", 2.0, w: 1920, h: 1080)
      // Clip a's envelope is one frame short, clip b's two frames long: both are fitted to their durations.
      let pa = ClipTimeline.Part(clip: a, analysis: clipAnalysis(3.01, words: [w("hello", 0.5, 0.9), w("there", 1.0, 1.4)],
        cuts: [Cut(id: "s1.000", start: 1.5, end: 2.5, reason: .silence, accepted: true, confidence: 1)],
        faces: [FacePoint(time: 1, x: 0.4, y: 0.4)], envFrames: 150))
      let pb = ClipTimeline.Part(clip: b, analysis: clipAnalysis(2.0, words: [w("again", 0.2, 0.6)],
        cuts: [Cut(id: "s1.000", start: 1.0, end: 1.6, reason: .silence, accepted: true, confidence: 1)],
        faces: [FacePoint(time: 0.5, x: 0.6, y: 0.5)], envFrames: 102))
      let all = ClipTimeline.concatenate([pa, pb], primaryId: "c0", canvas: a.media)
      check(near(all.media.durationSec, 5.01, 1e-9), "duration is the sum (\(all.media.durationSec))")
      check(all.media.width == 1080 && all.media.height == 1920, "shape from the canvas clip")
      check(all.envelopeDb.count == 151 + 100, "envelope fitted per clip (\(all.envelopeDb.count))")
      let ws = all.transcript?.words ?? []
      check(ws.count == 3 && near(ws[2].start, 3.21, 1e-9) && near(ws[2].end, 3.61, 1e-9), "second clip's words offset by 3.01 s")
      check(all.cuts.map(\.id) == ["s1.000", "k1/s1.000"], "primary ids bare, others prefixed (\(all.cuts.map(\.id)))")
      check(near(all.cuts[1].start, 4.01, 1e-9) && near(all.cuts[1].end, 4.61, 1e-9), "cut offset")
      check(all.faces.count == 2 && near(all.faces[1].time, 3.51, 1e-9), "faces offset")
      let spans = all.clips ?? []
      check(spans.count == 2 && spans[1].id == "k1" && near(spans[1].start, 3.01, 1e-9) && near(spans[1].end, 5.01, 1e-9), "clip spans")
      check(spans[0].wordStart == 0 && spans[0].wordCount == 2 && spans[1].wordStart == 2 && spans[1].wordCount == 1, "word ranges per clip")
      // The plan over the concatenated timeline: kept = total − both silences; export length = sum of kept ranges.
      var doc = EditDocument(cuts: all.cuts)
      doc.zoom = ZoomSettings(mode: .off)
      let plan = EditPlanner.plan(doc: doc, analysis: all)
      check(near(plan.compDuration, 5.01 - 1.0 - 0.6, 1e-6), "output = sum of kept ranges (\(plan.compDuration))")
      check(plan.cards.first.map { $0.words.count } ?? 0 >= 1, "captions continue across clips")
    }

    test("clips: play order, reordering re-concatenates") {
      let clips = [clip("c0", 2), clip("k1", 3), clip("k2", 1)]
      check(ClipTimeline.ordered(clips, order: nil).map(\.id) == ["c0", "k1", "k2"], "nil order = order added")
      check(ClipTimeline.ordered(clips, order: ["k2", "zz", "c0", "k2"]).map(\.id) == ["k2", "c0"], "unknown and repeated ids ignored; left-out clips deleted")
      check(ClipTimeline.ordered(clips, order: []).map(\.id) == ["c0"], "never empty")
      let parts = [
        ClipTimeline.Part(clip: clips[0], analysis: clipAnalysis(2, words: [w("one", 0.1, 0.4)])),
        ClipTimeline.Part(clip: clips[1], analysis: clipAnalysis(3, words: [w("two", 0.1, 0.4)])),
      ]
      let forward = ClipTimeline.concatenate(parts, primaryId: "c0")
      let reversed = ClipTimeline.concatenate(parts.reversed(), primaryId: "c0")
      check(forward.transcript?.words.map(\.text) == ["one", "two"] && reversed.transcript?.words.map(\.text) == ["two", "one"], "word order follows play order")
      check(near(reversed.transcript?.words[1].start ?? -1, 3.1, 1e-9), "clip c0 now starts at 3 s")
      check(reversed.clips?.first?.id == "k1" && near(reversed.clips?[1].start ?? -1, 3, 1e-9), "spans follow play order")
    }

    test("clips: trims are manual cuts at plan time, clamped, never stored") {
      let parts = [
        ClipTimeline.Part(clip: clip("c0", 4), analysis: clipAnalysis(4, words: [])),
        ClipTimeline.Part(clip: clip("k1", 3), analysis: clipAnalysis(3, words: [])),
      ]
      let all = ClipTimeline.concatenate(parts, primaryId: "c0")
      var doc = EditDocument()
      doc.zoom = ZoomSettings(mode: .off)
      doc.captions.enabled = false
      doc.clipTrims = [ClipTrim(clipId: "c0", head: 0, tail: 1), ClipTrim(clipId: "k1", head: 0.5, tail: 0), ClipTrim(clipId: "gone", head: 1, tail: 1)]
      let cuts = ClipTimeline.trimCuts(doc.clipTrims, spans: all.clips ?? [])
      check(cuts.count == 2 && cuts.allSatisfy { $0.reason == .manual && $0.accepted }, "one manual cut per trimmed end (\(cuts.count))")
      check(near(cuts[0].start, 3) && near(cuts[0].end, 4) && near(cuts[1].start, 4) && near(cuts[1].end, 4.5), "at the clip ends")
      let plan = EditPlanner.plan(doc: doc, analysis: all)
      check(near(plan.compDuration, 5.5, 1e-6) && doc.cuts.isEmpty, "7 s − 1.5 s trimmed = 5.5 s (\(plan.compDuration))")
      let over = ClipTimeline.clamped(ClipTrim(clipId: "k1", head: 2.5, tail: 2.5), length: 3)
      check(near(over.head, 2.5, 1e-9) && near(over.tail, 0.3, 1e-9), "at least 0.2 s of a clip stays (\(over))")
    }

    test("clips: retakes never match across a clip boundary") {
      func line(_ text: String, from t0: Double) -> [Word] {
        text.split(separator: " ").enumerated().map { i, t in w(String(t), t0 + Double(i) * 0.3, t0 + Double(i) * 0.3 + 0.25) }
      }
      let first = line("so today we are going to", from: 0.2)
      let second = line("so today we are going to talk about it.", from: 0.2)
      let a = clip("c0", 2.2), b = clip("k1", 3.2)
      let parts = [ClipTimeline.Part(clip: a, analysis: clipAnalysis(2.2, words: first)), ClipTimeline.Part(clip: b, analysis: clipAnalysis(3.2, words: second))]
      let opts = AnalysisOptions(silence: .off, fillers: .off, retakes: true, language: "en")
      let joined = ClipTimeline.concatenate(parts, primaryId: "c0").transcript?.words ?? []
      check(!RetakeDetector.detect(words: joined).isEmpty, "the same words in one clip would be a retake")
      let perClip = ClipTimeline.suggest(parts, primaryId: "c0", options: opts)
      check(!perClip.contains { $0.reason == .retake }, "per-clip detection finds none across the boundary (\(perClip.map(\.id)))")
      // Inside one clip it still works, and the id carries the clip.
      let inside = ClipTimeline.Part(clip: clip("k2", 6), analysis: clipAnalysis(6, words: line("so today we are going to", from: 0) + line("so today we are going to talk about it.", from: 2.5)))
      let found = ClipTimeline.suggest([parts[0], inside], primaryId: "c0", options: opts).filter { $0.reason == .retake }
      check(found.count == 1 && found[0].id.hasPrefix("k2/") && found[0].start >= 2.2, "retake inside a later clip, offset and prefixed")
    }

    test("clips: legacy project and document decode unchanged") {
      let meta = try decodeJSON(ProjectMeta.self, #"{"id":"p","title":"Talk","sourceFile":"source.mov","createdAt":0,"media":{"durationSec":6,"width":720,"height":1280,"fps":30,"isHDR":false,"hasAudio":true},"posterFile":"poster.jpg"}"#)
      check(meta.clips == nil && meta.allClips.count == 1, "no clips: one legacy clip")
      check(meta.primaryClip.id == ClipTimeline.legacyClipId && meta.primaryClip.sourceFile == "source.mov" && meta.primaryClip.posterFile == "poster.jpg", "legacy clip c0 = the source file")
      let doc = try decodeJSON(EditDocument.self, ##"{"version":1,"cuts":[{"id":"s","start":1,"end":2,"reason":"silence","accepted":true,"confidence":1}],"wordOverrides":[],"captions":{"styleId":"pop","font":"poppins","sizeScale":1,"colors":{"base":"#FFFFFF","active":"#FFE14D","stroke":"#000000","bg":"transparent"},"position":{"y":0.66},"uppercase":false,"maxWords":4,"enabled":true},"zoom":{"mode":"off","intensity":2,"faceFollow":true},"crop":{"auto916":true},"audio":{"mode":"original"}}"##)
      check(doc.clipOrder == nil && doc.clipTrims == nil, "old document: no clip order or trims")
      let a = clipAnalysis(6, words: [w("hi", 0.2, 0.5)])
      check(a.clips == nil, "old analysis: no spans")
      let plan = EditPlanner.plan(doc: doc, analysis: a)
      check(near(plan.compDuration, 5, 1e-6), "plans exactly as before (\(plan.compDuration))")
      let joined = ClipTimeline.concatenate([ClipTimeline.Part(clip: meta.primaryClip, analysis: clipAnalysis(6, words: [w("hi", 0.2, 0.5)], cuts: doc.cuts))], primaryId: "c0")
      check(joined.cuts.map(\.id) == ["s"] && joined.warnings.isEmpty && near(joined.media.durationSec, 6), "one clip concatenates to itself")
      var multi = meta
      multi.clips = [meta.primaryClip, clip("k1", 4)]
      let round = try decodeJSON(ProjectMeta.self, try encodeJSON(multi))
      check(round.allClips.map(\.id) == ["c0", "k1"] && round.sourceFile == "source.mov", "clips round-trip; sourceFile stays the first clip")
      check(ProjectMeta.derivedMedia(round.allClips).map { near($0.durationSec, 10) && $0.width == 720 } ?? false, "project media: sum of clips, first clip's shape")
    }

    print("\n\(passes) passed, \(failures) failed")
    exit(failures == 0 ? 0 : 1)
  }
}
