import Foundation

/// 20 ms RMS envelope of 16 kHz mono PCM, in dBFS. Computed once and reused by silence
/// detection, filler detection, emphasis and the timeline waveform.
public enum Envelope {
  public static let frameSec = 0.02
  public static let floorDb: Float = -100

  public static func compute(samples: [Float], sampleRate: Double) -> [Float] {
    let frame = max(1, Int(sampleRate * frameSec))
    guard !samples.isEmpty else { return [] }
    var out: [Float] = []
    out.reserveCapacity(samples.count / frame + 1)
    var i = 0
    while i < samples.count {
      let end = min(samples.count, i + frame)
      var sum: Float = 0
      for j in i..<end { sum += samples[j] * samples[j] }
      let rms = (sum / Float(end - i)).squareRoot()
      out.append(rms > 0 ? max(floorDb, 20 * log10(rms)) : floorDb)
      i = end
    }
    return out
  }

  /// Waveform bars for a whole file: `buckets` levels 0...1 on the timeline's scale (−60 dBFS → 0,
  /// −10 dBFS → 1; src/editor/Timeline.tsx draws the original sound from `envelopeDb` the same way).
  public static func levels(samples: [Float], buckets: Int) -> [Double] {
    let n = max(1, buckets)
    guard !samples.isEmpty else { return [Double](repeating: 0, count: n) }
    var out: [Double] = []
    out.reserveCapacity(n)
    for k in 0..<n {
      let a = samples.count * k / n
      let b = max(a + 1, min(samples.count, samples.count * (k + 1) / n))
      var sum: Float = 0
      for j in a..<b { sum += samples[j] * samples[j] }
      let rms = Double((sum / Float(b - a)).squareRoot())
      out.append(level(db: rms > 0 ? 20 * log10(rms) : Double(floorDb)))
    }
    return out
  }

  /// dBFS → 0...1 bar height (the timeline's scale).
  public static func level(db: Double) -> Double { max(0, min(1, (db + 60) / 50)) }

  public static func frameIndex(_ t: Double) -> Int { Int((t / frameSec).rounded(.down)) }

  /// Percentile (0...1) of the envelope values.
  public static func percentile(_ values: [Float], _ p: Double) -> Float {
    guard !values.isEmpty else { return floorDb }
    let sorted = values.sorted()
    let idx = min(sorted.count - 1, max(0, Int((Double(sorted.count - 1) * p).rounded())))
    return sorted[idx]
  }

  /// Mean dB over a time range (for emphasis), or floor if empty.
  public static func mean(_ env: [Float], from: Double, to: Double) -> Float {
    let a = max(0, frameIndex(from)), b = min(env.count, frameIndex(to) + 1)
    guard b > a else { return floorDb }
    var s: Float = 0
    for i in a..<b { s += env[i] }
    return s / Float(b - a)
  }
}

public struct SpeechLevels: Sendable, Equatable {
  public var noiseFloorDb: Double
  public var thresholdDb: Double
  public var coverage: Double

  /// Noise floor = 10th percentile; speech threshold = max(floor + 12 dB, −38 dBFS) (spec §4.5).
  public static func measure(_ env: [Float]) -> SpeechLevels {
    let floor = Double(Envelope.percentile(env, 0.10))
    let threshold = max(floor + 12, -38)
    let loud = env.filter { Double($0) >= threshold }.count
    return SpeechLevels(noiseFloorDb: floor, thresholdDb: threshold, coverage: env.isEmpty ? 0 : Double(loud) / Double(env.count))
  }
}
