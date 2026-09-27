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
