import Foundation

/// Turns audio levels + transcript into the suggested cut list (pure; the media pipeline calls this).
public enum AnalysisPlanner {
  public struct Result: Sendable {
    public var words: [Word]
    public var cuts: [Cut]
    public var levels: SpeechLevels
    public var noSpeech: Bool
    public var lexicalFillers: Int
  }

  public static func detect(
    envelope: [Float], words: [Word], wordTimingIsExact: Bool, language: String, options: AnalysisOptions
  ) -> Result {
    let levels = SpeechLevels.measure(envelope)
    // Safety rule: music-only or b-roll clips get no automatic cuts.
    let noSpeech = levels.coverage < 0.2 && words.count < 3
    guard !noSpeech else { return Result(words: words, cuts: [], levels: levels, noSpeech: true, lexicalFillers: 0) }

    var cuts: [Cut] = []
    if let p = SilenceParams.forLevel(options.silence) {
      cuts += SilenceDetector.detect(envelope: envelope, levels: levels, words: words, params: p)
    }
    // Interpolated timings are too loose to cut single words precisely; offer them as candidates only.
    let fillerLevel: FillerLevel = options.fillers
    let f = FillerDetector.detect(
      words: words, language: language, envelope: envelope, levels: levels, level: fillerLevel, acoustic: true)
    let fillerCuts = wordTimingIsExact ? f.cuts : f.cuts.map { c -> Cut in
      var c = c
      c.accepted = c.accepted && fillerLevel == .aggressive
      return c
    }
    cuts += fillerCuts
    return Result(words: f.words, cuts: cuts.sorted { $0.start < $1.start }, levels: levels, noSpeech: false, lexicalFillers: f.lexicalCount)
  }
}
