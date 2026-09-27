import AVFoundation

/// Result of adding a sound to a project (crosses the bridge as JSON).
public struct AddedAudio: Codable, Sendable {
  /// Relative to the project folder, e.g. "audio/<id>.m4a".
  public var file: String?
  public var title: String?
  public var durationSec: Double?
  /// "cancelled", "microphone", "noAudio" or a message.
  public var error: String?

  public init(file: String? = nil, title: String? = nil, durationSec: Double? = nil, error: String? = nil) {
    self.file = file
    self.title = title
    self.durationSec = durationSec
    self.error = error
  }
}

/// Sounds the user adds live in `<project>/audio/`. They stay until the project is deleted (the whole
/// folder goes), except a recording the user discards and files removed with `remove`.
public enum AudioFiles {
  public static let folderName = "audio"

  /// `audio/<uuid>.<ext>` and its URL. Creates the folder.
  public static func newFile(_ projectId: String, ext: String) -> (file: String, url: URL) {
    let clean = ext.lowercased().filter { $0.isLetter || $0.isNumber }
    let name = "\(UUID().uuidString.lowercased()).\(clean.isEmpty ? "m4a" : clean)"
    let url = ProjectStore.subdir(projectId, folderName).appendingPathComponent(name)
    return ("\(folderName)/\(name)", url)
  }

  /// A file inside the project's audio folder, or nil for anything else (absolute paths, "..").
  public static func url(_ projectId: String, _ file: String) -> URL? {
    guard AudioPlanner.isSafeFile(file), file.hasPrefix("\(folderName)/") else { return nil }
    return ProjectStore.root.appendingPathComponent(projectId, isDirectory: true).appendingPathComponent(file)
  }

  /// Length in seconds, or 0 when the file has no readable audio.
  public static func duration(_ url: URL) async -> Double {
    let asset = AVURLAsset(url: url, options: [AVURLAssetPreferPreciseDurationAndTimingKey: true])
    guard let tracks = try? await asset.loadTracks(withMediaType: .audio), !tracks.isEmpty else { return 0 }
    let d = (try? await asset.load(.duration).seconds) ?? 0
    return d.isFinite ? max(0, d) : 0
  }

  /// The sound of a video as an .m4a (AAC), without re-encoding the picture.
  public static func extractTrack(from video: URL, to out: URL) async throws {
    let asset = AVURLAsset(url: video)
    guard let tracks = try? await asset.loadTracks(withMediaType: .audio), !tracks.isEmpty else {
      throw EngineError.message("noAudio")
    }
    guard let session = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetAppleM4A) else {
      throw EngineError.message("Couldn't read the sound from this video.")
    }
    try? FileManager.default.removeItem(at: out)
    try await session.export(to: out, as: .m4a)
  }

  /// Waveform bars (0...1, the timeline's scale) for a sound file.
  public static func waveform(_ url: URL, buckets: Int) async throws -> [Double] {
    let samples = try await AudioExtractor.extract(url: url)
    return Envelope.levels(samples: samples, buckets: min(8000, max(1, buckets)))
  }

  /// Deletes one added sound. False when the path isn't an audio file of this project.
  @discardableResult
  public static func remove(_ projectId: String, _ file: String) -> Bool {
    guard let url = url(projectId, file) else { return false }
    try? FileManager.default.removeItem(at: url)
    return true
  }
}
