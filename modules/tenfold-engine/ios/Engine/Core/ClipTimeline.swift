import Foundation

/**
 * Multi-clip projects (pure; mirrored in src/editor/clips.ts).
 *
 * The project SOURCE timeline is the clips played one after another: clip k occupies
 * [offset_k, offset_k + duration_k], where offset_k is the sum of the durations of the clips before it in
 * play order (EditDocument.clipOrder). Every existing source-time field — cuts, splits, caption boundaries,
 * word times, levels, faces — lives on this concatenated timeline, so the cut planner, captions, zoom and
 * audio work unchanged. Only the analysis (stored per clip, concatenated here) and the composition builder
 * (which inserts each piece from the right file) know where the clip boundaries are.
 *
 * - Word indices (caption ids "w<index>", word overrides) are positions in the concatenated transcript, so
 *   reordering or deleting clips renumbers them; the editor remaps them (src/editor/clips.ts).
 * - Clip trims (EditDocument.clipTrims) become manual cuts at plan time; they are never stored as cuts.
 * - Analysis runs per clip, so silences and retakes never span a clip boundary.
 */
public enum ClipTimeline {
  /// Id of the one clip of a project saved before multi-clip projects.
  public static let legacyClipId = "c0"
  /// Shortest a clip can be trimmed to.
  public static let minClipSec = 0.2

  /// One clip and its own analysis (times from 0 at the clip's start).
  public struct Part: Sendable {
    public var clip: ClipMeta
    public var analysis: Analysis
    public init(clip: ClipMeta, analysis: Analysis) {
      self.clip = clip
      self.analysis = analysis
    }
  }

  /// Clips in play order: the ids in `order` that exist (first occurrence wins), or every clip when `order`
  /// is nil. Never empty when `clips` isn't (an order naming no known clip plays the first clip).
  public static func ordered(_ clips: [ClipMeta], order: [String]?) -> [ClipMeta] {
    guard let order else { return clips }
    var byId: [String: ClipMeta] = [:]
    for c in clips { byId[c.id] = c }
    var seen = Set<String>()
    var out: [ClipMeta] = []
    for id in order {
      guard let c = byId[id], !seen.contains(id) else { continue }
      seen.insert(id)
      out.append(c)
    }
    if out.isEmpty, let first = clips.first { out = [first] }
    return out
  }

  /// Cut ids from different clips must not collide: the primary clip keeps its ids (so documents saved
  /// before multi-clip projects still match), every other clip's are prefixed with its id.
  public static func cutId(_ id: String, clipId: String, primaryId: String) -> String {
    clipId == primaryId ? id : "\(clipId)/\(id)"
  }

  /// Envelope frames that cover `duration` seconds exactly, so levels after a clip boundary don't drift.
  public static func frameCount(_ duration: Double) -> Int {
    guard duration.isFinite, duration > 0 else { return 0 }
    return Int((duration / Envelope.frameSec).rounded())
  }

  static func fitted(_ envelope: [Float], frames: Int) -> [Float] {
    if envelope.count == frames { return envelope }
    if envelope.count > frames { return Array(envelope.prefix(frames)) }
    return envelope + [Float](repeating: Envelope.floorDb, count: frames - envelope.count)
  }

  static func shifted(_ c: Cut, by offset: Double, clipId: String, primaryId: String) -> Cut {
    var out = c
    out.id = cutId(c.id, clipId: clipId, primaryId: primaryId)
    out.start = c.start + offset
    out.end = c.end + offset
    return out
  }

