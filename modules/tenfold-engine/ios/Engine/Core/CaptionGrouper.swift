import Foundation

/// Words → caption cards on the composition timeline (spec §4.9).
public enum CaptionGrouper {
  public static let maxCharsPerLine = 22
  public static let maxLines = 2
  public static let maxCardSec = 2.2
  public static let minCardSec = 0.6
  public static let gapBreak = 0.35

  public static func group(
    words: [Word], overrides: [WordOverride], mapper: TimeMapper, maxWords: Int, uppercase: Bool,
    envelope: [Float], emphasis: Bool
  ) -> [CaptionCard] {
    let override = Dictionary(overrides.map { ($0.wordIndex, $0.text) }, uniquingKeysWith: { _, b in b })
    // Visible words in composition time.
    var visible: [CardWord] = []
    var sourceTimes: [(Double, Double)] = []
    for (i, w) in words.enumerated() {
      guard mapper.isKept(w.start, w.end) else { continue }
      var text = override[i] ?? w.text
      text = text.trimmingCharacters(in: .whitespaces)
      guard !text.isEmpty else { continue }
      if uppercase { text = text.uppercased() }
      let s = mapper.toComp(w.start), e = max(mapper.toComp(w.end), s + 0.04)
      visible.append(CardWord(index: i, text: text, start: s, end: e, emphasis: false))
      sourceTimes.append((w.start, w.end))
    }

    let limitWords = max(1, maxWords)
    let maxChars = maxCharsPerLine * maxLines
    var cards: [CaptionCard] = []
    var cur: [CardWord] = []
    var curSrc: [(Double, Double)] = []

    func flush() {
      guard let first = cur.first, let last = cur.last else { return }
      var ws = cur
      if emphasis, ws.count > 1 {
        let loudest = curSrc.indices.max { Envelope.mean(envelope, from: curSrc[$0].0, to: curSrc[$0].1) < Envelope.mean(envelope, from: curSrc[$1].0, to: curSrc[$1].1) }
        if let l = loudest { ws[l].emphasis = true }
      }
      cards.append(CaptionCard(start: first.start, end: last.end, words: ws))
      cur = []
      curSrc = []
    }

    for (k, w) in visible.enumerated() {
      if let last = cur.last {
        var chars: Int = cur.count + w.text.count
        for c in cur { chars += c.text.count }
        let gap = w.start - last.end
        let tooLong = w.end - (cur.first?.start ?? w.start) > maxCardSec
        if cur.count >= limitWords || chars > maxChars || gap >= gapBreak || tooLong { flush() }
      }
      cur.append(w)
      curSrc.append(sourceTimes[k])
      if let c = w.text.last, ".!?,;:".contains(c) { flush() }
    }
    flush()

    // Minimum on-screen time, without overlapping the next card or running past the clip.
    for i in cards.indices where cards[i].end - cards[i].start < minCardSec {
      let limit = i + 1 < cards.count ? cards[i + 1].start : cards[i].start + minCardSec
      cards[i].end = min(cards[i].start + minCardSec, max(cards[i].end, limit))
    }
    let end = mapper.compDuration
    return cards.compactMap { c in
      var c = c
      c.end = min(c.end, end)
      return c.end > c.start ? c : nil
    }
  }
}
