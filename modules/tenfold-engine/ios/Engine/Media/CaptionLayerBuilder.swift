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
  /// Style sizes are fractions of a 9:16 frame's width; the short side keeps them the same visual size in 1:1 and 16:9.
  static func unit(_ render: CGSize) -> CGFloat { min(render.width, render.height) }

  public static func layout(card: CaptionCard, captions: CaptionSettings, style: CaptionStyle, render: CGSize) -> [LaidOutWord] {
    var size = CGFloat(style.sizeRatio * Double(unit(render)) * max(0.5, captions.sizeScale))
    let maxWidth = min(render.width * 0.84, unit(render) * 1.5)
    var result: [LaidOutWord] = []
    for attempt in 0..<8 {
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
      // Shrink while the card needs too many lines or a single word is wider than the frame allows.
      var widest: CGFloat = 0
      for line in lines {
        var lw: CGFloat = space * CGFloat(max(0, line.count - 1))
        for item in line { lw += item.1 }
        widest = max(widest, lw)
      }
      let fits = lines.count <= CaptionGrouper.maxLines && widest <= maxWidth
      let lastTry = attempt == 7 || size <= 12
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
      result = out
      if fits || lastTry { break }
      size *= 0.85
    }
    return result
  }

  // MARK: - Animation helpers (composition time; begin at AVCoreAnimationBeginTimeAtZero)

  /// Composition time → Core Animation begin time (0 must be AVCoreAnimationBeginTimeAtZero).
  static func begin(_ t: Double) -> CFTimeInterval {
    t <= 0.0001 ? AVCoreAnimationBeginTimeAtZero : t
  }

  /// Shows a layer (model opacity 0) only during [start, end): one short animation per window.
  /// This is the robust AVFoundation pattern; long keyframe tracks spanning the whole clip were
  /// dropped by Core Animation when their key times touched the clip edges.
  static func visibility(_ start: Double, _ end: Double, total: Double, on: Float = 1) -> CAAnimation {
    let a = CABasicAnimation(keyPath: "opacity")
    a.fromValue = on
    a.toValue = on
    a.beginTime = begin(max(0, start))
    a.duration = max(0.02, min(end, total) - max(0, start))
    a.isRemovedOnCompletion = false
    a.fillMode = .removed
    return a
  }

  static func pop(_ start: Double, total: Double) -> CAAnimation? {
    guard start + 0.12 < total else { return nil }
    let a = CAKeyframeAnimation(keyPath: "transform.scale")
    a.values = [1, 1.08, 1]
    a.keyTimes = [0, 0.5, 1]
    a.beginTime = begin(max(0, start))
    a.duration = 0.12
    a.isRemovedOnCompletion = false
    a.fillMode = .removed
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

  /// Box fill: the document's box colour (a dark default when it has none); translucent is the same at 55% alpha.
  static func boxColor(_ bg: String, background: CaptionBackground) -> CGColor {
    let solid = ColorParser.cgColor(bg) ?? ColorParser.make(0.06, 0.07, 0.13, 0.85)
    guard background == .translucent else { return solid }
    return solid.copy(alpha: 0.55) ?? solid
  }

  // MARK: - Tree

  public static func build(plan: EditPlan, captions: CaptionSettings, render: CGSize, contentsScale: CGFloat = 1, watermark: Bool = false) -> CALayer {
    let root = CALayer()
    root.frame = CGRect(origin: .zero, size: render)
    root.masksToBounds = true
    let total = plan.compDuration
    let style = CaptionStyle.resolve(captions)
    let base = ColorParser.cgColor(captions.colors.base) ?? ColorParser.white
    let active = ColorParser.cgColor(captions.colors.active) ?? base
    let stroke = ColorParser.cgColor(captions.colors.stroke) ?? ColorParser.black
    let bg = boxColor(captions.colors.bg, background: style.background)
    let boxed = style.background == .box || style.background == .translucent
    let pill = style.background == .highlight
    // Outline strokes scale with the frame's short side (preset stroke is in 1080-wide pixels).
    let strokeW = style.strokeWidth * Double(unit(render)) / 1080

    if captions.enabled && total > 0 {
      for card in plan.cards {
        let words = layout(card: card, captions: captions, style: style, render: render)
        guard !words.isEmpty else { continue }
        let cardLayer = CALayer()
        cardLayer.frame = root.bounds
        cardLayer.opacity = 0
        cardLayer.add(visibility(card.start, card.end, total: total), forKey: "visible")

        if boxed && style.animation != .classic {
          let rect = words.map(\.frame).reduce(words[0].frame) { $0.union($1) }
          let pad = rect.height / CGFloat(max(1, Set(words.map { $0.frame.minY }).count)) * 0.28
          let shape = CAShapeLayer()
          shape.path = CGPath(roundedRect: rect.insetBy(dx: -pad * 1.4, dy: -pad * 0.6), cornerWidth: pad * 1.4, cornerHeight: pad * 1.4, transform: nil)
          shape.fillColor = bg
          cardLayer.addSublayer(shape)
        }

        if boxed && style.animation == .classic {
          // TikTok "text background": one rounded box per line.
          let lines = Dictionary(grouping: words, by: { Int($0.frame.minY.rounded()) }).values
          for line in lines {
            let rect = line.map(\.frame).reduce(line[0].frame) { $0.union($1) }
            let pad = rect.height * 0.22
            let shape = CAShapeLayer()
            shape.path = CGPath(roundedRect: rect.insetBy(dx: -pad * 1.3, dy: -pad * 0.35), cornerWidth: pad, cornerHeight: pad, transform: nil)
            shape.fillColor = bg
            cardLayer.addSublayer(shape)
          }
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
          let w = lw.word
          if pill {
            // Coloured pill behind the word being spoken.
            let size = CTFontGetSize(lw.font)
            let pill = CALayer()
            pill.frame = local.insetBy(dx: -size * 0.18, dy: size * 0.02)
            pill.backgroundColor = active
            pill.cornerRadius = size * 0.22
            pill.opacity = 0
            pill.add(visibility(w.start, w.end, total: total), forKey: "active")
            container.addSublayer(pill)
          }
          if style.animation == .neon {
            container.shadowColor = active
            container.shadowOpacity = 1
            container.shadowRadius = CTFontGetSize(lw.font) * 0.35
            container.shadowOffset = .zero
          }
          if style.animation == .reveal {
            // Typewriter: each word appears when it's spoken and stays for the rest of the card.
            container.opacity = 0
            container.add(visibility(w.start, card.end, total: total), forKey: "reveal")
          }
          let baseFill = style.animation == .neon ? active : base
          container.addSublayer(text(w.text, font: lw.font, fill: baseFill, stroke: stroke, strokeWidth: strokeW, origin: .zero, scale: contentsScale))

          switch style.animation {
          case .neon:
            let hl = text(w.text, font: lw.font, fill: ColorParser.white, stroke: nil, strokeWidth: 0, origin: .zero, scale: contentsScale)
            hl.opacity = 0
            hl.add(visibility(w.start, w.end, total: total), forKey: "active")
            container.addSublayer(hl)
          case .pop, .karaoke, .box:
            // On a highlight pill the spoken word keeps the text colour (the pill carries the highlight).
            if pill {
              if style.animation == .pop, let p = pop(w.start, total: total) { container.add(p, forKey: "pop") }
              break
            }
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
            if style.animation == .pop, let p = pop(w.start, total: total) { container.add(p, forKey: "pop") }
          case .underline:
            let bar = CALayer()
            let h = max(2, CTFontGetSize(lw.font) * 0.08)
            bar.frame = CGRect(x: 0, y: local.height - h * 1.2, width: lw.frame.width, height: h)
            bar.backgroundColor = active
            bar.cornerRadius = h / 2
            bar.opacity = 0
            bar.add(visibility(w.start, w.end, total: total), forKey: "active")
            container.addSublayer(bar)
          case .none, .highlight, .reveal, .classic:
            break
          }
          cardLayer.addSublayer(container)
        }
        root.addSublayer(cardLayer)
      }
    }

    if watermark {
      let size = unit(render) * 0.034
      let font = CTFontCreateWithName("Poppins-SemiBold" as CFString, size, nil)
      let label = "Tenfold"
      let w = width(label, font) + 4
      let h = lineHeight(font)
      let mark = text(label, font: font, fill: ColorParser.white, stroke: nil, strokeWidth: 0,
                      origin: CGPoint(x: render.width - w - unit(render) * 0.04, y: render.height - h - unit(render) * 0.06),
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
