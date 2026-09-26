import AVFoundation
import CoreGraphics
import CoreText
import Foundation
import QuartzCore
#if canImport(UIKit)
import UIKit
#endif

/// Builds the caption CALayer tree (spec §4.10). Pure function of the plan + caption settings, so the
/// preview (inside an AVSynchronizedLayer) and the export (AVVideoCompositionCoreAnimationTool) match.
/// Geometry is top-left origin; the export parent layer sets `isGeometryFlipped`.
public enum CaptionLayerBuilder {
  public struct LaidOutWord {
    public var word: CardWord
    public var frame: CGRect
    public var font: CTFont
  }

  public static func makeFont(_ id: String, size: CGFloat) -> CTFont {
    #if canImport(UIKit)
    if id == "sfRounded" {
      let base = UIFont.systemFont(ofSize: size, weight: .heavy)
      if let d = base.fontDescriptor.withDesign(.rounded) { return UIFont(descriptor: d, size: size) as CTFont }
      return base as CTFont
    }
    #endif
    return CTFontCreateWithName(CaptionStyle.fontName(id) as CFString, size, nil)
  }

  static func width(_ text: String, _ font: CTFont) -> CGFloat {
    let attr = NSAttributedString(string: text, attributes: [NSAttributedString.Key(kCTFontAttributeName as String): font])
    let line = CTLineCreateWithAttributedString(attr)
    return CGFloat(CTLineGetTypographicBounds(line, nil, nil, nil))
  }

  static func lineHeight(_ font: CTFont) -> CGFloat {
    (CTFontGetAscent(font) + CTFontGetDescent(font)) * 1.12
  }

  /// Word frames for one card, wrapped to at most two lines and centred on the caption position.
  public static func layout(card: CaptionCard, captions: CaptionSettings, style: CaptionStyle, render: CGSize) -> [LaidOutWord] {
    var size = CGFloat(style.sizeRatio * Double(render.width) * max(0.5, captions.sizeScale))
    let maxWidth = render.width * 0.84
    for _ in 0..<5 {
      let base = makeFont(captions.font, size: size)
      let emph = makeFont(captions.font, size: size * 1.1)
      let space = width(" ", base)
      var lines: [[(CardWord, CGFloat, CTFont)]] = [[]]
      var lineW: CGFloat = 0
      for w in card.words {
        let f = w.emphasis ? emph : base
        let ww = width(w.text, f)
        let add = lines[lines.count - 1].isEmpty ? ww : ww + space
        if lineW + add > maxWidth, !lines[lines.count - 1].isEmpty {
          lines.append([(w, ww, f)])
          lineW = ww
        } else {
          lines[lines.count - 1].append((w, ww, f))
          lineW += add
        }
      }
      if lines.count > CaptionGrouper.maxLines && size > 12 {
        size *= 0.85
        continue
      }
      let lh = lineHeight(emph)
      let totalH = lh * CGFloat(lines.count)
      var centerY = CGFloat(captions.position.y) * render.height
      centerY = min(max(centerY, render.height * 0.08 + totalH / 2), render.height * 0.94 - totalH / 2)
      var y = centerY - totalH / 2
      var out: [LaidOutWord] = []
      for line in lines {
        let lw = line.map(\.1).reduce(0, +) + space * CGFloat(max(0, line.count - 1))
        var x = (render.width - lw) / 2
        for (w, ww, f) in line {
          out.append(LaidOutWord(word: w, frame: CGRect(x: x, y: y, width: ww, height: lh), font: f))
          x += ww + space
        }
        y += lh
      }
      return out
    }
    return []
  }

  // MARK: - Animation helpers (composition time; begin at AVCoreAnimationBeginTimeAtZero)

  static func norm(_ t: Double, _ total: Double) -> NSNumber {
    NSNumber(value: min(1, max(0, t / max(total, 0.001))))
  }

  /// Discrete "visible during [start, end)" opacity track.
  static func visibility(_ start: Double, _ end: Double, total: Double, on: Float = 1) -> CAKeyframeAnimation {
    let a = CAKeyframeAnimation(keyPath: "opacity")
    a.calculationMode = .discrete
    a.values = [0, on, 0]
    a.keyTimes = [0, norm(start, total), norm(end, total), 1]
    return finish(a, total)
  }

  static func pop(_ start: Double, total: Double) -> CAKeyframeAnimation {
    let a = CAKeyframeAnimation(keyPath: "transform.scale")
    a.values = [1, 1, 1.08, 1, 1]
    a.keyTimes = [0, norm(start, total), norm(start + 0.06, total), norm(start + 0.12, total), 1]
    return finish(a, total)
  }

  static func finish(_ a: CAKeyframeAnimation, _ total: Double) -> CAKeyframeAnimation {
    a.beginTime = AVCoreAnimationBeginTimeAtZero
    a.duration = max(total, 0.001)
    a.isRemovedOnCompletion = false
    a.fillMode = .both
    return a
  }

