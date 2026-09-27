import Foundation

/// A title, hook or line of subtext placed on the finished video (mirrored in src/engine/types.ts).
/// Position and size are fractions of the output canvas; `start`/`end` are OUTPUT (composition) seconds,
/// because titles sit on the edited video, not on the source. Absent = the whole clip.
public struct TextOverlay: Codable, Sendable, Equatable {
  public var id: String
  public var text: String
  /// classic, elegance, neon, retro, comic, typewriter, handwriting, serif, bold
  public var style: String
  /// none, filled, translucent, outline
  public var box: String
  /// "#RRGGBB" text colour (the box colour for filled / translucent boxes).
  public var color: String
  /// left, center, right
  public var align: String
  /// Font size as a fraction of min(canvas width, height).
  public var size: Double
  /// Centre of the text box, fractions of the canvas (0..1).
  public var x: Double
  public var y: Double
  /// Degrees, clockwise on screen.
  public var rotation: Double
  public var start: Double?
  public var end: Double?

  public init(
    id: String = "t", text: String = "", style: String = "classic", box: String = "none", color: String = "#FFFFFF",
    align: String = "center", size: Double = TextOverlayMetrics.defaultSize, x: Double = 0.5, y: Double = 0.5,
    rotation: Double = 0, start: Double? = nil, end: Double? = nil
  ) {
    self.id = id
    self.text = text
    self.style = style
    self.box = box
    self.color = color
    self.align = align
    self.size = size
    self.x = x
    self.y = y
    self.rotation = rotation
    self.start = start
    self.end = end
  }

  enum CodingKeys: String, CodingKey { case id, text, style, box, color, align, size, x, y, rotation, start, end }

  /// Every field has a default, so partial or older records decode.
  public init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    id = try c.decodeIfPresent(String.self, forKey: .id) ?? "t"
    text = try c.decodeIfPresent(String.self, forKey: .text) ?? ""
    style = try c.decodeIfPresent(String.self, forKey: .style) ?? "classic"
    box = try c.decodeIfPresent(String.self, forKey: .box) ?? "none"
    color = try c.decodeIfPresent(String.self, forKey: .color) ?? TextOverlayMetrics.defaultColor(style)
    align = try c.decodeIfPresent(String.self, forKey: .align) ?? "center"
    size = try c.decodeIfPresent(Double.self, forKey: .size) ?? TextOverlayMetrics.defaultSize
    x = try c.decodeIfPresent(Double.self, forKey: .x) ?? 0.5
    y = try c.decodeIfPresent(Double.self, forKey: .y) ?? 0.5
    rotation = try c.decodeIfPresent(Double.self, forKey: .rotation) ?? 0
    start = try c.decodeIfPresent(Double.self, forKey: .start)
    end = try c.decodeIfPresent(Double.self, forKey: .end)
  }
}

/// Geometry and look constants shared with src/editor/textLayout.ts. Change both together.
public enum TextOverlayMetrics {
  public static let defaultSize = 0.07
  public static let minSize = 0.03
  public static let maxSize = 0.2
  /// Line height as a multiple of the font size (fixed, so JS can match it without font metrics).
  public static let lineHeight = 1.25
  /// Box padding in ems.
  public static let padX = 0.3
  public static let padY = 0.15
  /// Lines wrap at this fraction of the canvas width.
  public static let wrap = 0.84
  /// Outline width in pixels on a 1080-short-side frame.
  public static let strokePer1080 = 6.0
  /// Box corner radius as a fraction of the line height.
  public static let cornerRatio = 0.25
  /// Translucent box opacity.
  public static let translucentAlpha = 0.55
  /// Colours brighter than this get black text on their box (and a black outline).
  public static let lightThreshold = 0.6

  public static let styles = ["classic", "elegance", "neon", "retro", "comic", "typewriter", "handwriting", "serif", "bold"]

