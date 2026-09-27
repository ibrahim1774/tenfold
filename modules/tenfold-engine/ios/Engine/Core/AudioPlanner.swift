import Foundation

/// One stretch of sound on the timeline (mirrored in src/engine/types.ts as AudioClip).
///
/// All times are OUTPUT (composition) seconds, like text overlays. `source` is "original" (the clip's own
/// sound, mapped back to source time through the cut plan) or "file" (a file in the project folder, e.g.
/// "audio/<id>.m4a"). Original clips never overlap each other. Unknown sources are ignored, so a newer
/// document still plays in an older build.
public struct AudioClip: Codable, Sendable, Equatable {
  public var id: String
  public var source: String
  public var file: String?
  public var title: String?
  public var start: Double
  public var end: Double
  /// Seconds into the file that play at `start` (trimmed head). 0 for original clips.
  public var offset: Double
  /// 0...2 (1 = as recorded).
  public var volume: Double
  public var fadeIn: Double
  public var fadeOut: Double
  /// Repeat the file to fill start...end.
  public var loop: Bool?
  /// File clips: dip to 20% while someone speaks.
  public var ducking: Bool?
  /// Length of the file when it was added (UI only: trim limits before the engine probes it again).
  public var fileDuration: Double?

  public var isOriginal: Bool { source == "original" }
  public var isFile: Bool { source == "file" }

  public init(
    id: String, source: String, file: String? = nil, title: String? = nil, start: Double, end: Double, offset: Double = 0,
    volume: Double = 1, fadeIn: Double = 0, fadeOut: Double = 0, loop: Bool? = nil, ducking: Bool? = nil, fileDuration: Double? = nil
  ) {
    self.id = id
    self.source = source
    self.file = file
    self.title = title
    self.start = start
    self.end = end
    self.offset = offset
    self.volume = volume
    self.fadeIn = fadeIn
    self.fadeOut = fadeOut
    self.loop = loop
    self.ducking = ducking
    self.fileDuration = fileDuration
  }

  enum CodingKeys: String, CodingKey { case id, source, file, title, start, end, offset, volume, fadeIn, fadeOut, loop, ducking, fileDuration }

  /// Every field but the times has a default, so partial records decode.
  public init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    id = try c.decodeIfPresent(String.self, forKey: .id) ?? "a"
    source = try c.decodeIfPresent(String.self, forKey: .source) ?? "original"
    file = try c.decodeIfPresent(String.self, forKey: .file)
    title = try c.decodeIfPresent(String.self, forKey: .title)
    start = try c.decodeIfPresent(Double.self, forKey: .start) ?? 0
    end = try c.decodeIfPresent(Double.self, forKey: .end) ?? 0
    offset = try c.decodeIfPresent(Double.self, forKey: .offset) ?? 0
    volume = try c.decodeIfPresent(Double.self, forKey: .volume) ?? 1
    fadeIn = try c.decodeIfPresent(Double.self, forKey: .fadeIn) ?? 0
    fadeOut = try c.decodeIfPresent(Double.self, forKey: .fadeOut) ?? 0
    loop = try c.decodeIfPresent(Bool.self, forKey: .loop)
    ducking = try c.decodeIfPresent(Bool.self, forKey: .ducking)
    fileDuration = try c.decodeIfPresent(Double.self, forKey: .fileDuration)
  }
}

/// A point on a track's volume curve; the mix ramps linearly between consecutive points.
public struct GainPoint: Sendable, Equatable {
  public var t: Double
  public var gain: Double
  public init(_ t: Double, _ gain: Double) {
    self.t = t
    self.gain = gain
  }
}

/// Part of an original clip that falls inside one kept segment: `from`...`to` seconds after the segment's
/// composition start (the builder adds these to the segment's own CMTime cursor, so pieces never drift).
public struct OriginalPiece: Sendable, Equatable {
  public var segment: Int
  public var from: Double
  public var to: Double
}

