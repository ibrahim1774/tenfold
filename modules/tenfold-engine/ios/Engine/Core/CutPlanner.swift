import Foundation

/// Merges accepted cuts into keep segments and maps time between source and composition (spec §4.7).
public enum CutPlanner {
  public static let minKeep = 0.18

  public static func keepSegments(cuts: [Cut], duration: Double) -> [TimeRange] {
    let accepted = cuts.filter { $0.accepted && $0.end > $0.start }.sorted { $0.start < $1.start }
    // Merge overlapping cuts.
    var merged: [TimeRange] = []
    for c in accepted {
      let r = TimeRange(start: max(0, c.start), end: min(duration, c.end))
      guard r.end > r.start else { continue }
      if var last = merged.last, r.start <= last.end {
        last.end = max(last.end, r.end)
        merged[merged.count - 1] = last
      } else {
        merged.append(r)
      }
    }
    // Invert.
    var keep: [TimeRange] = []
    var cursor = 0.0
    for m in merged {
      if m.start > cursor { keep.append(TimeRange(start: cursor, end: m.start)) }
      cursor = max(cursor, m.end)
    }
    if duration > cursor { keep.append(TimeRange(start: cursor, end: duration)) }
    // Drop slivers.
    let filtered = keep.filter { $0.duration >= minKeep }
    return filtered.isEmpty && duration > 0 ? [TimeRange(start: 0, end: duration)] : filtered
  }
}

public struct TimeMapper: Sendable {
  public let segments: [CompSegment]
  public var compDuration: Double { segments.last?.compEnd ?? 0 }

  public init(keep: [TimeRange]) {
    var t = 0.0
    segments = keep.map { r in
      defer { t += r.duration }
      return CompSegment(start: r.start, end: r.end, compStart: t, compEnd: t + r.duration)
    }
  }

  /// Source → composition. Times inside a cut snap to the next kept frame.
  public func toComp(_ source: Double) -> Double {
    for s in segments {
      if source < s.start { return s.compStart }
      if source <= s.end { return s.compStart + (source - s.start) }
    }
    return compDuration
  }

  public func toSource(_ comp: Double) -> Double {
    for s in segments where comp <= s.compEnd {
      return s.start + max(0, comp - s.compStart)
    }
    return segments.last?.end ?? 0
  }

  /// True when more than half of the range survives the cuts.
  public func isKept(_ start: Double, _ end: Double) -> Bool {
    let len = max(0.0001, end - start)
    var kept = 0.0
    for s in segments {
      let a = max(start, s.start), b = min(end, s.end)
      if b > a { kept += b - a }
    }
    return kept / len > 0.5
  }
}