  /// Image-backed text layer whose frame is the word's text box (padding for the stroke sits outside it).
  static func text(_ s: String, font: CTFont, fill: CGColor, stroke: CGColor?, strokeWidth: Double, origin: CGPoint, scale: CGFloat) -> CALayer {
    let l = CALayer()
    guard let g = TextRasterizer.render(s, font: font, fill: fill, stroke: stroke, strokeWidth: CGFloat(strokeWidth), scale: max(1, scale)) else { return l }
    l.frame = CGRect(x: origin.x - g.inset.width, y: origin.y - g.inset.height, width: g.size.width, height: g.size.height)
    l.contents = g.image
    l.contentsScale = max(1, scale)
    return l
  }

  // MARK: - Tree

  public static func build(plan: EditPlan, captions: CaptionSettings, render: CGSize, contentsScale: CGFloat = 1, watermark: Bool = false) -> CALayer {
    let root = CALayer()
    root.frame = CGRect(origin: .zero, size: render)
    root.masksToBounds = true
    let total = plan.compDuration
    let style = CaptionStyle.forId(captions.styleId)
    let base = ColorParser.cgColor(captions.colors.base) ?? ColorParser.white
    let active = ColorParser.cgColor(captions.colors.active) ?? base
    let stroke = ColorParser.cgColor(captions.colors.stroke) ?? ColorParser.black
    let bg = ColorParser.cgColor(captions.colors.bg) ?? ColorParser.make(0.06, 0.07, 0.13, 0.85)
    // Outline strokes scale with frame width (preset stroke is in 1080-wide pixels).
    let strokeW = style.strokeWidth * Double(render.width) / 1080

    if captions.enabled && total > 0 {
      for card in plan.cards {
        let words = layout(card: card, captions: captions, style: style, render: render)
        guard !words.isEmpty else { continue }
        let cardLayer = CALayer()
        cardLayer.frame = root.bounds
        cardLayer.opacity = 0
        cardLayer.add(visibility(card.start, card.end, total: total), forKey: "visible")

        if style.animation == .box {
          let rect = words.map(\.frame).reduce(words[0].frame) { $0.union($1) }
          let pad = rect.height / CGFloat(max(1, Set(words.map { $0.frame.minY }).count)) * 0.28
          let shape = CAShapeLayer()
          shape.path = CGPath(roundedRect: rect.insetBy(dx: -pad * 1.4, dy: -pad * 0.6), cornerWidth: pad * 1.4, cornerHeight: pad * 1.4, transform: nil)
          shape.fillColor = bg
          cardLayer.addSublayer(shape)
        }

        for lw in words {
          let frame = lw.frame
          let container = CALayer()
          container.frame = frame
          if style.shadow {
            container.shadowColor = ColorParser.black
            container.shadowOpacity = 0.65
            container.shadowRadius = CTFontGetSize(lw.font) * 0.09
            container.shadowOffset = CGSize(width: 0, height: CTFontGetSize(lw.font) * 0.04)
          }
          let local = CGRect(origin: .zero, size: frame.size)
          container.addSublayer(text(lw.word.text, font: lw.font, fill: base, stroke: stroke, strokeWidth: strokeW, origin: .zero, scale: contentsScale))

          let w = lw.word
          switch style.animation {
          case .pop, .karaoke, .box:
            let hl = text(w.text, font: lw.font, fill: active, stroke: stroke, strokeWidth: strokeW, origin: .zero, scale: contentsScale)
            hl.opacity = 0
            // Karaoke keeps spoken words lit until the card ends; pop and box light the current word only.
            let until = style.animation == .karaoke ? card.end : w.end
            hl.add(visibility(w.start, until, total: total), forKey: "active")
            if style.animation == .karaoke {
              hl.shadowColor = active
              hl.shadowOpacity = 0.8
              hl.shadowRadius = CTFontGetSize(lw.font) * 0.25
              hl.shadowOffset = .zero
            }
            container.addSublayer(hl)
            if style.animation == .pop { container.add(pop(w.start, total: total), forKey: "pop") }
          case .underline:
            let bar = CALayer()
            let h = max(2, CTFontGetSize(lw.font) * 0.08)
            bar.frame = CGRect(x: 0, y: local.height - h * 1.2, width: lw.frame.width, height: h)
            bar.backgroundColor = active
            bar.cornerRadius = h / 2
            bar.opacity = 0
            bar.add(visibility(w.start, w.end, total: total), forKey: "active")
            container.addSublayer(bar)
          case .none:
            break
          }
          cardLayer.addSublayer(container)
        }
        root.addSublayer(cardLayer)
      }
    }

    if watermark {
      let size = render.width * 0.034
      let font = CTFontCreateWithName("Poppins-SemiBold" as CFString, size, nil)
      let label = "Tenfold"
      let w = width(label, font) + 4
      let h = lineHeight(font)
      let mark = text(label, font: font, fill: ColorParser.white, stroke: nil, strokeWidth: 0,
                      origin: CGPoint(x: render.width - w - render.width * 0.04, y: render.height - h - render.height * 0.035),
                      scale: contentsScale)
      mark.opacity = 0.7
      mark.shadowColor = ColorParser.black
      mark.shadowOpacity = 0.5
      mark.shadowRadius = 3
      mark.shadowOffset = .zero
      root.addSublayer(mark)
    }
    return root
  }
}
