import AVFoundation
import Foundation
import Speech

/// Apple's on-device SpeechAnalyzer + SpeechTranscriber (iOS 26). No download managed by us:
/// iOS installs and updates the language assets (spec §4.4).
@available(iOS 26.0, *)
public final class AppleTranscriber: Transcriber {
  public let name = "apple"

  public init() {}

  static func module(_ locale: Locale) -> SpeechTranscriber {
    SpeechTranscriber(locale: locale, transcriptionOptions: [], reportingOptions: [], attributeOptions: [.audioTimeRange, .transcriptionConfidence])
  }

  public static var isAvailable: Bool { SpeechTranscriber.isAvailable }

  public static func resolveLocale(_ language: String) async -> Locale? {
    let wanted = language == "auto" || language.isEmpty ? Locale.current : Locale(identifier: language)
    return await SpeechTranscriber.supportedLocale(equivalentTo: wanted)
  }

  public enum AssetState: String { case unsupported, supported, downloading, installed }

  public static func status(_ language: String) async -> (AssetState, Locale?) {
    guard isAvailable, let locale = await resolveLocale(language) else { return (.unsupported, nil) }
    switch await AssetInventory.status(forModules: [module(locale)]) {
    case .installed: return (.installed, locale)
    case .downloading: return (.downloading, locale)
    case .supported: return (.supported, locale)
    default: return (.unsupported, locale)
    }
  }

  /// Makes sure iOS has the speech assets for this language. Progress 0…1.
  public static func prepare(_ language: String, progress: @escaping @Sendable (Double) -> Void) async throws -> Locale {
    guard isAvailable else { throw EngineError.message("On-device speech isn't supported on this iPhone.") }
    guard let locale = await resolveLocale(language) else { throw EngineError.message("This language isn't supported for captions yet.") }
    if let request = try await AssetInventory.assetInstallationRequest(supporting: [module(locale)]) {
      let observation = request.progress.observe(\.fractionCompleted, options: [.initial, .new]) { p, _ in progress(p.fractionCompleted) }
      defer { observation.invalidate() }
      try await request.downloadAndInstall()
    }
    progress(1)
    return locale
  }

  public func transcribe(samples: [Float], sampleRate: Double, language: String, progress: @escaping @Sendable (Double) -> Void) async throws -> Transcript {
    let started = Date()
    let locale = try await Self.prepare(language) { _ in }
    do {
      return try await run(samples: samples, sampleRate: sampleRate, locale: locale, started: started, progress: progress)
    } catch let error as CancellationError {
      throw error
    } catch {
      // File transcription may need speech permission on some iOS versions: ask once, then retry.
      guard SFSpeechRecognizer.authorizationStatus() == .notDetermined else { throw error }
      let status = await withCheckedContinuation { c in SFSpeechRecognizer.requestAuthorization { c.resume(returning: $0) } }
      guard status == .authorized else { throw error }
      return try await run(samples: samples, sampleRate: sampleRate, locale: locale, started: started, progress: progress)
    }
  }

  private func run(samples: [Float], sampleRate: Double, locale: Locale, started: Date, progress: @escaping @Sendable (Double) -> Void) async throws -> Transcript {
    let transcriber = Self.module(locale)
    guard let format = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: [transcriber]) else {
      throw EngineError.message("Speech assets aren't installed yet.")
    }
    let buffer = try Self.convert(samples: samples, sampleRate: sampleRate, to: format)
    let totalFrames = AVAudioFramePosition(buffer.frameLength)
    let duration = Double(samples.count) / sampleRate

    let analyzer = SpeechAnalyzer(modules: [transcriber])
    let (stream, input) = AsyncStream.makeStream(of: AnalyzerInput.self)

    // Consume results before analysing (Apple's documented order).
    let collector = Task { () throws -> [SpeechTranscriber.Result] in
      var results: [SpeechTranscriber.Result] = []
      for try await r in transcriber.results {
        results.append(r)
        if duration > 0 { progress(min(0.99, r.range.end.seconds / duration)) }
      }
      return results
    }

    let chunk = AVAudioFrameCount(format.sampleRate * 2)
    var pos: AVAudioFramePosition = 0
    while pos < totalFrames {
      let n = AVAudioFrameCount(min(AVAudioFramePosition(chunk), totalFrames - pos))
      if let slice = Self.slice(buffer, from: pos, count: n) { input.yield(AnalyzerInput(buffer: slice)) }
      pos += AVAudioFramePosition(n)
    }
    input.finish()

