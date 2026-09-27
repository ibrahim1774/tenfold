import AVFoundation
import PhotosUI
import UIKit
import UniformTypeIdentifiers

public struct ImportedAsset: Codable, Sendable {
  public var projectId: String
  public var title: String
  public var media: MediaInfo?
  public var posterUri: String?
  public var error: String?
}

/// A clip added to an existing project (multi-clip projects). `error` is "cancelled" when a picker was closed.
public struct AddedClip: Codable, Sendable {
  public var id: String?
  public var title: String?
  public var media: MediaInfo?
  public var posterUri: String?
  public var error: String?

  public init(id: String? = nil, title: String? = nil, media: MediaInfo? = nil, posterUri: String? = nil, error: String? = nil) {
    self.id = id
    self.title = title
    self.media = media
    self.posterUri = posterUri
    self.error = error
  }
}

/// PHPicker import (spec §4.2): no photo-library permission, files copied into the project folder.
@MainActor
public final class MediaImporter: NSObject, PHPickerViewControllerDelegate {
  private var continuation: CheckedContinuation<[PHPickerResult], Never>?
  private static var active: MediaImporter?

  public static func pick(max: Int, from presenter: UIViewController) async -> [PHPickerResult] {
    let importer = MediaImporter()
    active = importer
    defer { active = nil }
    return await withCheckedContinuation { c in
      importer.continuation = c
      var config = PHPickerConfiguration()
      config.filter = .videos
      config.selectionLimit = max
      config.preferredAssetRepresentationMode = .current
      config.selection = .ordered
      let picker = PHPickerViewController(configuration: config)
      picker.delegate = importer
      presenter.present(picker, animated: true)
    }
  }

