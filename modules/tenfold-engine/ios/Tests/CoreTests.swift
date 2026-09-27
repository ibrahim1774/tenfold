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

    print("\n\(passes) passed, \(failures) failed")
    exit(failures == 0 ? 0 : 1)
  }
}
