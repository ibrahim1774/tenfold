import CoreGraphics
import Foundation

/// Parses the colour strings used in the edit document: #RGB, #RRGGBB, #RRGGBBAA, rgba(r,g,b,a), transparent.
public enum ColorParser {
  static let space = CGColorSpace(name: CGColorSpace.sRGB)!

  public static func cgColor(_ s: String) -> CGColor? {
    let str = s.trimmingCharacters(in: .whitespaces).lowercased()
    if str.isEmpty || str == "transparent" || str == "none" { return nil }
    if str.hasPrefix("#") {
      var hex = String(str.dropFirst())
      if hex.count == 3 { hex = hex.map { "\($0)\($0)" }.joined() }
      guard hex.count == 6 || hex.count == 8, let v = UInt64(hex, radix: 16) else { return nil }
      let hasAlpha = hex.count == 8
      let r = Double((v >> (hasAlpha ? 24 : 16)) & 0xFF) / 255
      let g = Double((v >> (hasAlpha ? 16 : 8)) & 0xFF) / 255
      let b = Double((v >> (hasAlpha ? 8 : 0)) & 0xFF) / 255
      let a = hasAlpha ? Double(v & 0xFF) / 255 : 1
      return make(r, g, b, a)
    }
    if str.hasPrefix("rgb") {
      let inner = str.drop { $0 != "(" }.dropFirst().prefix { $0 != ")" }
      let parts = inner.split(separator: ",").compactMap { Double($0.trimmingCharacters(in: .whitespaces)) }
      guard parts.count >= 3 else { return nil }
      return make(parts[0] / 255, parts[1] / 255, parts[2] / 255, parts.count > 3 ? parts[3] : 1)
    }
    return nil
  }

  public static func make(_ r: Double, _ g: Double, _ b: Double, _ a: Double) -> CGColor {
    CGColor(colorSpace: space, components: [r, g, b, a]) ?? CGColor(gray: 1, alpha: a)
  }

  public static let white = make(1, 1, 1, 1)
  public static let black = make(0, 0, 0, 1)
}
