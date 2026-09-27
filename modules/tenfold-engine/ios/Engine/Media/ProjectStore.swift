import CoreGraphics
import Foundation

public enum EngineError: LocalizedError {
  case message(String)
  public var errorDescription: String? {
    switch self { case .message(let m): return m }
  }
}

/// On-disk layout: Application Support/Tenfold/projects/<id>/{source.*, meta.json, analysis.json, poster.jpg, thumbs/, exports/}
public enum ProjectStore {
  public static var root: URL {
    let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    var url = base.appendingPathComponent("Tenfold/projects", isDirectory: true)
    if !FileManager.default.fileExists(atPath: url.path) {
      try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
      var values = URLResourceValues()
      values.isExcludedFromBackup = true
      try? url.setResourceValues(values)
    }
    return url
  }

  public static func dir(_ id: String) -> URL {
    let url = root.appendingPathComponent(id, isDirectory: true)
    try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
    return url
  }

  public static func subdir(_ id: String, _ name: String) -> URL {
    let url = dir(id).appendingPathComponent(name, isDirectory: true)
    try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
    return url
  }

  public static func write<T: Encodable>(_ value: T, _ id: String, _ file: String) throws {
    try JSONEncoder.tenfold.encode(value).write(to: dir(id).appendingPathComponent(file), options: .atomic)
  }

  public static func read<T: Decodable>(_ type: T.Type, _ id: String, _ file: String) throws -> T {
    let url = dir(id).appendingPathComponent(file)
    guard FileManager.default.fileExists(atPath: url.path) else { throw EngineError.message("Missing \(file) for project \(id)") }
    return try JSONDecoder.tenfold.decode(type, from: Data(contentsOf: url))
  }

  public static func meta(_ id: String) throws -> ProjectMeta { try read(ProjectMeta.self, id, "meta.json") }
  public static func analysis(_ id: String) throws -> Analysis { try read(Analysis.self, id, "analysis.json") }
  public static func sourceURL(_ id: String) throws -> URL { dir(id).appendingPathComponent(try meta(id).sourceFile) }

  // MARK: Clips (multi-clip projects; see ClipTimeline)

  /// Serialises read-modify-write of meta.json when clips are added or removed.
  static let metaLock = NSLock()

  /// The first clip's analysis stays in analysis.json (older builds read it); every other clip has its own file.
  public static func analysisFile(_ clipId: String, meta: ProjectMeta) -> String {
    clipId == meta.primaryClip.id ? "analysis.json" : "analysis-\(clipId).json"
  }

  public static func clipURL(_ id: String, _ clip: ClipMeta) -> URL { dir(id).appendingPathComponent(clip.sourceFile) }

  /// A clip's own analysis from disk, or nil when it hasn't been analysed.
  public static func readClipAnalysis(_ id: String, _ clip: ClipMeta, meta: ProjectMeta) -> Analysis? {
    try? read(Analysis.self, id, analysisFile(clip.id, meta: meta))
  }

  /// How a clip that hasn't been analysed yet reads: its length, no words, no cuts.
  public static func unanalysed(_ clip: ClipMeta) -> Analysis {
    Analysis(media: clip.media, transcript: nil, envelopeDb: [], noiseFloorDb: -60, speechThresholdDb: -38, speechCoverage: 0,
             noSpeech: true, cuts: [], faces: [], warnings: [])
  }

  /// The project analysis for a play order: each clip's analysis concatenated (ClipTimeline.concatenate).
  /// `load` returns a clip's analysis (cached or from disk). Throws when the first clip was never analysed.
  public static func combinedAnalysis(_ id: String, meta: ProjectMeta, order: [String]?, load: (ClipMeta) -> Analysis?) throws -> Analysis {
    let primary = meta.primaryClip
    guard load(primary) != nil else { throw EngineError.message("Missing analysis.json for project \(id)") }
    let clips = ClipTimeline.ordered(meta.allClips, order: order)
    let parts = clips.map { ClipTimeline.Part(clip: $0, analysis: load($0) ?? unanalysed($0)) }
    return ClipTimeline.concatenate(parts, primaryId: primary.id, canvas: primary.media)
  }

