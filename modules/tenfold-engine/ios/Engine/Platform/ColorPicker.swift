import UIKit

/// Presents the system colour picker (UIColorPickerViewController) and returns the chosen colour as
/// "#RRGGBB", or nil when the user closes it without choosing.
@MainActor
public final class ColorPicker: NSObject, UIColorPickerViewControllerDelegate, UIAdaptivePresentationControllerDelegate {
  private var continuation: CheckedContinuation<String?, Never>?
  private var chosen: String?
  private static var active: ColorPicker?

  public static func pick(initialHex: String, from presenter: UIViewController) async -> String? {
    // One wait at a time: a second request resolves the first with whatever it had chosen so far.
    active?.finish()
    let picker = ColorPicker()
    active = picker
    return await withCheckedContinuation { (c: CheckedContinuation<String?, Never>) in
      picker.continuation = c
      let vc = UIColorPickerViewController()
      vc.supportsAlpha = false
      if let cg = ColorParser.cgColor(initialHex) { vc.selectedColor = UIColor(cgColor: cg) }
      vc.delegate = picker
      // The sheet can also be swiped away; that ends the pick too (whatever was chosen so far is kept).
      vc.presentationController?.delegate = picker
      presenter.present(vc, animated: true)
    }
  }

  /// The top-most presented view controller (the captions sheet, when it is open).
  public static func topViewController(from root: UIViewController?) -> UIViewController? {
    var top = root
    while let next = top?.presentedViewController, !next.isBeingDismissed {
      top = next
    }
    return top
  }

  private func finish() {
    guard let c = continuation else { return }
    continuation = nil
    c.resume(returning: chosen)
    if ColorPicker.active === self { ColorPicker.active = nil }
  }

  public func colorPickerViewController(_ viewController: UIColorPickerViewController, didSelect color: UIColor, continuously: Bool) {
    chosen = Self.hex(color)
  }

  public func colorPickerViewControllerDidFinish(_ viewController: UIColorPickerViewController) {
    chosen = Self.hex(viewController.selectedColor)
    finish()
  }

  public func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
    finish()
  }

  /// sRGB "#RRGGBB" (wide-gamut picks are clamped into sRGB).
  static func hex(_ color: UIColor) -> String {
    var r: CGFloat = 0
    var g: CGFloat = 0
    var b: CGFloat = 0
    var a: CGFloat = 0
    let srgb = UIColor(cgColor: color.cgColor.converted(to: ColorParser.space, intent: .defaultIntent, options: nil) ?? color.cgColor)
    if !srgb.getRed(&r, green: &g, blue: &b, alpha: &a) {
      var white: CGFloat = 0
      if srgb.getWhite(&white, alpha: &a) {
        r = white
        g = white
        b = white
      }
    }
    let ri = Int((min(1, max(0, Double(r))) * 255).rounded())
    let gi = Int((min(1, max(0, Double(g))) * 255).rounded())
    let bi = Int((min(1, max(0, Double(b))) * 255).rounded())
    return String(format: "#%02X%02X%02X", ri, gi, bi)
  }
}
