import Foundation

public enum FillerRule: Sendable, Equatable {
  /// Always a filler (um, uh…).
  case always
  /// "like": only between commas or followed by a pause ≥ 0.2 s.
  case likeRule
  /// Sentence-final "right?".
  case sentenceFinalQuestion
  /// Discourse markers that are often, but not always, filler.
  case soft
}

public struct FillerEntry: Sendable, Equatable {
  public var tokens: [String]
  public var rule: FillerRule
  public var confidence: Double
}

public enum FillerLexicon {
  public static func entries(language: String) -> [FillerEntry] {
    let lang = String(language.lowercased().prefix(2))
    switch lang {
    case "es":
      return ["eh", "em", "mm", "este", "pues"].map { single($0, lang: "es") } + [
        FillerEntry(tokens: ["o", "sea"], rule: .soft, confidence: 0.7)
      ]
    default:
      let hard = ["um", "umm", "uh", "uhh", "uhm", "erm", "er", "ah", "hmm", "mm", "mhm"].map {
        FillerEntry(tokens: [$0], rule: .always, confidence: 0.95)
      }
      return hard + [
        FillerEntry(tokens: ["like"], rule: .likeRule, confidence: 0.75),
        FillerEntry(tokens: ["right"], rule: .sentenceFinalQuestion, confidence: 0.6),
        FillerEntry(tokens: ["you", "know"], rule: .soft, confidence: 0.7),
        FillerEntry(tokens: ["i", "mean"], rule: .soft, confidence: 0.7),
        FillerEntry(tokens: ["sort", "of"], rule: .soft, confidence: 0.6),
        FillerEntry(tokens: ["kind", "of"], rule: .soft, confidence: 0.6),
        FillerEntry(tokens: ["basically"], rule: .soft, confidence: 0.6),
        FillerEntry(tokens: ["literally"], rule: .soft, confidence: 0.6),
      ]
    }
  }

  private static func single(_ t: String, lang: String) -> FillerEntry {
    // "este"/"pues" are also real words; keep them soft.
    let soft = ["este", "pues"].contains(t)
    return FillerEntry(tokens: [t], rule: soft ? .soft : .always, confidence: soft ? 0.65 : 0.95)
  }

  /// Lowercase, strip surrounding punctuation (keeps inner apostrophes).
  public static func normalize(_ s: String) -> String {
    s.lowercased().trimmingCharacters(in: CharacterSet.punctuationCharacters.union(.whitespaces).union(.symbols))
  }
}

/// Lexical + acoustic filler detection (spec §4.6).
public enum FillerDetector {
  /// Returns the words (with isFiller marked) and the filler cuts.
  public static func detect(
    words: [Word], language: String, envelope env: [Float], levels: SpeechLevels, level: FillerLevel, acoustic: Bool
  ) -> (words: [Word], cuts: [Cut], lexicalCount: Int) {
    var marked = words
    guard level != .off else { return (marked, [], 0) }
    let acceptAt: Double = level == .aggressive ? 0.6 : 0.9
    let lexicon = FillerLexicon.entries(language: language)
    let norm = words.map { FillerLexicon.normalize($0.text) }
    var cuts: [Cut] = []
    var lexical = 0
    var i = 0
    while i < words.count {
      var matched: (entry: FillerEntry, len: Int)?
      for e in lexicon.sorted(by: { $0.tokens.count > $1.tokens.count }) {
        let n = e.tokens.count
        guard i + n <= words.count, Array(norm[i..<(i + n)]) == e.tokens else { continue }
        if ruleHolds(e.rule, at: i, len: n, words: words) {
          matched = (e, n)
          break
        }
      }
      if let m = matched {
        let first = words[i], last = words[i + m.len - 1]
        let prevEnd = i > 0 ? words[i - 1].end : 0
        let nextStart = i + m.len < words.count ? words[i + m.len].start : last.end + 1
        let s = max(prevEnd, first.start - 0.03)
        let e = min(nextStart, last.end + 0.03)
        for k in i..<(i + m.len) { marked[k].isFiller = true }
        lexical += 1
        cuts.append(Cut(id: String(format: "f%d", i), start: s, end: e, reason: .filler, accepted: m.entry.confidence >= acceptAt, confidence: m.entry.confidence))
        i += m.len
      } else {
        i += 1
      }
    }

    // Acoustic fallback: voiced gaps between words that the transcriber dropped ("voiced non-words").
    if acoustic, words.count > 1 {
      for k in 1..<words.count {
        let g = TimeRange(start: words[k - 1].end, end: words[k].start)
        guard g.duration >= 0.25 else { continue }
        let a = max(0, Envelope.frameIndex(g.start)), b = min(env.count, Envelope.frameIndex(g.end))
        guard b > a else { continue }
        let voiced = (a..<b).filter { Double(env[$0]) >= levels.thresholdDb }.count
        if Double(voiced) / Double(b - a) >= 0.6 {
          let conf = 0.6
          cuts.append(Cut(id: String(format: "v%d", k), start: g.start + 0.02, end: g.end - 0.02, reason: .filler, accepted: conf >= acceptAt, confidence: conf))
        }
      }
    }
    return (marked, cuts, lexical)
  }

  private static func ruleHolds(_ rule: FillerRule, at i: Int, len: Int, words: [Word]) -> Bool {
    switch rule {
    case .always, .soft:
      return true
    case .likeRule:
      let w = words[i]
      let prevComma = i > 0 && words[i - 1].text.hasSuffix(",")
      let ownComma = w.text.hasSuffix(",")
      let pauseAfter = i + 1 < words.count ? words[i + 1].start - w.end >= 0.2 : true
      return (prevComma && ownComma) || pauseAfter
    case .sentenceFinalQuestion:
      return words[i].text.hasSuffix("?")
    }
  }
}
