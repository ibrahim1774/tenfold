import CoreGraphics
import CoreText
import Foundation

/// Draws caption text into bitmaps with CoreText. Image-backed layers render identically in the live
/// preview and in AVVideoCompositionCoreAnimationTool exports (CATextLayer does not render reliably offline).
public enum TextRasterizer {
  public struct Glyphs {
    public var image: CGImage
    /// Layer size in render points (image pixels / scale).
    public var size: CGSize
    /// Offset of the text origin inside the image (stroke/shadow padding), in points.
    public var inset: CGSize
  }

  public static func render(_ text: String, font: CTFont, fill: CGColor, stroke: CGColor?, strokeWidth: CGFloat, scale: CGFloat) -> Glyphs? {
    let attr = NSAttributedString(string: text, attributes: [
      NSAttributedString.Key(kCTFontAttributeName as String): font,
      NSAttributedString.Key(kCTForegroundColorAttributeName as String): fill,
    ])
    let line = CTLineCreateWithAttributedString(attr)
    var ascent: CGFloat = 0, descent: CGFloat = 0, leading: CGFloat = 0
    let width = CGFloat(CTLineGetTypographicBounds(line, &ascent, &descent, &leading))
    let pad = ceil(max(2, strokeWidth))
    let size = CGSize(width: ceil(width + pad * 2), height: ceil((ascent + descent) * 1.12 + pad * 2))
    let px = CGSize(width: max(1, size.width * scale), height: max(1, size.height * scale))
    guard let ctx = CGContext(
      data: nil, width: Int(px.width), height: Int(px.height), bitsPerComponent: 8, bytesPerRow: 0,
      space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    ) else { return nil }
    ctx.scaleBy(x: scale, y: scale)
    ctx.setShouldAntialias(true)
    ctx.setAllowsFontSmoothing(false)
    // CoreText draws y-up; baseline sits above the descent and the bottom padding.
    let lineH = (ascent + descent) * 1.12
    let baseline = pad + (lineH - (ascent + descent)) / 2 + descent
    if let stroke, strokeWidth > 0 {
      ctx.setLineJoin(.round)
      ctx.setLineWidth(strokeWidth * 2)  // half of it is covered by the fill pass
      ctx.setStrokeColor(stroke)
      ctx.setTextDrawingMode(.stroke)
      let strokeAttr = NSAttributedString(string: text, attributes: [
        NSAttributedString.Key(kCTFontAttributeName as String): font,
        NSAttributedString.Key(kCTForegroundColorFromContextAttributeName as String): true,
      ])
      ctx.textPosition = CGPoint(x: pad, y: baseline)
      CTLineDraw(CTLineCreateWithAttributedString(strokeAttr), ctx)
    }
    ctx.setTextDrawingMode(.fill)
    ctx.textPosition = CGPoint(x: pad, y: baseline)
    CTLineDraw(line, ctx)
    guard let image = ctx.makeImage() else { return nil }
    return Glyphs(image: image, size: size, inset: CGSize(width: pad, height: pad))
  }
}
