import CoreGraphics
import CoreText
import Foundation
import QuartzCore

/// Text overlays (titles, hooks) as CALayers, drawn on top of the captions by CaptionLayerBuilder.build,
/// so the preview's AVSynchronizedLayer and the export's animation tool render the same tree.
/// Geometry is top-left origin; rotation is clockwise on screen. Layout constants live in
/// TextOverlayMetrics and are mirrored in src/editor/textLayout.ts.
public enum TextOverlayLayerBuilder {
  public struct Line {
    public var text: String
    /// Text box of the line inside the overlay box (the box's top-left is 0,0).
    public var frame: CGRect
  }

  public struct Layout {
    public var font: CTFont
    public var fontSize: CGFloat
    public var lineHeight: CGFloat
    public var lines: [Line]
    /// Box size including padding (the area a filled box covers).
    public var boxSize: CGSize
    /// Box centre on the canvas after clamping, in render pixels.
    public var center: CGPoint
  }

  public static func font(_ style: String, size: CGFloat) -> CTFont {
    CTFontCreateWithName(TextOverlayMetrics.fontName(style) as CFString, size, nil)
  }

  /// Splits on newlines and wraps each paragraph at `maxWidth`. Returns the lines and whether any single
  /// word is wider than `maxWidth` (the caller then shrinks the font, as captions do).
  static func wrap(_ text: String, font: CTFont, maxWidth: CGFloat) -> (lines: [(String, CGFloat)], overflow: Bool) {
    let space = CaptionLayerBuilder.width(" ", font)
    var out: [(String, CGFloat)] = []
    var overflow = false
    let paragraphs = text.components(separatedBy: "\n")
    for paragraph in paragraphs {
      let words = paragraph.split(separator: " ", omittingEmptySubsequences: true).map(String.init)
      if words.isEmpty {
        out.append(("", 0))
        continue
      }
      var line = ""
      var lineW: CGFloat = 0
      for word in words {
        let ww = CaptionLayerBuilder.width(word, font)
        if ww > maxWidth { overflow = true }
        if line.isEmpty {
          line = word
          lineW = ww
        } else if lineW + space + ww > maxWidth {
          out.append((line, lineW))
          line = word
          lineW = ww
        } else {
          line += " " + word
          lineW += space + ww
        }
      }
      out.append((line, lineW))
    }
    return (out, overflow)
  }

  public static func layout(_ o: TextOverlay, render: CGSize) -> Layout {
    let unit = CaptionLayerBuilder.unit(render)
    let maxWidth = render.width * CGFloat(TextOverlayMetrics.wrap)
    var size = CGFloat(TextOverlayMetrics.clampSize(o.size)) * unit
    var f = font(o.style, size: size)
    var lines: [(String, CGFloat)] = []
    for attempt in 0..<8 {
      f = font(o.style, size: size)
      let wrapped = wrap(o.text, font: f, maxWidth: maxWidth)
      lines = wrapped.lines
      if !wrapped.overflow || attempt == 7 || size <= 12 { break }
      size *= 0.85
    }
    let lh = size * CGFloat(TextOverlayMetrics.lineHeight)
    let padX = size * CGFloat(TextOverlayMetrics.padX)
    let padY = size * CGFloat(TextOverlayMetrics.padY)
    var textW: CGFloat = 0
    for l in lines { textW = max(textW, l.1) }
    let boxW = textW + padX * 2
    let boxH = lh * CGFloat(lines.count) + padY * 2
    var out: [Line] = []
    for (i, l) in lines.enumerated() {
      var x = (boxW - l.1) / 2
      if o.align == "left" { x = padX } else if o.align == "right" { x = boxW - padX - l.1 }
      let y = padY + lh * CGFloat(i)
      out.append(Line(text: l.0, frame: CGRect(x: x, y: y, width: l.1, height: lh)))
    }
    let c = TextOverlayMetrics.clampCenter(
      x: o.x, y: o.y, boxW: Double(boxW), boxH: Double(boxH), rotation: o.rotation,
      canvasW: Double(render.width), canvasH: Double(render.height))
    let center = CGPoint(x: CGFloat(c.x) * render.width, y: CGFloat(c.y) * render.height)
    return Layout(font: f, fontSize: size, lineHeight: lh, lines: out, boxSize: CGSize(width: boxW, height: boxH), center: center)
  }