/// One insert of a file into its track: file seconds `fileStart`...`fileStart + length`, placed at `at`.
public struct FilePiece: Sendable, Equatable {
  public var fileStart: Double
  public var length: Double
  public var at: Double
}

/// Pure planning for the audio lanes (the composition builder turns this into tracks and an audio mix).
///
/// Rules:
/// - `audioClips` absent → one original clip over the whole video (what documents did before).
/// - `audio.mode == .mute` drops every original clip; added sounds still play.
/// - Every clip is trimmed to the video: audio never makes the output longer.
/// - Ducking: kept words (output time) padded by `speechPad`, gaps under `mergeGap` merged. A ducked clip
///   ramps to volume × `duckGain` over `duckRamp` at each speech start and back after each end, only
///   where an original clip is actually heard.
public enum AudioPlanner {
  public static let minClip = 0.01
  public static let speechPad = 0.15
  public static let mergeGap = 0.3
  public static let duckGain = 0.2
  public static let duckRamp = 0.12
  /// A short fade at every edge of the original sound, so splits and cuts don't click.
  public static let clickGuard = 0.01
  /// Most speech intervals one clip ducks under (each is four ramp points).
  public static let maxSpeechIntervals = 150
  public static let maxLoopPieces = 400
  public static let maxVolume = 2.0
  /// Shortest ramp: a level change between two touching clips takes this long (3 ticks of the 1/600 s clock).
  public static let jumpSec = 0.005

  /// The clips that make sound, trimmed to the video, originals first then files, each in time order.
  public static func clips(doc: EditDocument, compDuration: Double) -> [AudioClip] {
    let list = doc.audioClips ?? [AudioClip(id: "original", source: "original", start: 0, end: compDuration)]
    var out: [AudioClip] = []
    for var c in list {
      guard c.isOriginal || c.isFile else { continue }
      if c.isOriginal && doc.audio.mode == .mute { continue }
      guard c.start.isFinite, c.end.isFinite else { continue }
      c.start = max(0, c.start)
      c.end = min(compDuration, c.end)
      guard c.end - c.start >= minClip else { continue }
      c.volume = c.volume.isFinite ? min(maxVolume, max(0, c.volume)) : 1
      c.fadeIn = c.fadeIn.isFinite ? max(0, c.fadeIn) : 0
      c.fadeOut = c.fadeOut.isFinite ? max(0, c.fadeOut) : 0
      c.offset = c.isFile && c.offset.isFinite ? max(0, c.offset) : 0
      out.append(c)
    }
    let originals = removeOverlaps(out.filter(\.isOriginal).sorted { $0.start < $1.start })
    let files = out.filter(\.isFile).sorted { $0.start < $1.start }
    return originals + files
  }

  /// Original clips never overlap; if a document says otherwise, the later one starts where the earlier ends.
  static func removeOverlaps(_ sorted: [AudioClip]) -> [AudioClip] {
    var out: [AudioClip] = []
    for var c in sorted {
      if let last = out.last, c.start < last.end { c.start = last.end }
      if c.end - c.start >= minClip { out.append(c) }
    }
    return out
  }

  /// Where an original clip's sound comes from: its window intersected with each kept segment.
  public static func originalPieces(clip: AudioClip, segments: [CompSegment]) -> [OriginalPiece] {
    var out: [OriginalPiece] = []
    for (i, s) in segments.enumerated() {
      let a = max(clip.start, s.compStart), b = min(clip.end, s.compEnd)
      guard b - a > 1e-6 else { continue }
      out.append(OriginalPiece(segment: i, from: a - s.compStart, to: b - s.compStart))
    }
    return out
  }

  /// Output → source seconds for the original sound (the video's own cut mapping).
  public static func sourceRanges(clip: AudioClip, segments: [CompSegment]) -> [TimeRange] {
    originalPieces(clip: clip, segments: segments).map {
      let s = segments[$0.segment]
      return TimeRange(start: s.start + $0.from, end: s.start + $0.to)
    }
  }

