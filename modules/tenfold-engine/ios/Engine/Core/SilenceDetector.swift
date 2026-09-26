import Foundation

public struct SilenceParams: Sendable, Equatable {
  public var minSilence: Double
  public var padding: Double
  public static let maxGapKept = 0.15

  public static func forLevel(_ level: SilenceLevel) -> SilenceParams? {
    switch level {
    case .off: return nil
    case .light: return SilenceParams(minSilence: 0.6, padding: 0.12)
    case .medium: return SilenceParams(minSilence: 0.4, padding: 0.08)
    case .aggressive: return SilenceParams(minSilence: 0.25, padding: 0.05)
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

    // 3–4. Long enough → shrink by padding, keeping at least maxGapKept of breathing room.
    let pad = max(params.padding, SilenceParams.maxGapKept / 2)
    var cuts: [Cut] = []
    for g in gaps where g.duration >= params.minSilence {
      let atStart = g.start <= 0.001
      let atEnd = g.end >= Double(env.count) * frame - 0.001
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