  /// Adds one layer group per overlay to `root`, each visible only during its output-time window.
  public static func add(to root: CALayer, overlays: [TextOverlay], render: CGSize, total: Double, contentsScale: CGFloat) {
    guard total > 0 else { return }
    for o in overlays {
      if o.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { continue }
      let w = TextOverlayMetrics.window(o, total: total)
      guard w.end - w.start > 0.01 else { continue }
      let group = makeGroup(o, render: render, contentsScale: contentsScale)
      group.opacity = 0
      group.add(CaptionLayerBuilder.visibility(w.start, w.end, total: total), forKey: "visible")
      root.addSublayer(group)
    }
  }

  static func makeGroup(_ o: TextOverlay, render: CGSize, contentsScale: CGFloat) -> CALayer {
    let lay = layout(o, render: render)
    let group = CALayer()
    group.bounds = CGRect(origin: .zero, size: lay.boxSize)
    group.position = lay.center
    let radians = CGFloat(o.rotation * Double.pi / 180)
    group.transform = CATransform3DMakeRotation(radians, 0, 0, 1)

    let color = ColorParser.cgColor(o.color) ?? ColorParser.white
    let boxed = o.box == "filled" || o.box == "translucent"
    if boxed {
      let shape = CAShapeLayer()
      let radius = min(lay.lineHeight * CGFloat(TextOverlayMetrics.cornerRatio), lay.boxSize.height / 2)
      shape.path = CGPath(roundedRect: group.bounds, cornerWidth: radius, cornerHeight: radius, transform: nil)
      let alpha = o.box == "translucent" ? CGFloat(TextOverlayMetrics.translucentAlpha) : 1
      shape.fillColor = color.copy(alpha: alpha) ?? color
      group.addSublayer(shape)
    }
    let fill = boxed ? (ColorParser.cgColor(TextOverlayMetrics.contrastText(o.color)) ?? ColorParser.white) : color
    var stroke: CGColor?
    var strokeW: Double = 0
    if o.box == "outline" {
      stroke = TextOverlayMetrics.isLight(o.color) ? ColorParser.black : ColorParser.white
      strokeW = TextOverlayMetrics.strokePer1080 * Double(CaptionLayerBuilder.unit(render)) / 1080
    }

    let ascDesc = CTFontGetAscent(lay.font) + CTFontGetDescent(lay.font)
    let glyphBox = ascDesc * 1.12  // TextRasterizer's line box
    func lines() -> CALayer {
      let holder = CALayer()
      holder.frame = group.bounds
      for line in lay.lines where !line.text.isEmpty {
        let origin = CGPoint(x: line.frame.minX, y: line.frame.minY + (lay.lineHeight - glyphBox) / 2)
        holder.addSublayer(CaptionLayerBuilder.text(line.text, font: lay.font, fill: fill, stroke: stroke, strokeWidth: strokeW, origin: origin, scale: contentsScale))
      }
      return holder
    }

    if o.style == "neon" {
      // Glow in the text colour, plus a second softer pass for intensity.
      for opacity in [Float(0.5), Float(1)] {
        let glow = lines()
        glow.shadowColor = color
        glow.shadowOpacity = 0.9
        glow.shadowRadius = lay.fontSize * 0.25
        glow.shadowOffset = .zero
        glow.opacity = opacity
        group.addSublayer(glow)
      }
    } else {
      group.addSublayer(lines())
    }
    return group
  }
}
