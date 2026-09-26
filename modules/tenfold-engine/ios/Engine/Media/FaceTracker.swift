import AVFoundation
import Vision

/// Samples one frame every 2 s and finds the largest face (spec §4.8). Output is display-oriented, y down.
public enum FaceTracker {
  public static func track(source: URL, duration: Double, every step: Double = 2, progress: (@Sendable (Double) -> Void)? = nil) async -> [FacePoint] {
    let g = ThumbnailGenerator.generator(source, maxSize: 360)
    var points: [FacePoint] = []
    var t = min(0.5, duration / 2)
    while t < duration {
      if Task.isCancelled { break }
      if let (image, _) = try? await g.image(at: CMTime(seconds: t, preferredTimescale: 600)) {
        let request = VNDetectFaceRectanglesRequest()
        let handler = VNImageRequestHandler(cgImage: image, options: [:])
        if (try? handler.perform([request])) != nil,
           let face = request.results?.max(by: { $0.boundingBox.width * $0.boundingBox.height < $1.boundingBox.width * $1.boundingBox.height }) {
          let b = face.boundingBox  // normalised, origin bottom-left
          points.append(FacePoint(time: t, x: Double(b.midX), y: Double(1 - b.midY)))
        }
      }
      progress?(min(1, t / max(duration, 0.001)))
      t += step
    }
    return FaceTrackSmoother.smooth(points)
  }
}
