import AVFoundation
import ExpoModulesCore
import UIKit

/// Player for the edited composition with the caption layer tree in an AVSynchronizedLayer (spec §4.14).
/// Zoom/crop come from the composition's layer instructions, captions from the same builder the export uses.
class TenfoldPreviewView: ExpoView {
  let onTime = EventDispatcher()
  let onReady = EventDispatcher()
  let onEnd = EventDispatcher()
  let onError = EventDispatcher()
  let onPlayingChange = EventDispatcher()

  private let player = AVPlayer()
  private let playerLayer = AVPlayerLayer()
  private var syncLayer: AVSynchronizedLayer?
  private var captionRoot: CALayer?
  private var renderSize = CGSize(width: 1080, height: 1920)
  private var projectId: String?
  private var documentJSON: String?
  private var lastBuiltJSON: String?
  private var wantsPlaying = false
  private var timeObserver: Any?
  private var endObserver: NSObjectProtocol?
  private var rebuildTask: Task<Void, Never>?
  private var statusObservation: NSKeyValueObservation?
  /// Item swaps briefly pause the player; don't report those as the user's pause.
  private var quietUntil: CFTimeInterval = 0
  private var reportedPlaying = false

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    backgroundColor = .black
    playerLayer.player = player
    playerLayer.videoGravity = .resizeAspect
    layer.addSublayer(playerLayer)
    player.actionAtItemEnd = .pause
    timeObserver = player.addPeriodicTimeObserver(forInterval: CMTime(value: 1, timescale: 30), queue: .main) { [weak self] t in
      self?.onTime(["time": t.seconds])
    }
    // Tell JS whenever the player really starts or stops (end of clip, interruptions), so its play button never lies.
    statusObservation = player.observe(\.timeControlStatus, options: [.new]) { [weak self] _, _ in
      DispatchQueue.main.async { self?.reconcilePlaying() }
    }
  }

  private func reconcilePlaying() {
    let playing = player.timeControlStatus != .paused
    guard CACurrentMediaTime() >= quietUntil, playing != reportedPlaying else { return }
    reportedPlaying = playing
    if !playing { wantsPlaying = false }
    onPlayingChange(["playing": playing])
  }

  deinit {
    if let timeObserver { player.removeTimeObserver(timeObserver) }
    if let endObserver { NotificationCenter.default.removeObserver(endObserver) }
    statusObservation?.invalidate()
    rebuildTask?.cancel()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    playerLayer.frame = bounds
    layoutCaptions()
    CATransaction.commit()
  }

  private func layoutCaptions() {
    guard let sync = syncLayer, let root = captionRoot, bounds.width > 0 else { return }
    let rect = AVMakeRect(aspectRatio: renderSize, insideRect: bounds)
    sync.frame = rect
    let k = rect.width / renderSize.width
    root.bounds = CGRect(origin: .zero, size: renderSize)
    root.position = CGPoint(x: rect.width / 2, y: rect.height / 2)
    root.transform = CATransform3DMakeScale(k, k, 1)
  }

  // MARK: Props

  func setProject(_ id: String) {
    guard id != projectId else { return }
    projectId = id
    lastBuiltJSON = nil
    scheduleRebuild(delay: 0)
  }

  func setDocument(_ json: String) {
    documentJSON = json
    scheduleRebuild(delay: 0.15)
  }

  func setPlaying(_ playing: Bool) {
    wantsPlaying = playing
    if playing {
      Self.activatePlaybackAudio()
      if let item = player.currentItem, item.duration.isNumeric, CMTimeCompare(player.currentTime(), item.duration) >= 0 {
        player.seek(to: .zero)
      }
      player.play()
    } else {
      player.pause()
      player.rate = 0
    }
  }

  /// The default session (soloAmbient) is silenced by the Ring/Silent switch; an editor preview should always be heard.
  private static func activatePlaybackAudio() {
    let session = AVAudioSession.sharedInstance()
    if session.category != .playback {
      try? session.setCategory(.playback, mode: .moviePlayback)
    }
    try? session.setActive(true)
  }

  func setMuted(_ muted: Bool) {
    player.isMuted = muted
  }

  func seek(_ time: Double) {
    player.seek(to: CMTime(seconds: max(0, time), preferredTimescale: 600), toleranceBefore: .zero, toleranceAfter: .zero)
  }

  // MARK: Rebuild

  private func scheduleRebuild(delay: Double) {
    rebuildTask?.cancel()
    rebuildTask = Task { @MainActor [weak self] in
      if delay > 0 { try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000)) }
      guard !Task.isCancelled else { return }
      await self?.rebuild()
    }
  }

  @MainActor
  private func rebuild() async {
    guard let id = projectId, let json = documentJSON, json != lastBuiltJSON else { return }
    do {
      let doc = try decodeJSON(EditDocument.self, json)
      let analysis = try AnalysisCache.shared.get(id)
      let meta = try ProjectStore.meta(id)
      let source = ProjectStore.dir(id).appendingPathComponent(meta.sourceFile)
      let plan = EditPlanner.plan(doc: doc, analysis: analysis)
      let built = try await CompositionBuilder.build(source: source, media: meta.media, plan: plan, doc: doc, faces: analysis.faces, quality: .preview)
      guard !Task.isCancelled else { return }

      quietUntil = CACurrentMediaTime() + 0.5
      let resumeAt = player.currentTime()
      let item = AVPlayerItem(asset: built.composition)
      item.videoComposition = built.videoComposition
      item.audioMix = built.audioMix
      player.replaceCurrentItem(with: item)
      renderSize = built.renderSize

      syncLayer?.removeFromSuperlayer()
      let sync = AVSynchronizedLayer(playerItem: item)
      let root = CaptionLayerBuilder.build(plan: plan, captions: doc.captions, render: built.renderSize, contentsScale: 1, watermark: false)
      sync.addSublayer(root)
      layer.addSublayer(sync)
      syncLayer = sync
      captionRoot = root
      layoutSubviews()

      if let endObserver { NotificationCenter.default.removeObserver(endObserver) }
      endObserver = NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main) { [weak self] _ in
        self?.onEnd([:])
      }

      let limit = max(0, plan.compDuration - 0.05)
      if resumeAt.isNumeric && resumeAt.seconds > 0 {
        seek(min(resumeAt.seconds, limit))
      }
      if wantsPlaying { player.play() }
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { [weak self] in self?.reconcilePlaying() }
      lastBuiltJSON = json
      onReady(["duration": plan.compDuration, "width": built.renderSize.width, "height": built.renderSize.height])
    } catch {
      onError(["message": error.localizedDescription])
    }
  }
}
