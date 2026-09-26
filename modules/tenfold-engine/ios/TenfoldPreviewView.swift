import ExpoModulesCore
import UIKit

// M0 placeholder. In M2 this owns the AVPlayer, AVPlayerLayer and the AVSynchronizedLayer
// that hosts the caption/zoom layer tree shared with export.
class TenfoldPreviewView: ExpoView {
  let onTime = EventDispatcher()
  let onReady = EventDispatcher()
  let onEnd = EventDispatcher()

  private let label = UILabel()
  private var projectId: String?

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    layer.cornerRadius = 28
    layer.cornerCurve = .continuous
    backgroundColor = UIColor(red: 0.09, green: 0.10, blue: 0.19, alpha: 1.0)
    label.textColor = UIColor.white.withAlphaComponent(0.7)
    label.textAlignment = .center
    label.numberOfLines = 0
    label.font = .systemFont(ofSize: 13, weight: .medium)
    label.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    label.text = "Native preview"
    addSubview(label)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    label.frame = bounds
  }

  func load(projectId: String) {
    self.projectId = projectId
    label.text = "Native preview\n\(projectId)"
    onReady(["projectId": projectId])
  }

  func setPlaying(_ playing: Bool) {
    // Wired to AVPlayer in M2.
  }
}
