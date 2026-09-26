import Foundation

/// Rendering behaviour per caption style (mirrors src/captions/presets.ts).
public enum CaptionAnimation: String, Sendable { case pop, karaoke, box, none, underline }

public struct CaptionStyle: Sendable, Equatable {
  public var id: String
  public var sizeRatio: Double
  public var strokeWidth: Double
  public var shadow: Bool
  public var animation: CaptionAnimation
  public var emphasis: Bool

  public static func forId(_ id: String) -> CaptionStyle {
    switch id {
    case "karaoke": return CaptionStyle(id: id, sizeRatio: 0.052, strokeWidth: 0, shadow: true, animation: .karaoke, emphasis: true)
    case "boxed": return CaptionStyle(id: id, sizeRatio: 0.048, strokeWidth: 0, shadow: false, animation: .box, emphasis: false)
    case "outline": return CaptionStyle(id: id, sizeRatio: 0.07, strokeWidth: 10, shadow: false, animation: .none, emphasis: false)
    case "minimal": return CaptionStyle(id: id, sizeRatio: 0.045, strokeWidth: 0, shadow: true, animation: .underline, emphasis: false)
    case "subtle": return CaptionStyle(id: id, sizeRatio: 0.036, strokeWidth: 0, shadow: true, animation: .none, emphasis: false)
    default: return CaptionStyle(id: "pop", sizeRatio: 0.052, strokeWidth: 6, shadow: true, animation: .pop, emphasis: true)
    }
  }

  /// PostScript names of the fonts embedded by the expo-font config plugin.
  public static func fontName(_ id: String) -> String {
    switch id {
    case "inter": return "Inter-Black"
    case "bebas": return "BebasNeue-Regular"
    case "montserrat": return "Montserrat-ExtraBold"
    case "sfRounded": return ".SFUI-Bold" // resolved to the rounded system font at render time
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
    let style = CaptionStyle.forId(doc.captions.styleId)
    let cards = doc.captions.enabled
      ? CaptionGrouper.group(
        words: words, overrides: doc.wordOverrides, mapper: mapper, maxWords: doc.captions.maxWords,
        uppercase: doc.captions.uppercase, envelope: analysis.envelopeDb, emphasis: style.emphasis)
      : []
    return EditPlan(
      segments: mapper.segments, compDuration: mapper.compDuration, zoom: zoom, cards: cards,
      removedSec: max(0, analysis.media.durationSec - mapper.compDuration))
  }
}
