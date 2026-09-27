import UIKit
import UniformTypeIdentifiers

/// The Files picker for sounds (UIDocumentPickerViewController). Opens copies (`asCopy`), so no
/// security-scoped access is needed; the picked file is copied into `<project>/audio/`.
@MainActor
public final class AudioPicker: NSObject, UIDocumentPickerDelegate, UIAdaptivePresentationControllerDelegate {
  private var continuation: CheckedContinuation<URL?, Never>?
  private static var active: AudioPicker?

  /// The picked file's temporary URL, or nil when the picker was closed.
  public static func pick(from presenter: UIViewController) async -> URL? {
    active?.finish(nil)
    let picker = AudioPicker()
    active = picker
    return await withCheckedContinuation { (c: CheckedContinuation<URL?, Never>) in
      picker.continuation = c
      let types: [UTType] = [.audio, .mp3, .mpeg4Audio, .wav, .aiff]
      let vc = UIDocumentPickerViewController(forOpeningContentTypes: types, asCopy: true)
      vc.allowsMultipleSelection = false
      vc.delegate = picker
      vc.presentationController?.delegate = picker
      presenter.present(vc, animated: true)
    }
  }

  private func finish(_ url: URL?) {
    guard let c = continuation else { return }
    continuation = nil
    c.resume(returning: url)
    if AudioPicker.active === self { AudioPicker.active = nil }
  }

  public func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
    finish(urls.first)
  }

  public func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
    finish(nil)
  }

  public func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
    finish(nil)
  }

  /// Picks a sound from Files and copies it into the project. `error` is "cancelled" when closed.
  public static func addFromFiles(projectId: String, presenter: UIViewController) async -> AddedAudio {
    guard (try? ProjectStore.meta(projectId)) != nil else { return AddedAudio(error: "Couldn't find this video's folder.") }
    guard let picked = await pick(from: presenter) else { return AddedAudio(error: "cancelled") }
    return await copyIn(projectId: projectId, from: picked)
  }

  nonisolated static func copyIn(projectId: String, from picked: URL) async -> AddedAudio {
    let (file, dest) = AudioFiles.newFile(projectId, ext: picked.pathExtension)
    do {
      try? FileManager.default.removeItem(at: dest)
      try FileManager.default.copyItem(at: picked, to: dest)
    } catch {
      return AddedAudio(error: "Couldn't copy this file: \(error.localizedDescription)")
    }
    try? FileManager.default.removeItem(at: picked)
    let duration = await AudioFiles.duration(dest)
    guard duration > 0.05 else {
      try? FileManager.default.removeItem(at: dest)
      return AddedAudio(error: "Tenfold can't read the sound in this file.")
    }
    let title = picked.deletingPathExtension().lastPathComponent
    return AddedAudio(file: file, title: title.isEmpty ? "Sound" : title, durationSec: duration)
  }
}