  public func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
    picker.dismiss(animated: true)
    continuation?.resume(returning: results)
    continuation = nil
  }

  /// Copies one picked item into a new project folder and probes it.
  nonisolated public static func importResult(_ result: PHPickerResult, index: Int) async -> ImportedAsset {
    let id = UUID().uuidString.lowercased()
    let provider = result.itemProvider
    let title = provider.suggestedName ?? "Clip \(index + 1)"
    let type = provider.registeredTypeIdentifiers.first { UTType($0)?.conforms(to: .movie) == true } ?? UTType.movie.identifier
    let ext = UTType(type)?.preferredFilenameExtension ?? "mov"
    let dest = ProjectStore.dir(id).appendingPathComponent("source.\(ext)")

    let copied: Error? = await withCheckedContinuation { c in
      _ = provider.loadFileRepresentation(forTypeIdentifier: type) { url, error in
        guard let url else {
          c.resume(returning: error ?? EngineError.message("Couldn't load this video."))
          return
        }
        do {
          try? FileManager.default.removeItem(at: dest)
          try FileManager.default.copyItem(at: url, to: dest)
          c.resume(returning: nil)
        } catch {
          c.resume(returning: error)
        }
      }
    }
    if let copied {
      ProjectStore.delete(id)
      return ImportedAsset(projectId: id, title: title, media: nil, posterUri: nil, error: copied.localizedDescription)
    }
    return await finish(id: id, dest: dest, title: title)
  }

  /// Picks one video in Photos and saves its sound as `<project>/audio/<uuid>.m4a`.
  /// `error` is "cancelled" when the picker was closed, "noAudio" when the video has no sound.
  public static func extractAudio(projectId: String, presenter: UIViewController) async -> AddedAudio {
    guard (try? ProjectStore.meta(projectId)) != nil else { return AddedAudio(error: "Couldn't find this video's folder.") }
    guard let result = await pick(max: 1, from: presenter).first else { return AddedAudio(error: "cancelled") }
    return await soundOf(result, projectId: projectId)
  }

  nonisolated private static func soundOf(_ result: PHPickerResult, projectId: String) async -> AddedAudio {
    let provider = result.itemProvider
    let name = provider.suggestedName ?? "video"
    let type = provider.registeredTypeIdentifiers.first { UTType($0)?.conforms(to: .movie) == true } ?? UTType.movie.identifier
    let ext = UTType(type)?.preferredFilenameExtension ?? "mov"
    let folder = ProjectStore.subdir(projectId, AudioFiles.folderName)
    let temp = folder.appendingPathComponent("picked-\(UUID().uuidString.lowercased()).\(ext)")
    defer { try? FileManager.default.removeItem(at: temp) }
    let copied: Error? = await withCheckedContinuation { c in
      _ = provider.loadFileRepresentation(forTypeIdentifier: type) { url, error in
        guard let url else {
          c.resume(returning: error ?? EngineError.message("Couldn't load this video."))
          return
        }
        do {
          try? FileManager.default.removeItem(at: temp)
          try FileManager.default.copyItem(at: url, to: temp)
          c.resume(returning: nil)
        } catch {
          c.resume(returning: error)
        }
      }
    }
    if let copied { return AddedAudio(error: copied.localizedDescription) }
    let (file, dest) = AudioFiles.newFile(projectId, ext: "m4a")
    do {
      try await AudioFiles.extractTrack(from: temp, to: dest)
    } catch {
      try? FileManager.default.removeItem(at: dest)
      return AddedAudio(error: error.localizedDescription == "noAudio" ? "noAudio" : "Couldn't read the sound from this video.")
    }
    let duration = await AudioFiles.duration(dest)
    guard duration > 0.05 else {
      try? FileManager.default.removeItem(at: dest)
      return AddedAudio(error: "noAudio")
    }
    return AddedAudio(file: file, title: "Sound from \(name)", durationSec: duration)
  }

  /// Imports a video file (a camera recording, the bundled sample clip) into a new project folder.
  /// `uri` is a file:// URL, or an http(s) URL in dev builds where Metro serves bundled assets.
  nonisolated public static func importFile(uri: String, title: String) async -> ImportedAsset {
    let id = UUID().uuidString.lowercased()
    guard let url = URL(string: uri) ?? URL(string: "file://" + uri) else {
      return ImportedAsset(projectId: id, title: title, media: nil, posterUri: nil, error: "Couldn't read this video.")
    }
    let ext = url.pathExtension.isEmpty ? "mov" : url.pathExtension
    let dest = ProjectStore.dir(id).appendingPathComponent("source.\(ext)")
    do {
      try? FileManager.default.removeItem(at: dest)
      if url.isFileURL {
        try FileManager.default.copyItem(at: url, to: dest)
      } else {
        let (tmp, response) = try await URLSession.shared.download(from: url)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
          throw EngineError.message("Couldn't load this video (HTTP \(http.statusCode)).")
        }
        try FileManager.default.moveItem(at: tmp, to: dest)
      }
    } catch {
      ProjectStore.delete(id)
      return ImportedAsset(projectId: id, title: title, media: nil, posterUri: nil, error: error.localizedDescription)
    }
    return await finish(id: id, dest: dest, title: title)
  }

  // MARK: Clips added to a project (multi-clip projects)

  nonisolated static func newClipId() -> String { "k" + String(UUID().uuidString.lowercased().prefix(8)) }

  nonisolated static func movieType(_ provider: NSItemProvider) -> (type: String, ext: String) {
    let type = provider.registeredTypeIdentifiers.first { UTType($0)?.conforms(to: .movie) == true } ?? UTType.movie.identifier
    return (type, UTType(type)?.preferredFilenameExtension ?? "mov")
  }

  /// Copies a picked item's file to `dest`. Nil on success.
  nonisolated static func copy(_ provider: NSItemProvider, type: String, to dest: URL) async -> Error? {
    await withCheckedContinuation { c in
      _ = provider.loadFileRepresentation(forTypeIdentifier: type) { url, error in
        guard let url else {
          c.resume(returning: error ?? EngineError.message("Couldn't load this video."))
          return
        }
        do {
          try? FileManager.default.removeItem(at: dest)
          try FileManager.default.copyItem(at: url, to: dest)
          c.resume(returning: nil)
        } catch {
          c.resume(returning: error)
        }
      }
    }
  }

  /// Photos picker for clips to add to a project; each is copied in as `source-<clipId>.<ext>`.
  public static func pickClips(projectId: String, max: Int, presenter: UIViewController, progress: @escaping @Sendable (Int, Int) -> Void) async -> [AddedClip] {
    guard (try? ProjectStore.meta(projectId)) != nil else { return [AddedClip(error: "Couldn't find this video's folder.")] }
    let results = await pick(max: max, from: presenter)
    var out: [AddedClip] = []
    for (i, r) in results.enumerated() {
      progress(i, results.count)
      out.append(await addPicked(r, projectId: projectId, index: i))
    }
    progress(results.count, results.count)
    return out
  }

  nonisolated static func addPicked(_ result: PHPickerResult, projectId: String, index: Int) async -> AddedClip {
    let provider = result.itemProvider
    let title = provider.suggestedName ?? "Clip \(index + 2)"
    let (type, ext) = movieType(provider)
    let clipId = newClipId()
    let dest = ProjectStore.dir(projectId).appendingPathComponent("source-\(clipId).\(ext)")
    if let error = await copy(provider, type: type, to: dest) {
      try? FileManager.default.removeItem(at: dest)
      return AddedClip(title: title, error: error.localizedDescription)
    }
    return await finishClip(projectId: projectId, clipId: clipId, dest: dest, title: title)
  }

  /// Files picker for one video to add to a project.
  public static func pickVideoFile(projectId: String, presenter: UIViewController) async -> AddedClip {
    guard (try? ProjectStore.meta(projectId)) != nil else { return AddedClip(error: "Couldn't find this video's folder.") }
    guard let picked = await AudioPicker.pick(from: presenter, types: [.movie, .mpeg4Movie, .quickTimeMovie]) else {
      return AddedClip(error: "cancelled")
    }
    return await addFile(projectId: projectId, from: picked, title: picked.deletingPathExtension().lastPathComponent, removeSource: true)
  }

  /// Adds a video file (a camera recording, a file:// or dev-server URL) to a project as a new clip.
  nonisolated public static func addClip(projectId: String, uri: String, title: String) async -> AddedClip {
    guard (try? ProjectStore.meta(projectId)) != nil else { return AddedClip(title: title, error: "Couldn't find this video's folder.") }
    guard let url = URL(string: uri) ?? URL(string: "file://" + uri) else { return AddedClip(title: title, error: "Couldn't read this video.") }
    if url.isFileURL { return await addFile(projectId: projectId, from: url, title: title, removeSource: false) }
    let clipId = newClipId()
    let dest = ProjectStore.dir(projectId).appendingPathComponent("source-\(clipId).\(url.pathExtension.isEmpty ? "mov" : url.pathExtension)")
    do {
      let (tmp, response) = try await URLSession.shared.download(from: url)
      if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
        throw EngineError.message("Couldn't load this video (HTTP \(http.statusCode)).")
      }
      try? FileManager.default.removeItem(at: dest)
      try FileManager.default.moveItem(at: tmp, to: dest)
    } catch {
      try? FileManager.default.removeItem(at: dest)
      return AddedClip(title: title, error: error.localizedDescription)
    }
    return await finishClip(projectId: projectId, clipId: clipId, dest: dest, title: title)
  }

  nonisolated static func addFile(projectId: String, from source: URL, title: String, removeSource: Bool) async -> AddedClip {
    let clipId = newClipId()
    let ext = source.pathExtension.isEmpty ? "mov" : source.pathExtension
    let dest = ProjectStore.dir(projectId).appendingPathComponent("source-\(clipId).\(ext)")
    do {
      try? FileManager.default.removeItem(at: dest)
      if removeSource {
        try FileManager.default.moveItem(at: source, to: dest)
      } else {
        try FileManager.default.copyItem(at: source, to: dest)
      }
    } catch {
      try? FileManager.default.removeItem(at: dest)
      return AddedClip(title: title, error: "Couldn't copy this video: \(error.localizedDescription)")
    }
    return await finishClip(projectId: projectId, clipId: clipId, dest: dest, title: title.isEmpty ? "Clip" : title)
  }

  /// Moves other projects' clips into `targetId` (in order) and deletes those projects: several picked
  /// videos joined into one. Each moved project brings its first clip.
  nonisolated public static func joinProjects(targetId: String, otherIds: [String]) async -> [AddedClip] {
    var out: [AddedClip] = []
    for other in otherIds where other != targetId {
      guard let m = try? ProjectStore.meta(other) else {
        out.append(AddedClip(error: "Couldn't find a picked video."))
        continue
      }
      let clip = m.primaryClip
      out.append(await addFile(projectId: targetId, from: ProjectStore.clipURL(other, clip), title: clip.title, removeSource: true))
      ProjectStore.delete(other)
    }
    return out
  }

  /// Probes a clip copied into the project, writes its poster and adds it to meta.json. Deletes the file on failure.
  nonisolated static func finishClip(projectId: String, clipId: String, dest: URL, title: String) async -> AddedClip {
    do {
      let media = try await probe(dest)
      if media.durationSec > AnalysisEngine.maxDuration {
        try? FileManager.default.removeItem(at: dest)
        return AddedClip(title: title, media: media, error: "Longer than 10 minutes. Trim it in Photos first.")
      }
      let posterName = "poster-\(clipId).jpg"
      let poster = ProjectStore.dir(projectId).appendingPathComponent(posterName)
      try? await ThumbnailGenerator.poster(source: dest, to: poster, at: min(1, media.durationSec / 3))
      let hasPoster = FileManager.default.fileExists(atPath: poster.path)
      let clip = ClipMeta(id: clipId, sourceFile: dest.lastPathComponent, media: media, posterFile: hasPoster ? posterName : nil, title: title)
      _ = try ProjectStore.appendClip(projectId, clip)
      return AddedClip(id: clipId, title: title, media: media, posterUri: hasPoster ? poster.absoluteString : nil)
    } catch {
      try? FileManager.default.removeItem(at: dest)
      return AddedClip(title: title, error: error.localizedDescription)
    }
  }

  nonisolated static func probe(_ url: URL) async throws -> MediaInfo { try await AnalysisEngine.probe(url) }

  /// Probes the copied file, writes the poster and meta, and reports the asset. Deletes the project on failure.
  nonisolated private static func finish(id: String, dest: URL, title: String) async -> ImportedAsset {
    do {
      let media = try await AnalysisEngine.probe(dest)
      if media.durationSec > AnalysisEngine.maxDuration {
        ProjectStore.delete(id)
        return ImportedAsset(projectId: id, title: title, media: media, posterUri: nil, error: "Longer than 10 minutes. Trim it in Photos first.")
      }
      let poster = ProjectStore.dir(id).appendingPathComponent("poster.jpg")
      try? await ThumbnailGenerator.poster(source: dest, to: poster, at: min(1, media.durationSec / 3))
      let meta = ProjectMeta(id: id, title: title, sourceFile: dest.lastPathComponent, createdAt: Date().timeIntervalSince1970 * 1000, media: media, posterFile: "poster.jpg")
      try ProjectStore.write(meta, id, "meta.json")
      return ImportedAsset(projectId: id, title: title, media: media, posterUri: poster.absoluteString, error: nil)
    } catch {
      ProjectStore.delete(id)
      return ImportedAsset(projectId: id, title: title, media: nil, posterUri: nil, error: error.localizedDescription)
    }
  }
}
