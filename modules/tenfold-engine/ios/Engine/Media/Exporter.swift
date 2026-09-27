import AVFoundation
import QuartzCore

public struct ExportOptions: Codable, Sendable {
  public var quality: RenderQuality
  public var watermark: Bool
  public var saveToPhotos: Bool
  public var keepHDR: Bool

  public init(quality: RenderQuality = .hd, watermark: Bool = true, saveToPhotos: Bool = true, keepHDR: Bool = false) {
    self.quality = quality
    self.watermark = watermark
    self.saveToPhotos = saveToPhotos
    self.keepHDR = keepHDR
  }
}

public struct ExportResult: Codable, Sendable {
  public var uri: String
  public var savedToPhotos: Bool
  public var photosDenied: Bool
  /// Set when saving to Photos failed for another reason (e.g. storage full).
  public var saveError: String?
  public var durationSec: Double
  public var elapsedSec: Double
}

/// Single-pass HEVC export with the caption layer tree burned in (spec §4.12).
public enum Exporter {
  public static func export(
    built: BuiltComposition, plan: EditPlan, captions: CaptionSettings, overlays: [TextOverlay] = [], options: ExportOptions, to url: URL,
    progress: @escaping @Sendable (Double) -> Void
  ) async throws {
    guard let vc = built.videoComposition.mutableCopy() as? AVMutableVideoComposition else {
      throw EngineError.message("Couldn't prepare the export.")
    }
    let parent = CALayer()
    parent.frame = CGRect(origin: .zero, size: built.renderSize)
    parent.isGeometryFlipped = true
    let videoLayer = CALayer()
    videoLayer.frame = parent.bounds
    parent.addSublayer(videoLayer)
    var caps = captions
    // Core Animation isn't colour managed over HDR: Keep HDR drops everything drawn on top (captions and text).
    if options.keepHDR { caps.enabled = false }
    let texts = options.keepHDR ? [] : overlays
    parent.addSublayer(CaptionLayerBuilder.build(plan: plan, captions: caps, render: built.renderSize, contentsScale: 1, watermark: options.watermark, overlays: texts))
    vc.animationTool = AVVideoCompositionCoreAnimationTool(postProcessingAsVideoLayer: videoLayer, in: parent)

    let preset = options.quality == .uhd ? AVAssetExportPresetHEVC3840x2160 : AVAssetExportPresetHEVCHighestQuality
    guard let session = AVAssetExportSession(asset: built.composition, presetName: preset) else {
      throw EngineError.message("HEVC export isn't available on this device.")
    }
    session.videoComposition = vc
    session.audioMix = built.audioMix
    session.shouldOptimizeForNetworkUse = true
    try? FileManager.default.removeItem(at: url)

    let watcher = Task {
      for await state in session.states(updateInterval: 0.2) {
        if case .exporting(let p) = state { progress(p.fractionCompleted) }
      }
    }
    defer { watcher.cancel() }
    try await session.export(to: url, as: .mp4)
    progress(1)
  }
}
