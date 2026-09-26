import Foundation

/// Speech engine seam (spec §4.4). Apple's SpeechAnalyzer is the only implementation for now;
/// Parakeet can be added behind the same protocol if the measurements call for it.
public protocol Transcriber: Sendable {
  var name: String { get }
  func transcribe(samples: [Float], sampleRate: Double, language: String, progress: @escaping @Sendable (Double) -> Void) async throws -> Transcript
}

/// Splits a timed text run into words, spreading its time range by character count.
public enum RunSplitter {
  public static func words(text: String, start: Double, end: Double, confidence: Double) -> [Word] {
    let tokens = text.split(whereSeparator: { $0.isWhitespace }).map(String.init)
    guard !tokens.isEmpty else { return [] }
    if tokens.count == 1 { return [Word(text: tokens[0], start: start, end: end, confidence: confidence)] }
    let total = Double(tokens.map(\.count).reduce(0, +))
    var t = start
    return tokens.map { tok in
      let d = (end - start) * Double(tok.count) / max(1, total)
      defer { t += d }
      return Word(text: tok, start: t, end: t + d, confidence: confidence)
    }
  }
}