  /// PostScript names. Bundled faces are embedded by the expo-font config plugin; the rest ship with iOS.
  public static func fontName(_ style: String) -> String {
    switch style {
    case "elegance": return "Didot"
    case "neon": return "BebasNeue-Regular"
    case "retro": return "BodoniSvtyTwoITCTT-Bold"
    case "comic": return "ComicNeue-Bold"
    case "typewriter": return "AmericanTypewriter-Bold"
    case "handwriting": return "Noteworthy-Bold"
    case "serif": return "Georgia-Bold"
    case "bold": return "Inter-Black"
    default: return "TikTokSans-ExtraBold"
    }
  }

  public static func defaultColor(_ style: String) -> String {
    switch style {
    case "elegance": return "#E6E6E6"
    case "neon": return "#FF4FD8"
    case "retro": return "#FFF3D6"
    default: return "#FFFFFF"
    }
  }

  public static func clampSize(_ s: Double) -> Double {
    guard s.isFinite else { return defaultSize }
    return min(maxSize, max(minSize, s))
  }

  /// "#RGB" / "#RRGGBB" → 0..1 components; nil for anything else.
  public static func rgb(_ hex: String) -> (Double, Double, Double)? {
    var h = hex.trimmingCharacters(in: .whitespaces)
    guard h.hasPrefix("#") else { return nil }
    h.removeFirst()
    if h.count == 3 { h = h.map { "\($0)\($0)" }.joined() }
    if h.count == 8 { h = String(h.prefix(6)) }
    guard h.count == 6, let v = UInt64(h, radix: 16) else { return nil }
    let r: Double = Double((v >> 16) & 0xFF) / 255
    let g: Double = Double((v >> 8) & 0xFF) / 255
    let b: Double = Double(v & 0xFF) / 255
    return (r, g, b)
  }

  /// Rec. 709 luma of the gamma-encoded colour, 0..1 (white = 1). Unparseable colours count as white.
  public static func luminance(_ hex: String) -> Double {
    guard let (r, g, b) = rgb(hex) else { return 1 }
    let lr: Double = 0.2126 * r
    let lg: Double = 0.7152 * g
    let lb: Double = 0.0722 * b
    return lr + lg + lb
  }

  public static func isLight(_ hex: String) -> Bool { luminance(hex) > lightThreshold }

  /// Text colour on a filled or translucent box of `hex`: black on light boxes, white on dark ones.
  public static func contrastText(_ hex: String) -> String { isLight(hex) ? "#000000" : "#FFFFFF" }

  /// Keeps the rotated text box inside the canvas. `x`, `y` are the box centre as fractions; the box and
  /// canvas sizes are in the same units (pixels or points). A box larger than the canvas centres on it.
  /// The same formula is in src/editor/textLayout.ts (`clampCenter`).
  public static func clampCenter(x: Double, y: Double, boxW: Double, boxH: Double, rotation: Double, canvasW: Double, canvasH: Double) -> (x: Double, y: Double) {
    guard canvasW > 0, canvasH > 0 else { return (x, y) }
    let theta: Double = rotation * Double.pi / 180
    let c: Double = abs(cos(theta))
    let s: Double = abs(sin(theta))
    let halfW: Double = (boxW * c + boxH * s) / 2
    let halfH: Double = (boxW * s + boxH * c) / 2
    func clampAxis(_ f: Double, _ half: Double, _ size: Double) -> Double {
      let lo: Double = half
      let hi: Double = size - half
      if lo > hi { return 0.5 }
      let p: Double = (f.isFinite ? f : 0.5) * size
      return min(hi, max(lo, p)) / size
    }
    return (clampAxis(x, halfW, canvasW), clampAxis(y, halfH, canvasH))
  }

  /// When the overlay shows, in output seconds, clipped to the video.
  public static func window(_ o: TextOverlay, total: Double) -> (start: Double, end: Double) {
    let s: Double = max(0, min(total, o.start ?? 0))
    let e: Double = max(s, min(total, o.end ?? total))
    return (s, e)
  }
}
