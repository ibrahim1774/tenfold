import Foundation

/**
 * Pauses are shortened, not deleted: a pause longer than `minSilence` is cut down to `keep` seconds
 * (like Descript's "shorten word gaps"), and a pause that ends a sentence keeps `sentenceExtra` more,
 * so the edit breathes where the speaker did.
 */
public struct SilenceParams: Sendable, Equatable {
  public var minSilence: Double
  /// Seconds of the pause left in place, split evenly around the cut.
  public var keep: Double
  public var sentenceExtra: Double
  public static let maxGapKept = 0.15

  /// Legacy name: half of the kept gap sits on each side.
  public var padding: Double { keep / 2 }

  public static func forLevel(_ level: SilenceLevel) -> SilenceParams? {
    switch level {
    case .off: return nil
    case .light: return SilenceParams(minSilence: 0.7, keep: 0.4, sentenceExtra: 0.2)
    case .medium: return SilenceParams(minSilence: 0.5, keep: 0.3, sentenceExtra: 0.15)
    case .aggressive: return SilenceParams(minSilence: 0.3, keep: 0.2, sentenceExtra: 0.1)
    }
  }
}

/// RMS-energy silence detector (spec §4.5).
public enum SilenceDetector {
  public static func detect(envelope env: [Float], levels: SpeechLevels, words: [Word], params: SilenceParams) -> [Cut] {
    let frame = Envelope.frameSec
    // 1. Runs of quiet frames.
    var runs: [TimeRange] = []
    var runStart: Int?
    for (i, db) in env.enumerated() {
      let quiet = Double(db) < levels.thresholdDb
      if quiet, runStart == nil { runStart = i }
      if !quiet, let s = runStart {
        runs.append(TimeRange(start: Double(s) * frame, end: Double(i) * frame))
        runStart = nil
      }
    }
    if let s = runStart { runs.append(TimeRange(start: Double(s) * frame, end: Double(env.count) * frame)) }

    // 2. Never cut inside a word: subtract word spans from each run.
    let sortedWords = words.sorted { $0.start < $1.start }
    var gaps: [TimeRange] = []
    for run in runs {
      var pieces = [run]
      for w in sortedWords where w.end > run.start && w.start < run.end {
        pieces = pieces.flatMap { p -> [TimeRange] in
          guard w.end > p.start && w.start < p.end else { return [p] }
          var out: [TimeRange] = []
          if w.start > p.start { out.append(TimeRange(start: p.start, end: w.start)) }
          if w.end < p.end { out.append(TimeRange(start: w.end, end: p.end)) }
          return out
        }
      }
      gaps.append(contentsOf: pieces)
    }

    // 3–4. Long enough → shorten to the kept gap (a little longer after a sentence ends).
    var cuts: [Cut] = []
    for g in gaps where g.duration >= params.minSilence {
      let atStart = g.start <= 0.001
      let atEnd = g.end >= Double(env.count) * frame - 0.001
      let before = sortedWords.last { $0.end <= g.start + 0.02 }
      let endsSentence = before.map { w in w.text.last.map { ".?!".contains($0) } ?? false } ?? false
      let keep = max(params.keep + (endsSentence ? params.sentenceExtra : 0), SilenceParams.maxGapKept)
      let pad = keep / 2
      // Leading/trailing silence of the clip can go entirely (minus a small pad).
      let s = atStart ? 0 : g.start + pad
      let e = atEnd ? g.end : g.end - pad
      if e - s >= 0.1 {
        cuts.append(Cut(id: String(format: "s%.3f", s), start: s, end: e, reason: .silence, accepted: true, confidence: 1))
      }
    }
    return cuts
  }
}
