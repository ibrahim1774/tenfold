import Foundation

/// Rendering behaviour per caption style (mirrors src/captions/presets.ts).
public enum CaptionAnimation: String, Sendable { case pop, karaoke, box, none, underline, highlight, neon, reveal, classic }

/// What sits behind the words. `box`/`translucent` are one rounded box per card (per line for the
/// TikTok `classic` animation); `highlight` is a pill behind the word being spoken, in the highlight colour.
public enum CaptionBackground: String, Sendable { case none, box, translucent, highlight }

/// Outline widths, in 1080-wide pixels like the presets' own `strokeWidth`.
public enum CaptionOutline: String, Sendable {
  case none, thin, thick
  public var width: Double {
    switch self {
    case .none: return 0
    case .thin: return 4
    case .thick: return 10
    }
  }
}

public struct CaptionStyle: Sendable, Equatable {
  public var id: String
  public var sizeRatio: Double
  public var strokeWidth: Double
  public var shadow: Bool
  public var animation: CaptionAnimation
  public var emphasis: Bool
  public var background: CaptionBackground = .none

  /// The preset's look with the document's overrides merged on top. Preview and export both render this.
  public static func resolve(_ settings: CaptionSettings) -> CaptionStyle {
    resolve(preset: forId(settings.presetId), settings: settings)
  }

  public static func resolve(preset: CaptionStyle, settings: CaptionSettings) -> CaptionStyle {
    var s = preset
    if let raw = settings.background, let b = CaptionBackground(rawValue: raw) { s.background = b }
    if let raw = settings.outline, let o = CaptionOutline(rawValue: raw) { s.strokeWidth = o.width }
    if let shadow = settings.shadow { s.shadow = shadow }
    if let raw = settings.animation, let a = CaptionAnimation(rawValue: raw) { s.animation = a }
    return s
  }

  public static func forId(_ id: String) -> CaptionStyle {
    var s = presetStyle(id)
    s.background = defaultBackground(s.id)
    return s
  }

  static func presetStyle(_ id: String) -> CaptionStyle {
    switch id {
    case "karaoke": return CaptionStyle(id: id, sizeRatio: 0.052, strokeWidth: 0, shadow: true, animation: .karaoke, emphasis: true)
    case "boxed": return CaptionStyle(id: id, sizeRatio: 0.048, strokeWidth: 0, shadow: false, animation: .box, emphasis: false)
    case "outline": return CaptionStyle(id: id, sizeRatio: 0.07, strokeWidth: 10, shadow: false, animation: .none, emphasis: false)
    case "minimal": return CaptionStyle(id: id, sizeRatio: 0.045, strokeWidth: 0, shadow: true, animation: .underline, emphasis: false)
    case "subtle": return CaptionStyle(id: id, sizeRatio: 0.036, strokeWidth: 0, shadow: true, animation: .none, emphasis: false)
    case "tiktok": return CaptionStyle(id: id, sizeRatio: 0.046, strokeWidth: 0, shadow: false, animation: .classic, emphasis: false)
    case "highlight": return CaptionStyle(id: id, sizeRatio: 0.054, strokeWidth: 0, shadow: true, animation: .highlight, emphasis: false)
    case "neon": return CaptionStyle(id: id, sizeRatio: 0.056, strokeWidth: 0, shadow: false, animation: .neon, emphasis: true)
    case "typewriter": return CaptionStyle(id: id, sizeRatio: 0.046, strokeWidth: 0, shadow: true, animation: .reveal, emphasis: false)
    case "oneword": return CaptionStyle(id: id, sizeRatio: 0.095, strokeWidth: 8, shadow: true, animation: .pop, emphasis: false)
    case "handwritten": return CaptionStyle(id: id, sizeRatio: 0.058, strokeWidth: 0, shadow: true, animation: .none, emphasis: false)
    default: return CaptionStyle(id: "pop", sizeRatio: 0.052, strokeWidth: 6, shadow: true, animation: .pop, emphasis: true)
    }
  }

  /// The background a preset has before any override (matches `background` in src/captions/presets.ts).
  public static func defaultBackground(_ id: String) -> CaptionBackground {
    switch id {
    case "boxed", "tiktok": return .box
    case "highlight": return .highlight
    default: return .none
    }
  }

  /// PostScript names of the fonts embedded by the expo-font config plugin.
  public static func fontName(_ id: String) -> String {
    switch id {
    case "inter": return "Inter-Black"
    case "bebas": return "BebasNeue-Regular"
    case "montserrat": return "Montserrat-ExtraBold"
    case "sfRounded": return ".SFUI-Bold" // resolved to the rounded system font at render time
    case "tiktok": return "TikTokSans-ExtraBold"
    case "typewriter": return "AmericanTypewriter-Bold"  // iOS system font (TikTok "Typewriter")
    case "handwriting": return "Noteworthy-Bold"  // iOS system font (TikTok "Handwriting")
    case "serif": return "Georgia-Bold"  // iOS system font (TikTok "Serif")
    default: return "Poppins-Bold"
    }
  }
}

public enum EditPlanner {
  /// The one deterministic plan both the preview and the export render from.
  public static func plan(doc: EditDocument, analysis: Analysis) -> EditPlan {
    let keep = CutPlanner.keepSegments(cuts: doc.cuts, duration: analysis.media.durationSec)
    let mapper = TimeMapper(keep: keep)
    let words = analysis.transcript?.words ?? []
    let zoom = ZoomPlanner.plan(mapper: mapper, words: words, faces: analysis.faces, settings: doc.zoom)
    let style = CaptionStyle.resolve(doc.captions)
    var grouped = CaptionGrouper.Output(cards: [], hidden: [])
    if doc.captions.enabled {
      grouped = CaptionGrouper.groupAll(
        words: words, overrides: doc.wordOverrides, mapper: mapper, maxWords: doc.captions.maxWords,
        uppercase: doc.captions.uppercase, envelope: analysis.envelopeDb, emphasis: style.emphasis, edits: doc.captionEdits)
    }
    return EditPlan(
      segments: mapper.segments, compDuration: mapper.compDuration, zoom: zoom, cards: grouped.cards,
      removedSec: max(0, analysis.media.durationSec - mapper.compDuration), hiddenCards: grouped.hidden,
      speech: AudioPlanner.speech(words: words, mapper: mapper))
  }
}