  /// Inserts that fill `start`...`end` from the file: once (as much as exists), or repeated when looping.
  public static func filePieces(offset: Double, fileDuration: Double, start: Double, end: Double, loop: Bool) -> [FilePiece] {
    let want = end - start
    guard fileDuration > 0.05, want > minClip else { return [] }
    // A looping clip split or trimmed past a repeat starts part-way through the file.
    let head = loop ? max(0, offset).truncatingRemainder(dividingBy: fileDuration) : min(max(0, offset), fileDuration)
    var out: [FilePiece] = []
    let first = min(want, fileDuration - head)
    if first > minClip { out.append(FilePiece(fileStart: head, length: first, at: start)) }
    guard loop else { return out }
    var at = start + max(0, first)
    while end - at > minClip, out.count < maxLoopPieces {
      let len = min(fileDuration, end - at)
      out.append(FilePiece(fileStart: 0, length: len, at: at))
      at += len
    }
    return out
  }

  /// Spoken words that survive the cuts, in composition seconds, padded and merged.
  public static func speech(words: [Word], mapper: TimeMapper) -> [TimeRange] {
    let total = mapper.compDuration
    let raw = words.filter { $0.end > $0.start && mapper.isKept($0.start, $0.end) }.map {
      TimeRange(start: max(0, mapper.toComp($0.start) - speechPad), end: min(total, mapper.toComp($0.end) + speechPad))
    }
    return capped(merge(raw, gap: mergeGap))
  }

  /// Sorts and merges ranges whose gap is under `gap` seconds.
  public static func merge(_ ranges: [TimeRange], gap: Double) -> [TimeRange] {
    var out: [TimeRange] = []
    for r in ranges.sorted(by: { $0.start < $1.start }) where r.end > r.start {
      if var last = out.last, r.start - last.end < gap {
        last.end = max(last.end, r.end)
        out[out.count - 1] = last
      } else {
        out.append(r)
      }
    }
    return out
  }

  /// Merges wider gaps until there are few enough intervals to ramp around.
  public static func capped(_ ranges: [TimeRange], max count: Int = maxSpeechIntervals) -> [TimeRange] {
    var out = ranges
    var gap = mergeGap
    while out.count > count {
      gap *= 2
      out = merge(out, gap: gap)
    }
    return out
  }

  /// Speech that is heard: the speech ranges inside the windows of original clips that aren't turned down to silence.
  public static func audibleSpeech(_ speech: [TimeRange], originals: [AudioClip]) -> [TimeRange] {
    var out: [TimeRange] = []
    for r in speech {
      for c in originals where c.volume > 0.01 {
        let a = max(r.start, c.start), b = min(r.end, c.end)
        if b > a { out.append(TimeRange(start: a, end: b)) }
      }
    }
    return merge(out, gap: mergeGap)
  }