    do {
      if let last = try await analyzer.analyzeSequence(stream) {
        try await analyzer.finalizeAndFinish(through: last)
      } else {
        await analyzer.cancelAndFinishNow()
      }
    } catch {
      collector.cancel()
      throw error
    }
    let results = try await collector.value
    return Self.parse(results, locale: locale, started: started)
  }

  // MARK: - Results → words

  static func parse(_ results: [SpeechTranscriber.Result], locale: Locale, started: Date) -> Transcript {
    var words: [Word] = []
    var runs = 0
    var singleWordRuns = 0
    for result in results {
      let text = result.text
      for run in text.runs {
        let s = String(text[run.range].characters)
        let trimmed = s.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { continue }
        let conf = run[AttributeScopes.SpeechAttributes.ConfidenceAttribute.self] ?? 1
        guard let range = run[AttributeScopes.SpeechAttributes.TimeRangeAttribute.self] else {
          // Untimed punctuation: attach to the previous word.
          if var last = words.popLast() {
            last.text += trimmed
            words.append(last)
          }
          continue
        }
        runs += 1
        let isPunct = trimmed.unicodeScalars.allSatisfy { CharacterSet.punctuationCharacters.contains($0) }
        if isPunct, var last = words.popLast() {
          last.text += trimmed
          words.append(last)
          continue
        }
        let parts = RunSplitter.words(text: trimmed, start: range.start.seconds, end: range.end.seconds, confidence: conf)
        if parts.count == 1 { singleWordRuns += 1 }
        words.append(contentsOf: parts)
      }
    }
    let ratio = runs > 0 ? Double(singleWordRuns) / Double(runs) : 0
    return Transcript(
      words: words, language: locale.identifier, engine: "apple",
      // Word-level runs mean the timings are real, not interpolated.
      wordTimingIsExact: ratio >= 0.9,
      stats: TranscriptStats(runCount: runs, singleWordRunRatio: ratio, lexicalFillerCount: 0, elapsedSec: Date().timeIntervalSince(started)))
  }

  // MARK: - Audio conversion

  static func convert(samples: [Float], sampleRate: Double, to format: AVAudioFormat) throws -> AVAudioPCMBuffer {
    guard let source = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: sampleRate, channels: 1, interleaved: false),
          let input = AVAudioPCMBuffer(pcmFormat: source, frameCapacity: AVAudioFrameCount(samples.count)) else {
      throw EngineError.message("Couldn't prepare audio for speech.")
    }
    input.frameLength = AVAudioFrameCount(samples.count)
    samples.withUnsafeBufferPointer { p in
      input.floatChannelData![0].update(from: p.baseAddress!, count: samples.count)
    }
    if source == format { return input }
    guard let converter = AVAudioConverter(from: source, to: format) else {
      throw EngineError.message("Couldn't convert audio for speech.")
    }
    let capacity = AVAudioFrameCount(Double(samples.count) * format.sampleRate / sampleRate) + 4096
    guard let output = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: capacity) else {
      throw EngineError.message("Couldn't convert audio for speech.")
    }
    var fed = false
    var error: NSError?
    let status = converter.convert(to: output, error: &error) { _, outStatus in
      if fed {
        outStatus.pointee = .endOfStream
        return nil
      }
      fed = true
      outStatus.pointee = .haveData
      return input
    }
    if status == .error { throw error ?? EngineError.message("Audio conversion failed.") }
    return output
  }

  static func slice(_ b: AVAudioPCMBuffer, from: AVAudioFramePosition, count: AVAudioFrameCount) -> AVAudioPCMBuffer? {
    guard let out = AVAudioPCMBuffer(pcmFormat: b.format, frameCapacity: count) else { return nil }
    out.frameLength = count
    let bytesPerFrame = Int(b.format.streamDescription.pointee.mBytesPerFrame)
    let src = UnsafeMutableAudioBufferListPointer(b.mutableAudioBufferList)
    let dst = UnsafeMutableAudioBufferListPointer(out.mutableAudioBufferList)
    for i in 0..<min(src.count, dst.count) {
      guard let s = src[i].mData, let d = dst[i].mData else { continue }
      memcpy(d, s.advanced(by: Int(from) * bytesPerFrame), Int(count) * bytesPerFrame)
    }
    return out
  }
}
