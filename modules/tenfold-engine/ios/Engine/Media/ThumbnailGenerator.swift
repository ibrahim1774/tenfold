import AVFoundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

public struct Thumbnail: Codable, Sendable {
  public var time: Double
  public var uri: String
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

  /// Evenly spaced source-time frames for the timeline filmstrip.
  public static func strip(source: URL, duration: Double, count: Int, dir: URL) async throws -> [Thumbnail] {
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
      out.append(Thumbnail(time: t, uri: url.absoluteString))
    }
    return out
  }
}
