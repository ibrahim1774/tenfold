import AVFoundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

public struct Thumbnail: Codable, Sendable {
  /// Project source time with the clips in the order they were added.
  public var time: Double
  public var uri: String
  /// The clip the frame is from and its time in that clip, so the editor can place it after a reorder.
  public var clipId: String?
  public var clipTime: Double?

  public init(time: Double, uri: String, clipId: String? = nil, clipTime: Double? = nil) {
    self.time = time
    self.uri = uri
    self.clipId = clipId
    self.clipTime = clipTime
  }
}

public enum ThumbnailGenerator {
  public static func writeJPEG(_ image: CGImage, to url: URL, quality: Double = 0.8) throws {
    guard let dest = CGImageDestinationCreateWithURL(url as CFURL, UTType.jpeg.identifier as CFString, 1, nil) else {
      throw EngineError.message("Can't write thumbnail.")
    }
    CGImageDestinationAddImage(dest, image, [kCGImageDestinationLossyCompressionQuality: quality] as CFDictionary)
    guard CGImageDestinationFinalize(dest) else { throw EngineError.message("Can't write thumbnail.") }
  }

  static func generator(_ url: URL, maxSize: CGFloat) -> AVAssetImageGenerator {
    let g = AVAssetImageGenerator(asset: AVURLAsset(url: url))
    g.appliesPreferredTrackTransform = true
    g.maximumSize = CGSize(width: maxSize, height: maxSize)
    g.requestedTimeToleranceBefore = CMTime(seconds: 0.5, preferredTimescale: 600)
    g.requestedTimeToleranceAfter = CMTime(seconds: 0.5, preferredTimescale: 600)
    return g
  }

  public static func poster(source: URL, to url: URL, at seconds: Double) async throws {
    let g = generator(source, maxSize: 540)
    let (image, _) = try await g.image(at: CMTime(seconds: seconds, preferredTimescale: 600))
    try writeJPEG(image, to: url)
  }

  /// Evenly spaced source-time frames for the timeline filmstrip. `offset` places a clip's frames on the
  /// project timeline (clips in the order added).
  public static func strip(source: URL, duration: Double, count: Int, dir: URL, clipId: String? = nil, offset: Double = 0) async throws -> [Thumbnail] {
    let g = generator(source, maxSize: 200)
    var out: [Thumbnail] = []
    let n = max(1, count)
    for i in 0..<n {
      try Task.checkCancellation()
      let t = duration * (Double(i) + 0.5) / Double(n)
      let url = dir.appendingPathComponent("strip-\(n)-\(i).jpg")
      if !FileManager.default.fileExists(atPath: url.path) {
        guard let (image, _) = try? await g.image(at: CMTime(seconds: t, preferredTimescale: 600)) else { continue }
        try writeJPEG(image, to: url, quality: 0.7)
      }
      out.append(Thumbnail(time: offset + t, uri: url.absoluteString, clipId: clipId, clipTime: t))
    }
    return out
  }

  /// Filmstrip frames for every clip of a project, about `count` in all, spread by length.
  public static func projectStrip(projectId: String, meta: ProjectMeta, count: Int) async throws -> [Thumbnail] {
    let clips = meta.allClips
    var total = 0.0
    for c in clips { total += max(0, c.media.durationSec) }
    var out: [Thumbnail] = []
    var offset = 0.0
    for c in clips {
      let d = max(0, c.media.durationSec)
      let share = total > 0 ? Double(max(1, count)) * d / total : 1
      let n = max(1, Int(share.rounded()))
      // The first clip keeps the folder older builds wrote, so its frames stay cached.
      let dir = c.id == meta.primaryClip.id ? ProjectStore.subdir(projectId, "thumbs") : ProjectStore.subdir(projectId, "thumbs/\(c.id)")
      out += try await strip(source: ProjectStore.clipURL(projectId, c), duration: d, count: n, dir: dir, clipId: c.id, offset: offset)
      offset += d
    }
    return out
  }
}
