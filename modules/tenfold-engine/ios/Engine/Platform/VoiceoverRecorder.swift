import AVFoundation

/// Tells the preview not to switch the audio session while a voiceover is being recorded
/// (TenfoldPreviewView.activatePlaybackAudio checks it before setting `.playback`).
final class AudioSessionGate: @unchecked Sendable {
  static let shared = AudioSessionGate()
  private let lock = NSLock()
  private var value = false

  var recording: Bool {
    get {
      lock.lock()
      defer { lock.unlock() }
      return value
    }
    set {
      lock.lock()
      value = newValue
      lock.unlock()
    }
  }
}

/// Voiceover recording into `<project>/audio/<uuid>.m4a` (AAC, 44.1 kHz, mono).
///
/// While recording, the session is `.playAndRecord` with `.defaultToSpeaker` (the preview keeps playing
/// out loud), `.allowBluetoothHFP` (AirPods mic) and `.mixWithOthers`. Afterwards it goes back to
/// `.playback` / `.moviePlayback`, what the preview uses.
@MainActor
enum VoiceoverRecorder {
  private static var recorder: AVAudioRecorder?
  private static var current: (file: String, url: URL)?

  /// `file` when recording started, `error: "microphone"` when access is denied.
  static func start(projectId: String) async -> AddedAudio {
    guard (try? ProjectStore.meta(projectId)) != nil else { return AddedAudio(error: "Couldn't find this video's folder.") }
    switch AVAudioApplication.shared.recordPermission {
    case .denied:
      return AddedAudio(error: "microphone")
    case .undetermined:
      let granted = await AVAudioApplication.requestRecordPermission()
      if !granted { return AddedAudio(error: "microphone") }
    default:
      break
    }
    // A recording still running (a second tap) is thrown away first.
    if let r = recorder, let cur = current {
      r.stop()
      try? FileManager.default.removeItem(at: cur.url)
      recorder = nil
      current = nil
    }

    let session = AVAudioSession.sharedInstance()
    AudioSessionGate.shared.recording = true
    let (file, url) = AudioFiles.newFile(projectId, ext: "m4a")
    do {
      try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetoothHFP, .mixWithOthers])
      try session.setActive(true)
      let settings: [String: Any] = [
        AVFormatIDKey: kAudioFormatMPEG4AAC,
        AVSampleRateKey: 44_100,
        AVNumberOfChannelsKey: 1,
        AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue,
      ]
      let r = try AVAudioRecorder(url: url, settings: settings)
      guard r.prepareToRecord(), r.record() else { throw EngineError.message("The microphone couldn't start.") }
      recorder = r
      current = (file, url)
      return AddedAudio(file: file)
    } catch {
      try? FileManager.default.removeItem(at: url)
      AudioSessionGate.shared.recording = false
      restorePlayback()
      return AddedAudio(error: error.localizedDescription)
    }
  }

  /// Stops and reports the file and its length.
  static func stop() async -> AddedAudio {
    guard let r = recorder, let cur = current else { return AddedAudio(error: "Nothing is being recorded.") }
    let elapsed = r.currentTime
    r.stop()
    recorder = nil
    current = nil
    AudioSessionGate.shared.recording = false
    restorePlayback()
    let probed = await AudioFiles.duration(cur.url)
    return AddedAudio(file: cur.file, durationSec: probed > 0 ? probed : elapsed)
  }

  private static func restorePlayback() {
    let session = AVAudioSession.sharedInstance()
    try? session.setCategory(.playback, mode: .moviePlayback)
    try? session.setActive(true)
  }
}
