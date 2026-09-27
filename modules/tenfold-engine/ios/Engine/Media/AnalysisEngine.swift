import AVFoundation
import Foundation

public typealias StageProgress = @Sendable (_ stage: String, _ fraction: Double) -> Void

/// Import probe + the analysis pipeline: audio → transcript → faces → cuts (spec §4.2–4.6).
public enum AnalysisEngine {
  public static let maxDuration = 600.0

  public static func probe(_ url: URL) async throws -> MediaInfo {
    let asset = AVURLAsset(url: url)
    let duration = try await asset.load(.duration).seconds
    guard let v = try await asset.loadTracks(withMediaType: .video).first else {
      throw EngineError.message("This file has no video.")
    }
    let (natural, transform, fps, traits) = try await v.load(.naturalSize, .preferredTransform, .nominalFrameRate, .mediaCharacteristics)
    let rect = CGRect(origin: .zero, size: natural).applying(transform)
    let hasAudio = !(try await asset.loadTracks(withMediaType: .audio)).isEmpty
    return MediaInfo(
      durationSec: duration, width: abs(rect.width), height: abs(rect.height), fps: Double(fps),
      isHDR: traits.contains(.containsHDRVideo), hasAudio: hasAudio)
  }

  /// Analyses the project's clips (all of them, or only `clipIds`), writing each clip's analysis to its own
  /// file, and returns the project analysis in the order the clips were added. `onClip(index, count)` is
  /// called as each clip starts, so progress can say which clip it is on.
  public static func analyze(
    projectId: String, clipIds: [String]? = nil, options: AnalysisOptions, transcriber: Transcriber?,
    onClip: @escaping @Sendable (Int, Int) -> Void = { _, _ in }, progress: @escaping StageProgress
  ) async throws -> Analysis {
    let meta = try ProjectStore.meta(projectId)
    let all = meta.allClips
    let targets = clipIds.map { ids in all.filter { ids.contains($0.id) } } ?? all
    var fresh: [String: Analysis] = [:]
    for (i, clip) in targets.enumerated() {
      onClip(i, targets.count)
      let source = ProjectStore.clipURL(projectId, clip)
      let a = try await analyzeClip(source: source, media: clip.media, options: options, transcriber: transcriber, progress: progress)
      try ProjectStore.write(a, projectId, ProjectStore.analysisFile(clip.id, meta: meta))
      fresh[clip.id] = a
    }
    return try ProjectStore.combinedAnalysis(projectId, meta: meta, order: nil) { clip in
      fresh[clip.id] ?? ProjectStore.readClipAnalysis(projectId, clip, meta: meta)
    }
  }

  /// The pipeline for one video file; times from the file's start.
  public static func analyzeClip(source: URL, media: MediaInfo, options: AnalysisOptions, transcriber: Transcriber?, progress: @escaping StageProgress) async throws -> Analysis {
    var warnings: [String] = []

    progress("extractingAudio", 0)
    let samples = media.hasAudio ? try await AudioExtractor.extract(url: source) { progress("extractingAudio", $0) } : []
    let envelope = Envelope.compute(samples: samples, sampleRate: AudioExtractor.sampleRate)
    try Task.checkCancellation()

    var transcript: Transcript?
    if !samples.isEmpty {
      if let transcriber {
        progress("transcribing", 0)
        do {
          transcript = try await transcriber.transcribe(samples: samples, sampleRate: AudioExtractor.sampleRate, language: options.language) {
            progress("transcribing", $0)
          }
        } catch is CancellationError {
          throw CancellationError()
        } catch {
          warnings.append("Transcription failed: \(error.localizedDescription)")
        }
      } else {
        warnings.append("On-device speech isn't available on this iPhone or language, so captions are off.")
      }
    } else {
      warnings.append("This clip has no audio.")
    }
    try Task.checkCancellation()

    progress("detecting", 0)
    let faces = await FaceTracker.track(source: source, duration: media.durationSec) { progress("detecting", $0) }
    try Task.checkCancellation()

    progress("planning", 0)
    let words = transcript?.words ?? []
    let language = transcript?.language ?? options.language
    let detected = AnalysisPlanner.detect(
      envelope: envelope, words: words, wordTimingIsExact: transcript?.wordTimingIsExact ?? true, language: language, options: options)
    if var t = transcript {
      t.words = detected.words
      t.stats.lexicalFillerCount = detected.lexicalFillers
      transcript = t
    }
    if detected.noSpeech { warnings.append("No speech detected, so nothing was cut.") }

    let analysis = Analysis(
      media: media, transcript: transcript, envelopeDb: envelope, noiseFloorDb: detected.levels.noiseFloorDb,
      speechThresholdDb: detected.levels.thresholdDb, speechCoverage: detected.levels.coverage, noSpeech: detected.noSpeech,
      cuts: detected.cuts, faces: faces, warnings: warnings)
    progress("planning", 1)
    return analysis
  }
}