  /// Each clip's file and where it sits on the analysis's timeline, for the composition builder.
  public static func clipSources(_ id: String, meta: ProjectMeta, analysis: Analysis) -> [CompositionBuilder.ClipSource] {
    let byId = Dictionary(meta.allClips.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
    guard let spans = analysis.clips, !spans.isEmpty else {
      let c = meta.primaryClip
      return [CompositionBuilder.ClipSource(id: c.id, url: clipURL(id, c), start: 0, duration: analysis.media.durationSec)]
    }
    var out: [CompositionBuilder.ClipSource] = []
    for s in spans {
      guard let c = byId[s.id] else { continue }
      out.append(CompositionBuilder.ClipSource(id: c.id, url: clipURL(id, c), start: s.start, duration: s.end - s.start))
    }
    return out
  }

  /// The project's frame shape ("original" aspect): its first clip, whatever the play order.
  public static func canvasSize(_ meta: ProjectMeta) -> CGSize {
    let m = meta.primaryClip.media
    return CGSize(width: m.width, height: m.height)
  }

  /// Adds a clip to meta.json (a legacy project first becomes clip "c0") and updates the project media.
  public static func appendClip(_ id: String, _ clip: ClipMeta) throws -> ProjectMeta {
    metaLock.lock()
    defer { metaLock.unlock() }
    var m = try meta(id)
    var clips = m.allClips
    clips.append(clip)
    m.clips = clips
    if let media = ProjectMeta.derivedMedia(clips) { m.media = media }
    try write(m, id, "meta.json")
    return m
  }

  /// Deletes a clip's files and drops it from meta.json. The first clip is never removed. False if nothing was removed.
  public static func removeClip(_ id: String, _ clipId: String) -> Bool {
    metaLock.lock()
    defer { metaLock.unlock() }
    guard var m = try? meta(id), clipId != m.primaryClip.id, let clip = m.allClips.first(where: { $0.id == clipId }) else { return false }
    let folder = dir(id)
    try? FileManager.default.removeItem(at: folder.appendingPathComponent(clip.sourceFile))
    if let poster = clip.posterFile { try? FileManager.default.removeItem(at: folder.appendingPathComponent(poster)) }
    try? FileManager.default.removeItem(at: folder.appendingPathComponent(analysisFile(clipId, meta: m)))
    try? FileManager.default.removeItem(at: folder.appendingPathComponent("thumbs/\(clipId)"))
    let clips = m.allClips.filter { $0.id != clipId }
    m.clips = clips
    if let media = ProjectMeta.derivedMedia(clips) { m.media = media }
    return (try? write(m, id, "meta.json")) != nil
  }

  public static func delete(_ id: String) {
    try? FileManager.default.removeItem(at: root.appendingPathComponent(id, isDirectory: true))
  }

  /// Bytes in a file, or in everything under a folder.
  public static func size(of url: URL) -> Int64 {
    var isDir: ObjCBool = false
    guard FileManager.default.fileExists(atPath: url.path, isDirectory: &isDir) else { return 0 }
    if !isDir.boolValue {
      return (try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? NSNumber)?.int64Value ?? 0
    }
    guard let e = FileManager.default.enumerator(at: url, includingPropertiesForKeys: [.fileSizeKey]) else { return 0 }
    var total: Int64 = 0
    for case let f as URL in e {
      total += Int64((try? f.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0)
    }
    return total
  }

  public static func clearExports() {
    guard let ids = try? FileManager.default.contentsOfDirectory(atPath: root.path) else { return }
    for id in ids { try? FileManager.default.removeItem(at: root.appendingPathComponent(id).appendingPathComponent("exports")) }
  }

  public static func freeDiskBytes() -> Int64 {
    let values = try? root.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey])
    return values?.volumeAvailableCapacityForImportantUsage ?? 0
  }
}