  /// The project analysis for clips in play order: words, levels, faces and suggested cuts offset onto the
  /// concatenated timeline. `canvas` is the project's shape (its first clip), which reordering never changes.
  public static func concatenate(_ parts: [Part], primaryId: String, canvas: MediaInfo? = nil) -> Analysis {
    var offset = 0.0
    var words: [Word] = []
    var envelope: [Float] = []
    var cuts: [Cut] = []
    var faces: [FacePoint] = []
    var warnings: [String] = []
    var spans: [ClipSpan] = []
    var transcript: Transcript?
    var allExact = true
    var stats = TranscriptStats()
    var singleWordRuns = 0.0
    var coverage = 0.0
    var noiseFloor = 0.0
    var threshold = -38.0
    var longest = -1.0
    var noSpeech = true
    var hasAudio = false
    var isHDR = false
    let many = parts.count > 1

    for part in parts {
      let a = part.analysis
      let duration = max(0, part.clip.media.durationSec)
      let clipWords = a.transcript?.words ?? []
      spans.append(ClipSpan(id: part.clip.id, title: part.clip.title, start: offset, end: offset + duration, wordStart: words.count, wordCount: clipWords.count))
      for w in clipWords {
        var moved = w
        moved.start = w.start + offset
        moved.end = w.end + offset
        words.append(moved)
      }
      if let t = a.transcript {
        if transcript == nil { transcript = Transcript(words: [], language: t.language, engine: t.engine, wordTimingIsExact: true) }
        allExact = allExact && t.wordTimingIsExact
        stats.runCount += t.stats.runCount
        singleWordRuns += t.stats.singleWordRunRatio * Double(t.stats.runCount)
        stats.lexicalFillerCount += t.stats.lexicalFillerCount
        stats.elapsedSec += t.stats.elapsedSec
      }
      envelope += fitted(a.envelopeDb, frames: frameCount(duration))
      for c in a.cuts { cuts.append(shifted(c, by: offset, clipId: part.clip.id, primaryId: primaryId)) }
      for f in a.faces { faces.append(FacePoint(time: f.time + offset, x: f.x, y: f.y)) }
      for text in a.warnings {
        let w = many ? "\(part.clip.title): \(text)" : text
        if !warnings.contains(w) { warnings.append(w) }
      }
      coverage += a.speechCoverage * duration
      if duration > longest {
        longest = duration
        noiseFloor = a.noiseFloorDb
        threshold = a.speechThresholdDb
      }
      noSpeech = noSpeech && a.noSpeech
      hasAudio = hasAudio || part.clip.media.hasAudio
      isHDR = isHDR || part.clip.media.isHDR
      offset += duration
    }

    if var t = transcript {
      t.words = words
      t.wordTimingIsExact = allExact
      stats.singleWordRunRatio = stats.runCount > 0 ? singleWordRuns / Double(stats.runCount) : 0
      t.stats = stats
      transcript = t
    }
    let shape = canvas ?? parts.first?.clip.media ?? MediaInfo(durationSec: 0, width: 1080, height: 1920, fps: 30, isHDR: false, hasAudio: false)
    let media = MediaInfo(durationSec: offset, width: shape.width, height: shape.height, fps: shape.fps, isHDR: isHDR, hasAudio: hasAudio)
    return Analysis(
      version: parts.first?.analysis.version ?? 1, media: media, transcript: transcript, envelopeDb: envelope, noiseFloorDb: noiseFloor,
      speechThresholdDb: threshold, speechCoverage: offset > 0 ? coverage / offset : 0, noSpeech: noSpeech,
      cuts: cuts.sorted { $0.start < $1.start }, faces: faces, warnings: warnings, clips: spans)
  }

  /// Silence / filler / retake suggestions at new strengths, detected clip by clip (so nothing spans a
  /// boundary) and offset onto the concatenated timeline.
  public static func suggest(_ parts: [Part], primaryId: String, options: AnalysisOptions) -> [Cut] {
    var offset = 0.0
    var out: [Cut] = []
    for part in parts {
      let a = part.analysis
      if !a.noSpeech {
        let r = AnalysisPlanner.detect(
          envelope: a.envelopeDb, words: a.transcript?.words ?? [], wordTimingIsExact: a.transcript?.wordTimingIsExact ?? true,
          language: a.transcript?.language ?? options.language, options: options)
        for c in r.cuts { out.append(shifted(c, by: offset, clipId: part.clip.id, primaryId: primaryId)) }
      }
      offset += max(0, part.clip.media.durationSec)
    }
    return out.sorted { $0.start < $1.start }
  }

  /// A trim's head and tail, clamped so at least `minClipSec` of the clip stays.
  public static func clamped(_ t: ClipTrim, length: Double) -> (head: Double, tail: Double) {
    let room = max(0, length - minClipSec)
    let head = min(room, max(0, t.head.isFinite ? t.head : 0))
    let tail = min(room - head, max(0, t.tail.isFinite ? t.tail : 0))
    return (head, tail)
  }

  /// The document's clip trims as accepted manual cuts on the concatenated timeline.
  public static func trimCuts(_ trims: [ClipTrim]?, spans: [ClipSpan]) -> [Cut] {
    guard let trims, !trims.isEmpty else { return [] }
    var out: [Cut] = []
    for t in trims {
      guard let s = spans.first(where: { $0.id == t.clipId }) else { continue }
      let (head, tail) = clamped(t, length: s.end - s.start)
      if head > 0.001 {
        out.append(Cut(id: "trim:\(t.clipId):head", start: s.start, end: s.start + head, reason: .manual, accepted: true, confidence: 1))
      }
      if tail > 0.001 {
        out.append(Cut(id: "trim:\(t.clipId):tail", start: s.end - tail, end: s.end, reason: .manual, accepted: true, confidence: 1))
      }
    }
    return out
  }
}
