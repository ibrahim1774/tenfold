import Foundation

/// Where the video sits on the output canvas when the user places it by hand (CropSettings.scale set).
/// Pure math, mirrored in src/editor/frame.ts so the pinch preview and the render agree to the pixel.
public enum Framing {
  public static let minScale = 1.0
  public static let maxScale = 5.0

  public struct Placement: Equatable, Sendable {
    /// Display-space → canvas-space pixel scale.
    public var pixelScale: Double
    /// Canvas position of the video's top-left corner.
    public var originX: Double
    public var originY: Double
    /// Video size on the canvas.
    public var videoW: Double
    public var videoH: Double
  }

  /// Pixel scale that shows the whole video (Fit).
  public static func fitScale(canvasW: Double, canvasH: Double, videoW: Double, videoH: Double) -> Double {
    guard videoW > 0, videoH > 0 else { return 1 }
    return min(canvasW / videoW, canvasH / videoH)
  }

  /// User scale (1 = Fit) that covers the whole canvas (Fill).
  public static func fillUserScale(canvasW: Double, canvasH: Double, videoW: Double, videoH: Double) -> Double {
    guard videoW > 0, videoH > 0 else { return 1 }
    let fit = fitScale(canvasW: canvasW, canvasH: canvasH, videoW: videoW, videoH: videoH)
    return max(canvasW / videoW, canvasH / videoH) / fit
  }

  public static func clampScale(_ s: Double) -> Double { min(maxScale, max(minScale, s)) }

  /// Largest |offset| on one axis: the centre stays on the canvas, or, when the video is bigger than the
  /// canvas, it can pan until its edge reaches the canvas centre.
  public static func maxOffset(videoSize: Double, canvasSize: Double) -> Double {
    guard canvasSize > 0 else { return 0.5 }
    return max(0.5, videoSize / canvasSize / 2)
  }

  /// Clamped (scale, offsetX, offsetY) for a canvas and a video (display size).
  public static func clamp(scale: Double, offsetX: Double, offsetY: Double, canvasW: Double, canvasH: Double, videoW: Double, videoH: Double) -> (scale: Double, offsetX: Double, offsetY: Double) {
    let s = clampScale(scale)
    let px = fitScale(canvasW: canvasW, canvasH: canvasH, videoW: videoW, videoH: videoH) * s
    let mx = maxOffset(videoSize: videoW * px, canvasSize: canvasW)
    let my = maxOffset(videoSize: videoH * px, canvasSize: canvasH)
    return (s, min(mx, max(-mx, offsetX)), min(my, max(-my, offsetY)))
  }

  public static func place(crop: CropSettings, canvasW: Double, canvasH: Double, videoW: Double, videoH: Double) -> Placement {
    let c = clamp(scale: crop.scale ?? 1, offsetX: crop.offsetX ?? 0, offsetY: crop.offsetY ?? 0,
                  canvasW: canvasW, canvasH: canvasH, videoW: videoW, videoH: videoH)
    let px = fitScale(canvasW: canvasW, canvasH: canvasH, videoW: videoW, videoH: videoH) * c.scale
    let w = videoW * px, h = videoH * px
    let cx = canvasW / 2 + c.offsetX * canvasW
    let cy = canvasH / 2 + c.offsetY * canvasH
    return Placement(pixelScale: px, originX: cx - w / 2, originY: cy - h / 2, videoW: w, videoH: h)
  }
}
