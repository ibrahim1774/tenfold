import Foundation

/// Words → caption cards on the composition timeline (spec §4.9), then the user's caption edits.
///
/// Card ids are "w" + the transcript index of the card's first word, so they survive re-grouping:
/// splitting, merging or retiming one card never renames another.
public enum CaptionGrouper {
  public static let maxCharsPerLine = 22
  public static let maxLines = 2
  public static let maxCardSec = 2.2
  public static let minCardSec = 0.6
  public static let gapBreak = 0.35
  /// Shortest a card can be retimed to.
  public static let minRetimeSec = 0.3
  /// How close a stored boundary must be to a word start to count as "at" it.
  static let boundaryTolerance = 0.001

  public struct Output: Sendable {
    public var cards: [CaptionCard]
    public var hidden: [CaptionCard]
  }

  /// Visible cards only (hidden groups removed).
  public static func group(
    words: [Word], overrides: [WordOverride], mapper: TimeMapper, maxWords: Int, uppercase: Bool,
    envelope: [Float], emphasis: Bool, edits: CaptionEdits? = nil
  ) -> [CaptionCard] {
    groupAll(
      words: words, overrides: overrides, mapper: mapper, maxWords: maxWords, uppercase: uppercase,
      envelope: envelope, emphasis: emphasis, edits: edits
    ).cards
  }

  /// True when some stored time lies in (after, upTo + tolerance]: between the previous visible word's start
  /// and this word's start. Words cut out in between don't lose the boundary.
  static func contains(_ times: [Double], after: Double, upTo: Double) -> Bool {
    for t in times where t > after + boundaryTolerance && t <= upTo + boundaryTolerance { return true }
    return false
  }

  public static func groupAll(
    words: [Word], overrides: [WordOverride], mapper: TimeMapper, maxWords: Int, uppercase: Bool,
    envelope: [Float], emphasis: Bool, edits: CaptionEdits? = nil
  ) -> Output {
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

    let forced: [Double] = edits?.boundaries ?? []
    let merged: [Double] = edits?.merges ?? []
    let limitWords = max(1, maxWords)
    let maxChars = maxCharsPerLine * maxLines
    var cards: [CaptionCard] = []
    var cur: [CardWord] = []
    var curSrc: [(Double, Double)] = []
    // Where the automatic limits start counting inside `cur`: after a merge, the absorbed group keeps
    // its own word/length limits, so a merged card holds both groups whole.
    var seg = 0

    func flush() {
      guard let first = cur.first, let last = cur.last else { return }
      var ws = cur
      if emphasis, ws.count > 1 {
        let loudest = curSrc.indices.max { Envelope.mean(envelope, from: curSrc[$0].0, to: curSrc[$0].1) < Envelope.mean(envelope, from: curSrc[$1].0, to: curSrc[$1].1) }
        if let l = loudest { ws[l].emphasis = true }
      }
      cards.append(CaptionCard(id: "w\(first.index)", start: first.start, end: last.end, words: ws))
      cur = []
      curSrc = []
      seg = 0
    }

    // One decision per word: does a new card start here? A split (forced boundary) always breaks;
    // a merge suppresses every automatic reason; otherwise the usual limits apply. When both a split and
    // a merge sit at the same place, the split wins (the editor removes the opposite entry when it adds one).
    for (k, w) in visible.enumerated() {
      if let last = cur.last {
        let prevStart = curSrc[curSrc.count - 1].0
        let here = sourceTimes[k].0
        let isForced = contains(forced, after: prevStart, upTo: here)
        let isMerged = contains(merged, after: prevStart, upTo: here)
        var auto = false
        let count: Int = cur.count - seg
        var chars: Int = count + w.text.count
        for c in cur[seg...] { chars += c.text.count }
        let gap: Double = w.start - last.end
        let span: Double = w.end - cur[seg].start
        if count >= limitWords || chars > maxChars || gap >= gapBreak || span > maxCardSec { auto = true }
        if let c = last.text.last, ".!?,;:".contains(c) { auto = true }
        if isForced || (auto && !isMerged) {
          flush()
        } else if isMerged {
          seg = cur.count
        }
      }
      cur.append(w)
      curSrc.append(sourceTimes[k])
    }
    flush()

    // Minimum on-screen time, without overlapping the next card or running past the clip.
    for i in cards.indices where cards[i].end - cards[i].start < minCardSec {
      let limit = i + 1 < cards.count ? cards[i + 1].start : cards[i].start + minCardSec
      cards[i].end = min(cards[i].start + minCardSec, max(cards[i].end, limit))
    }
    let end = mapper.compDuration
    for i in cards.indices { cards[i].end = min(cards[i].end, end) }
    cards = cards.filter { $0.end > $0.start }

    applyTiming(&cards, timing: edits?.timing ?? [], mapper: mapper)

    let hiddenIds = Set(edits?.hidden ?? [])
    var shown: [CaptionCard] = []
    var hidden: [CaptionCard] = []
    for c in cards {
      if hiddenIds.contains(c.id) { hidden.append(c) } else { shown.append(c) }
    }
    return Output(cards: shown, hidden: hidden)
  }

  /// Retimed edges (source seconds) → composition time, clamped so a card never crosses its neighbours
  /// or the clip, and never gets shorter than `minRetimeSec` (or its own length, if that is shorter).
  static func applyTiming(_ cards: inout [CaptionCard], timing: [CaptionTiming], mapper: TimeMapper) {
    guard !timing.isEmpty, !cards.isEmpty else { return }
    var byId: [String: CaptionTiming] = [:]
    for t in timing { byId[t.id] = t }
    let total = mapper.compDuration
    // Wanted edges first, so a card can clamp against its neighbour's retimed start.
    var wantStart: [Double] = []
    var wantEnd: [Double] = []
    for c in cards {
      var s = c.start
      var e = c.end
      if let t = byId[c.id] {
        if let ts = t.start { s = mapper.toComp(ts) }
        if let te = t.end { e = mapper.toComp(te) }
      }
      wantStart.append(s)
      wantEnd.append(e)
    }
    // In order: the previous card is final, the next one is where it wants to start. (If two retimed cards
    // compete for the same moment, the later card keeps its start.)
    for i in cards.indices {
      guard byId[cards[i].id] != nil else { continue }
      let lo: Double = i > 0 ? cards[i - 1].end : 0
      let hi: Double = max(lo, i + 1 < cards.count ? wantStart[i + 1] : total)
      var s = max(lo, min(wantStart[i], hi))
      var e = max(s, min(wantEnd[i], hi))
      let minLen: Double = min(minRetimeSec, hi - lo)
      if e - s < minLen {
        // Keep the edge the user moved and push the other one, staying inside the neighbours.
        e = min(hi, s + minLen)
        s = max(lo, e - minLen)
      }
      cards[i].start = s
      cards[i].end = e
    }
  }
}