  /// The clip's volume curve from `start` to `end`: volume × fades × ducking × click guards at `dips`
  /// (times where the sound jumps, e.g. cut boundaries inside an original clip). `guardStart`/`guardEnd`
  /// add a 10 ms fade at an edge where the sound starts or stops (not where a split continues it).
  /// Points are sorted, no two share a time, and none lie outside the clip.
  public static func gainCurve(
    clip: AudioClip, ducking: [TimeRange] = [], dips: [Double] = [], guardStart: Bool = false, guardEnd: Bool = false
  ) -> [GainPoint] {
    let a = clip.start, b = clip.end
    let len = b - a
    guard len > 0 else { return [] }
    var fadeIn = max(clip.fadeIn, guardStart ? clickGuard : 0)
    var fadeOut = max(clip.fadeOut, guardEnd ? clickGuard : 0)
    if fadeIn + fadeOut > len {
      let k = len / (fadeIn + fadeOut)
      fadeIn *= k
      fadeOut *= k
    }
    func fade(_ t: Double) -> Double {
      var g = 1.0
      if fadeIn > 0 && t < a + fadeIn { g = min(g, max(0, (t - a) / fadeIn)) }
      if fadeOut > 0 && t > b - fadeOut { g = min(g, max(0, (b - t) / fadeOut)) }
      return g
    }
    let ducks = ducking.filter { $0.end > a && $0.start < b }
    func duck(_ t: Double) -> Double {
      var g = 1.0
      for r in ducks {
        let down = min(duckRamp, r.duration)
        let v: Double
        if t < r.start || t > r.end + duckRamp {
          v = 1
        } else if t < r.start + down {
          v = 1 - (1 - duckGain) * (t - r.start) / down
        } else if t <= r.end {
          v = duckGain
        } else {
          v = duckGain + (1 - duckGain) * (t - r.end) / duckRamp
        }
        g = min(g, v)
      }
      return g
    }
    let inner = dips.filter { $0 > a + clickGuard && $0 < b - clickGuard }
    func dip(_ t: Double) -> Double {
      var g = 1.0
      for d in inner where abs(t - d) < clickGuard { g = min(g, abs(t - d) / clickGuard) }
      return g
    }

    var times: [Double] = [a, b, a + fadeIn, b - fadeOut]
    for r in ducks {
      times += [r.start, r.start + min(duckRamp, r.duration), r.end, r.end + duckRamp]
    }
    for d in inner { times += [d - clickGuard, d, d + clickGuard] }
    let sorted = times.filter { $0 >= a && $0 <= b }.sorted()
    var out: [GainPoint] = []
    for t in sorted {
      if let last = out.last, t - last.t < 1e-4 { continue }
      out.append(GainPoint(t, clip.volume * fade(t) * duck(t) * dip(t)))
    }
    return out
  }

  /// A curve as back-to-back mix instructions: a ramp from `t` to `until` (flat when from == to), and a final
  /// level from `t` on. Holds are flat ramps, not single volume points, because AVAudioMix interpolates
  /// between successive `setVolume` points (a hold before a drop would otherwise slope down all the way).
  public struct Ramp: Sendable, Equatable {
    public var t: Double
    public var until: Double?
    public var from: Double
    public var to: Double
  }

  /// Curves of clips that touch (a split) meet at one time with two levels: the later level starts
  /// `jumpSec` after, so no ramp has zero length.
  public static func ramps(_ raw: [GainPoint]) -> [Ramp] {
    var points: [GainPoint] = []
    // Time order; points at the same time keep their given order (the earlier clip's end first).
    let ordered = raw.enumerated().sorted { $0.element.t != $1.element.t ? $0.element.t < $1.element.t : $0.offset < $1.offset }
    for p in ordered.map(\.element) {
      guard let last = points.last, p.t - last.t < jumpSec else {
        points.append(p)
        continue
      }
      if abs(p.gain - last.gain) < 1e-6 { continue }
      points.append(GainPoint(last.t + jumpSec, p.gain))
    }
    var out: [Ramp] = []
    for (i, p) in points.enumerated() {
      guard i + 1 < points.count else {
        out.append(Ramp(t: p.t, until: nil, from: p.gain, to: p.gain))
        break
      }
      let q = points[i + 1]
      // Merge a hold into the previous hold at the same level.
      if abs(q.gain - p.gain) < 1e-6, let last = out.last, abs(last.from - last.to) < 1e-6, abs(last.to - p.gain) < 1e-6, last.until == p.t {
        out[out.count - 1].until = q.t
        continue
      }
      out.append(Ramp(t: p.t, until: q.t, from: p.gain, to: q.gain))
    }
    return out
  }

  /// A relative file path inside the project folder (no "..", not absolute).
  public static func isSafeFile(_ file: String) -> Bool {
    guard !file.isEmpty, !file.hasPrefix("/"), !file.hasPrefix("~") else { return false }
    return !file.split(separator: "/", omittingEmptySubsequences: false).contains { $0 == ".." || $0 == "." || $0.isEmpty }
  }
}
