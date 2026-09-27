import Foundation

/**
 * Finds repeated attempts at a sentence ("So today we're— So today we're going to…") and cuts the
 * earlier attempt, keeping the last one (spec: retakes, like Descript's Remove Retakes).
 *
 * Deliberately strict, so it never edits on a hunch:
 * - the later attempt must repeat at least `minMatch` consecutive words of the earlier one, exactly
 *   (fillers ignored, punctuation and case ignored);
 * - it must start within `maxGap` seconds of the earlier attempt ending;
 * - the earlier attempt may carry at most `maxStumble` extra words (the stumble) beyond the match;
 * - the cut is applied automatically only for a match of `autoWords` words or more; shorter matches
 *   are offered as suggestions (accepted = false).
 * Deliberate repetition ("no, no, no", a chorus) never matches: it needs at least 3 distinct words.
 */
public enum RetakeDetector {
  public static let minMatch = 3
  public static let autoWords = 5
  public static let maxGap = 6.0
  public static let maxStumble = 3

  static func token(_ w: Word) -> String {
    w.text.lowercased().filter { $0.isLetter || $0.isNumber || $0 == "\'" }
  }

  public static func detect(words: [Word]) -> [Cut] {
    // Compare on content words only; fillers are noise for matching.
    let idx = words.indices.filter { !words[$0].isFiller && !token(words[$0]).isEmpty }
    let toks = idx.map { token(words[$0]) }
    var cuts: [Cut] = []
    var i = 0
    while i + minMatch < toks.count {
      var found = false
      // Later attempt starts at j; it must begin soon after the earlier attempt's stumble could end.
      var j = i + minMatch
      while j < toks.count, j - i <= minMatch + maxStumble + 12 {
        if toks[j] == toks[i] {
          var len = 0
          while i + len < j, j + len < toks.count, toks[i + len] == toks[j + len] { len += 1 }
          let stumble = j - i - len
          let distinct = Set(toks[i..<(i + len)]).count
          if len >= minMatch, stumble <= maxStumble, distinct >= 3 {
            let firstEnd = words[idx[i + len - 1]].end
            let secondStart = words[idx[j]].start
            if secondStart - firstEnd <= maxGap {
              let start = max(i > 0 ? words[idx[i - 1]].end : 0, words[idx[i]].start - 0.03)
              let end = max(start + 0.05, secondStart - 0.03)
              let exact = stumble == 0 || (stumble > 0 && len >= autoWords)
              let auto = len >= autoWords && exact
              cuts.append(Cut(id: String(format: "r%.3f", start), start: start, end: end, reason: .retake,
                              accepted: auto, confidence: auto ? 0.95 : 0.6))
              i = j
              found = true
              break
            }
          }
        }
        j += 1
      }
      if !found { i += 1 }
    }
    return cuts
  }
}
