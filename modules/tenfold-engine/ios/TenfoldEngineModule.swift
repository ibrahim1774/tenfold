import AVFoundation
import ExpoModulesCore
import UIKit

public class TenfoldEngineModule: Module {
  public func definition() -> ModuleDefinition {
    Name("TenfoldEngine")

    Events("onJobProgress", "onJobStateChange", "onModelDownloadProgress", "onImportProgress")

    Function("ping") { "pong" }

    Function("thermalState") { () -> String in
      switch ProcessInfo.processInfo.thermalState {
      case .nominal: return "nominal"
      case .fair: return "fair"
      case .serious: return "serious"
      case .critical: return "critical"
      @unknown default: return "nominal"
      }
    }

    Function("isLowPowerMode") { ProcessInfo.processInfo.isLowPowerModeEnabled }

    Function("freeDiskBytes") { Double(ProjectStore.freeDiskBytes()) }

    AsyncFunction("setKeepAwake") { (on: Bool) in
      UIApplication.shared.isIdleTimerDisabled = on
    }.runOnQueue(.main)

    // MARK: Import

    AsyncFunction("pickVideos") { (maxCount: Int) async throws -> String in
      guard let presenter = await MainActor.run(body: { self.appContext?.utilities?.currentViewController() }) else {
        throw EngineError.message("Couldn't open the photo picker.")
      }
      let results = await MediaImporter.pick(max: max(1, maxCount), from: presenter)
      var assets: [ImportedAsset] = []
      for (i, r) in results.enumerated() {
        self.sendEvent("onImportProgress", ["index": i, "total": results.count])
        assets.append(await MediaImporter.importResult(r, index: i))
      }
      self.sendEvent("onImportProgress", ["index": results.count, "total": results.count])
      return try encodeJSON(assets)
    }

    /// Imports a video file (camera recording or bundled sample) the same way a Photos pick is imported.
    AsyncFunction("importFile") { (uri: String, title: String) async throws -> String in
      let asset = await MediaImporter.importFile(uri: uri, title: title)
      return try encodeJSON(asset)
    }

    // MARK: Colour picker

    /// System colour picker over whatever is on screen (the captions sheet). Resolves "#RRGGBB", or null if closed.
    AsyncFunction("pickColor") { (initialHex: String) async -> String? in
      guard let presenter = await MainActor.run(body: { ColorPicker.topViewController(from: self.appContext?.utilities?.currentViewController()) }) else {
        return nil
      }
      return await ColorPicker.pick(initialHex: initialHex, from: presenter)
    }

    // MARK: Audio (sounds added to a video live in <project>/audio/)

    /// Files picker for a sound; copies it into the project. AddedAudio JSON (`error: "cancelled"` when closed).
    AsyncFunction("pickAudioFile") { (projectId: String) async -> String in
      guard let presenter = await MainActor.run(body: { ColorPicker.topViewController(from: self.appContext?.utilities?.currentViewController()) }) else {
        return (try? encodeJSON(AddedAudio(error: "Couldn't open Files."))) ?? "{}"
      }
      let added = await AudioPicker.addFromFiles(projectId: projectId, presenter: presenter)
      return (try? encodeJSON(added)) ?? "{}"
    }

    /// Photos picker for one video; saves its sound as .m4a. AddedAudio JSON (`error: "noAudio"` when it has none).
    AsyncFunction("extractAudio") { (projectId: String) async -> String in
      guard let presenter = await MainActor.run(body: { ColorPicker.topViewController(from: self.appContext?.utilities?.currentViewController()) }) else {
        return (try? encodeJSON(AddedAudio(error: "Couldn't open Photos."))) ?? "{}"
      }
      let added = await MediaImporter.extractAudio(projectId: projectId, presenter: presenter)
      return (try? encodeJSON(added)) ?? "{}"
    }

    /// Starts a voiceover. AddedAudio JSON: `file`, or `error: "microphone"` when access is denied.
    AsyncFunction("startVoiceover") { (projectId: String) async -> String in
      let started = await VoiceoverRecorder.start(projectId: projectId)
      return (try? encodeJSON(started)) ?? "{}"
    }

    /// Stops the voiceover. AddedAudio JSON with `file` and `durationSec`.
    AsyncFunction("stopVoiceover") { () async -> String in
      let stopped = await VoiceoverRecorder.stop()
      return (try? encodeJSON(stopped)) ?? "{}"
    }

    /// Waveform bars (0...1) for an added sound.
    AsyncFunction("audioWaveform") { (projectId: String, file: String, buckets: Int) async throws -> String in
      guard let url = AudioFiles.url(projectId, file), FileManager.default.fileExists(atPath: url.path) else {
        throw EngineError.message("This sound file is missing.")
      }
      return try encodeJSON(try await AudioFiles.waveform(url, buckets: buckets))
    }

    /// Deletes an added sound no clip uses any more. False when the path isn't one of this project's sounds.
    AsyncFunction("deleteAudioFile") { (projectId: String, file: String) -> Bool in
      AudioFiles.remove(projectId, file)
    }

    // MARK: Speech (Apple SpeechAnalyzer; assets managed by iOS)

    AsyncFunction("speechStatus") { (language: String) async -> String in
      let (state, locale) = await AppleTranscriber.status(language)
      return (try? encodeJSON(["state": state.rawValue, "locale": locale?.identifier ?? ""])) ?? "{}"
    }

    AsyncFunction("prepareSpeech") { (language: String) async throws -> String in
      let locale = try await AppleTranscriber.prepare(language) { f in
        self.sendEvent("onModelDownloadProgress", ["fraction": f])
      }
      return try encodeJSON(["state": "installed", "locale": locale.identifier])
    }

    // MARK: Analysis

    AsyncFunction("analyze") { (projectId: String, optionsJSON: String) async throws -> String in
      let options = try decodeJSON(AnalysisOptions.self, optionsJSON)
      return try await JobRegistry.shared.run("\(projectId):analyze") {
        let analysis = try await AnalysisEngine.analyze(projectId: projectId, options: options, transcriber: AppleTranscriber.isAvailable ? AppleTranscriber() : nil) { stage, fraction in
          self.sendEvent("onJobProgress", ["projectId": projectId, "stage": stage, "fraction": fraction])
        }
        AnalysisCache.shared.set(projectId, analysis)
        return try encodeJSON(analysis)
      }
    }

    AsyncFunction("getAnalysis") { (projectId: String) async throws -> String in
      try encodeJSON(try AnalysisCache.shared.get(projectId))
    }

    AsyncFunction("plan") { (projectId: String, docJSON: String) async throws -> String in
      let doc = try decodeJSON(EditDocument.self, docJSON)
      return try encodeJSON(EditPlanner.plan(doc: doc, analysis: try AnalysisCache.shared.get(projectId)))
    }

    /// Recomputes silence/filler suggestions at a new strength from the stored analysis (no re-transcription).
    AsyncFunction("suggestCuts") { (projectId: String, optionsJSON: String) async throws -> String in
      let options = try decodeJSON(AnalysisOptions.self, optionsJSON)
      let a = try AnalysisCache.shared.get(projectId)
      let r = AnalysisPlanner.detect(
        envelope: a.envelopeDb, words: a.transcript?.words ?? [], wordTimingIsExact: a.transcript?.wordTimingIsExact ?? true,
        language: a.transcript?.language ?? options.language, options: options)
      return try encodeJSON(a.noSpeech ? [] : r.cuts)
    }

    AsyncFunction("thumbnails") { (projectId: String, count: Int) async throws -> String in
      let meta = try ProjectStore.meta(projectId)
      let source = ProjectStore.dir(projectId).appendingPathComponent(meta.sourceFile)
      let thumbs = try await ThumbnailGenerator.strip(source: source, duration: meta.media.durationSec, count: count, dir: ProjectStore.subdir(projectId, "thumbs"))
      return try encodeJSON(thumbs)
    }

    // MARK: Export

    AsyncFunction("export") { (projectId: String, docJSON: String, optionsJSON: String) async throws -> String in
      let doc = try decodeJSON(EditDocument.self, docJSON)
      let options = try decodeJSON(ExportOptions.self, optionsJSON)
      return try await JobRegistry.shared.run("\(projectId):export") {
        let started = Date()
        let meta = try ProjectStore.meta(projectId)
        let analysis = try AnalysisCache.shared.get(projectId)
        let source = ProjectStore.dir(projectId).appendingPathComponent(meta.sourceFile)
        let quality: RenderQuality = options.quality == .uhd && min(meta.media.width, meta.media.height) >= 2160 ? .uhd : .hd

        // Need roughly 2× the source size free before writing (spec §8).
        let sourceBytes = ProjectStore.size(of: source)
        if ProjectStore.freeDiskBytes() > 0 && ProjectStore.freeDiskBytes() < sourceBytes * 2 {
          throw EngineError.message("Not enough free space on your iPhone to export this video.")
        }

        // If iOS ends our background time, cancel the export cleanly instead of being killed.
        let bg = await MainActor.run {
          UIApplication.shared.beginBackgroundTask(withName: "tenfold-export") {
            JobRegistry.shared.cancel(prefix: "\(projectId):export")
          }
        }
        defer { Task { @MainActor in UIApplication.shared.endBackgroundTask(bg) } }

        self.sendEvent("onJobProgress", ["projectId": projectId, "stage": "rendering", "fraction": 0])
        let plan = EditPlanner.plan(doc: doc, analysis: analysis)
        let built = try await CompositionBuilder.build(source: source, media: meta.media, plan: plan, doc: doc, faces: analysis.faces, quality: quality, keepHDR: options.keepHDR)
        let name = "tenfold-\(Int(Date().timeIntervalSince1970)).mp4"
        let out = ProjectStore.subdir(projectId, "exports").appendingPathComponent(name)
        try await Exporter.export(built: built, plan: plan, captions: doc.captions, overlays: doc.textOverlays ?? [], options: options, to: out) { f in
          self.sendEvent("onJobProgress", ["projectId": projectId, "stage": "exporting", "fraction": f])
        }
        var saved = false
        var denied = false
        var saveError: String?
        if options.saveToPhotos {
          self.sendEvent("onJobProgress", ["projectId": projectId, "stage": "saving", "fraction": 0])
          // The video is rendered either way; a failed save still leaves it shareable.
          do {
            saved = try await PhotoSaver.save(out)
            denied = !saved
          } catch {
            saveError = error.localizedDescription
          }
        }
        return try encodeJSON(ExportResult(uri: out.absoluteString, savedToPhotos: saved, photosDenied: denied, saveError: saveError, durationSec: plan.compDuration, elapsedSec: Date().timeIntervalSince(started)))
      }
    }

    AsyncFunction("cancel") { (projectId: String) in
      JobRegistry.shared.cancel(prefix: "\(projectId):")
    }

    // MARK: Storage

    AsyncFunction("deleteProject") { (projectId: String) in
      JobRegistry.shared.cancel(prefix: "\(projectId):")
      AnalysisCache.shared.remove(projectId)
      ProjectStore.delete(projectId)
    }

    AsyncFunction("projectExists") { (projectId: String) -> Bool in
      (try? ProjectStore.meta(projectId)) != nil
    }

    AsyncFunction("storageBytes") { () -> Double in
      Double(ProjectStore.size(of: ProjectStore.root))
    }

    AsyncFunction("clearExports") {
      ProjectStore.clearExports()
    }

    // MARK: Preview view

    View(TenfoldPreviewView.self) {
      Events("onTime", "onReady", "onEnd", "onError", "onPlayingChange")

      Prop("projectId") { (view: TenfoldPreviewView, id: String) in
        view.setProject(id)
      }
      Prop("document") { (view: TenfoldPreviewView, json: String) in
        view.setDocument(json)
      }
      Prop("playing") { (view: TenfoldPreviewView, playing: Bool) in
        view.setPlaying(playing)
      }
      Prop("muted") { (view: TenfoldPreviewView, muted: Bool) in
        view.setMuted(muted)
      }

      AsyncFunction("seek") { (view: TenfoldPreviewView, time: Double) in
        view.seek(time)
      }.runOnQueue(.main)
    }
  }
}
