import Foundation

/// Plans punch-in zooms in composition time (spec §4.8).
public enum ZoomPlanner {
  public static let defaultAnchor = (x: 0.5, y: 0.42)

  public static func punchScale(intensity: Int) -> Double {
    switch intensity {
    case ...1: return 1.08
    case 2: return 1.12
    default: return 1.18
    }
  }

  public static func plan(
    mapper: TimeMapper, words: [Word], faces: [FacePoint], settings: ZoomSettings
  ) -> [ZoomEvent] {
    let anchor: (Double) -> (Double, Double) = { compT in
      guard settings.faceFollow, let f = FaceTrackSmoother.face(at: mapper.toSource(compT), in: faces) else {
        return (defaultAnchor.x, defaultAnchor.y)
      }
      return (f.x, f.y)
    }
    let a0 = anchor(0)
    var events = [ZoomEvent(at: 0, scale: 1, anchorX: a0.0, anchorY: a0.1, ramp: 0)]
    guard settings.mode != .off else { return events }
    let punch = punchScale(intensity: settings.intensity)

    // Candidate moments: every cut boundary (instant) and, for dynamic, sentence starts (eased).
    var moments: [(t: Double, ramp: Double)] = mapper.segments.dropFirst().map { ($0.compStart, 0) }
    if settings.mode == .dynamic {
      for (i, w) in words.enumerated() where i > 0 {
        let prev = words[i - 1]
        let sentenceStart = prev.text.hasSuffix(".") || prev.text.hasSuffix("!") || prev.text.hasSuffix("?") || w.start - prev.end >= 0.7
        guard sentenceStart, mapper.isKept(w.start, w.end) else { continue }
        moments.append((mapper.toComp(w.start), 0.14))
      }
    }
    moments.sort { $0.t < $1.t }

    var current = 1.0
    var lastAt = 0.0
    for m in moments {
      let isCut = m.ramp == 0
      // Cuts always toggle (that is what hides the jump); sentence punch-ins need 1.4 s of rest.
      guard isCut || m.t - lastAt >= 1.4 else { continue }
      guard m.t - lastAt >= 0.05 || events.count == 1 else { continue }
      current = current == 1 ? punch : 1
      let a = anchor(m.t)
      events.append(ZoomEvent(at: m.t, scale: current, anchorX: a.0, anchorY: a.1, ramp: m.ramp))
      lastAt = m.t
    }
    return events
  }
}

/// Exponentially smoothed face track lookups.
public enum FaceTrackSmoother {
  public static func smooth(_ faces: [FacePoint], alpha: Double = 0.5) -> [FacePoint] {
    var out: [FacePoint] = []
    for f in faces.sorted(by: { $0.time < $1.time }) {
      if let p = out.last {
        out.append(FacePoint(time: f.time, x: p.x + alpha * (f.x - p.x), y: p.y + alpha * (f.y - p.y)))
      } else {
        out.append(f)
      }
    }
    return out
  }

  /// Linear interpolation between samples; nil when there is no face data.
  public static func face(at t: Double, in faces: [FacePoint]) -> FacePoint? {
    guard let first = faces.first else { return nil }
    if t <= first.time { return first }
    for i in 1..<faces.count where faces[i].time >= t {
      let a = faces[i - 1], b = faces[i]
      let k = (t - a.time) / max(0.0001, b.time - a.time)
      return FacePoint(time: t, x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k)
    }
    return faces.last
  }
}
