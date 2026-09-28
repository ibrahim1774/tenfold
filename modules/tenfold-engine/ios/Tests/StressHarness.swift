import AVFoundation
import Darwin
import Foundation
import QuartzCore

// Stress mode of the render harness: runs real files (any size, codec, orientation, or broken) through the
// app's import → analyse → plan → export path, one job or many in one process. No ProjectStore folders:
// everything is written under the given out dir. Run: modules/tenfold-engine/scripts/stress-render.sh

/// Words laid over the loud stretches of the audio (no speech engine on macOS 15), with "um"/"uh"
/// sprinkled in so filler cuts, captions and the planner get realistic word counts for any length.
struct EnvelopeTranscriber: Transcriber {
  let name = "envelope"
  func transcribe(samples: [Float], sampleRate: Double, language: String, progress: @escaping @Sendable (Double) -> Void) async throws -> Transcript {
    let hop = Int(sampleRate * 0.02)
    guard hop > 0, samples.count >= hop else { return Transcript(words: [], language: "en", engine: name, wordTimingIsExact: true) }
    var loud: [Bool] = []
    var i = 0
    while i + hop <= samples.count {
      var s: Float = 0
      for k in i..<(i + hop) { s += samples[k] * samples[k] }
      loud.append(10 * log10(Double(s) / Double(hop) + 1e-12) > -40)
      i += hop
    }
    let vocab = ["so", "today", "we", "edit", "a", "video", "with", "captions", "and", "cuts", "that", "is", "it."]
    var words: [Word] = []
    var n = 0
    var f = 0
    while f < loud.count {
      guard loud[f] else { f += 1; continue }
      var e = f
      while e < loud.count && loud[e] { e += 1 }
      var t = Double(f) * 0.02
      let end = Double(e) * 0.02
      while t + 0.2 <= end {
        let text = n % 9 == 4 ? "um" : n % 13 == 7 ? "uh" : vocab[n % vocab.count]
        words.append(Word(text: text, start: t, end: min(end, t + 0.28)))
        n += 1
        t += 0.35
      }
      f = e
    }
    progress(1)
    return Transcript(words: words, language: "en", engine: name, wordTimingIsExact: true)
  }
}

/// Current physical footprint (what jetsam counts on iOS), MB.
func footprintMB() -> Double {
  var info = task_vm_info_data_t()
  var count = mach_msg_type_number_t(MemoryLayout<task_vm_info_data_t>.size / MemoryLayout<natural_t>.size)
  let kr = withUnsafeMutablePointer(to: &info) {
    $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) { task_info(mach_task_self_, task_flavor_t(TASK_VM_INFO), $0, &count) }
  }
  return kr == KERN_SUCCESS ? Double(info.phys_footprint) / 1_048_576 : -1
}

struct StressResult {
  var ok: Bool
  var stage: String
  var message: String
  var probe: String = ""
  var outSize: String = ""
  var outDuration = 0.0
  var planDuration = 0.0
  var words = 0
  var cuts = 0
}

/// One job, mirroring MediaImporter.finish + the editor's analyse and export calls.
/// Debug aid for leak hunting: STRESS_UPTO=poster|analyze|build stops the job after that stage.
let stressUpto = ProcessInfo.processInfo.environment["STRESS_UPTO"] ?? ""

func stressJob(_ src: URL, outDir: URL, tag: String, quality: RenderQuality, keepHDR: Bool) async -> StressResult {
  var r = StressResult(ok: false, stage: "probe", message: "")
  let work = outDir.appendingPathComponent("job-\(tag)", isDirectory: true)
  try? FileManager.default.createDirectory(at: work, withIntermediateDirectories: true)
  defer { try? FileManager.default.removeItem(at: work) }
  do {
    let media = try await AnalysisEngine.probe(src)
    r.probe = String(format: "%.0fx%.0f %.2fs %.1ffps hdr=%@ audio=%@", media.width, media.height, media.durationSec, media.fps, media.isHDR ? "y" : "n", media.hasAudio ? "y" : "n")
    if media.durationSec > AnalysisEngine.maxDuration {
      r.stage = "import"
      r.message = "Longer than 10 minutes. Trim it in Photos first. (\(media.durationSec) s)"
      return r
    }
    r.stage = "poster"
    // The app ignores a poster failure (MediaImporter.finish uses try?), so note it and carry on.
    var notes: [String] = []
    do { try await ThumbnailGenerator.poster(source: src, to: work.appendingPathComponent("poster.jpg"), at: min(1, media.durationSec / 3)) } catch {
      notes.append("poster: \(error.localizedDescription)")
    }
    let thumbs = try await ThumbnailGenerator.strip(source: src, duration: media.durationSec, count: 12, dir: work, clipId: nil)
    if thumbs.count < 12 { notes.append("filmstrip \(thumbs.count)/12") }

    if stressUpto == "poster" { r.ok = true; return r }
    r.stage = "analyze"
    let analysis = try await AnalysisEngine.analyzeClip(
      source: src, media: media, options: AnalysisOptions(silence: .medium, fillers: .standard, language: "en"),
      transcriber: EnvelopeTranscriber()) { _, _ in }
    r.words = analysis.transcript?.words.count ?? 0
    r.cuts = analysis.cuts.filter(\.accepted).count

    if stressUpto == "analyze" { r.ok = true; return r }
    r.stage = "plan"
    var doc = EditDocument(cuts: analysis.cuts)
    doc.captions = CaptionSettings(styleId: "pop")
    doc.zoom = ZoomSettings(mode: .subtle, intensity: 2, faceFollow: true)
    doc.textOverlays = [TextOverlay(id: "t1", text: "Stress test", style: "classic", box: "filled", color: "#7C4DFF", size: 0.06, x: 0.5, y: 0.2, rotation: -4)]
    if ProcessInfo.processInfo.environment["STRESS_BARE"] != nil { doc.captions.enabled = false; doc.textOverlays = [] }
    let plan = EditPlanner.plan(doc: doc, analysis: analysis)
    r.planDuration = plan.compDuration

    r.stage = "build"
    let built = try await CompositionBuilder.build(source: src, media: media, plan: plan, doc: doc, faces: analysis.faces, quality: quality, keepHDR: keepHDR)
    let expect = CompositionBuilder.renderSize(media: media, crop: doc.crop, quality: quality)

    if stressUpto == "build" { r.ok = true; return r }
    r.stage = "export"
    let out = work.appendingPathComponent("export.mp4")
    try await Exporter.export(
      built: built, plan: plan, captions: doc.captions, overlays: doc.textOverlays ?? [],
      options: ExportOptions(quality: quality, watermark: ProcessInfo.processInfo.environment["STRESS_BARE"] == nil, saveToPhotos: false, keepHDR: keepHDR), to: out) { _ in }

    if ProcessInfo.processInfo.environment["STRESS_FLUSH"] != nil { CATransaction.flush() }
    r.stage = "verify"
    let asset = AVURLAsset(url: out)
    r.outDuration = try await asset.load(.duration).seconds
    guard let v = try await asset.loadTracks(withMediaType: .video).first else { r.message = "export has no video track"; return r }
    let (natural, pt) = try await v.load(.naturalSize, .preferredTransform)
    let shown = CGRect(origin: .zero, size: natural).applying(pt).size
    r.outSize = "\(Int(abs(shown.width)))x\(Int(abs(shown.height)))"
    let bytes = (try? FileManager.default.attributesOfItem(atPath: out.path)[.size] as? Int) ?? 0
    r.outSize += " \(bytes / 1024)KB"
    var problems: [String] = []
    if abs(r.outDuration - plan.compDuration) > 0.15 { problems.append(String(format: "duration %.2f vs plan %.2f", r.outDuration, plan.compDuration)) }
    if abs(abs(shown.width) - expect.width) > 2 || abs(abs(shown.height) - expect.height) > 2 { problems.append("size \(shown) vs \(expect)") }
    let hasAudioOut = !(try await asset.loadTracks(withMediaType: .audio)).isEmpty
    if media.hasAudio && !hasAudioOut { problems.append("audio lost") }
    // Decode a frame near the end: catches exports that stop early or carry undecodable frames.
    let g = AVAssetImageGenerator(asset: asset)
    g.maximumSize = CGSize(width: 320, height: 320)
    if (try? await g.image(at: CMTime(seconds: max(0, r.outDuration - 0.2), preferredTimescale: 600))) == nil { problems.append("last frame not decodable") }
    r.ok = problems.isEmpty
    r.message = (problems + notes).joined(separator: "; ")
    return r
  } catch {
    r.message = error.localizedDescription
    return r
  }
}

func printResult(_ name: String, _ r: StressResult, secs: Double) {
  print(String(format: "RESULT %@ | %@ | stage=%@ | %.2fs | fp=%.0fMB | probe=%@ | out=%@ %.2fs (plan %.2fs) | words=%d cuts=%d | %@",
               name, r.ok ? "PASS" : "FAIL", r.stage, secs, footprintMB(), r.probe, r.outSize, r.outDuration, r.planDuration, r.words, r.cuts, r.message))
}

/// --stress one <clip> <outDir> [--uhd] [--keep-hdr]
/// --stress batch <listFile> <outDir> <jobs>   (clips round-robin, footprint after each job)
func stressMain(_ args: [String]) async -> Never {
  registerBundledFonts()
  guard args.count >= 3 else { print("usage: --stress one <clip> <outDir> | --stress batch <list> <outDir> <jobs>"); exit(2) }
  let outDir = URL(fileURLWithPath: args[2])
  try? FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)
  let quality: RenderQuality = args.contains("--uhd") ? .uhd : .hd
  let keepHDR = args.contains("--keep-hdr")
  if args[0] == "one" {
    let src = URL(fileURLWithPath: args[1])
    let t0 = Date()
    let r = await stressJob(src, outDir: outDir, tag: "one", quality: quality, keepHDR: keepHDR)
    printResult(src.lastPathComponent, r, secs: Date().timeIntervalSince(t0))
    exit(r.ok ? 0 : 1)
  }
  let clips = ((try? String(contentsOfFile: args[1], encoding: .utf8)) ?? "").split(separator: "\n").map(String.init).filter { !$0.isEmpty }
  let jobs = args.count > 3 ? Int(args[3]) ?? 50 : 50
  guard !clips.isEmpty else { print("no clips in \(args[1])"); exit(2) }
  var fails = 0
  var fps: [Double] = []
  print(String(format: "START fp=%.0fMB", footprintMB()))
  for j in 0..<jobs {
    let src = URL(fileURLWithPath: clips[j % clips.count])
    let t0 = Date()
    let r = await stressJob(src, outDir: outDir, tag: "\(j)", quality: .hd, keepHDR: false)
    if !r.ok { fails += 1 }
    fps.append(footprintMB())
    printResult("#\(j) \(src.lastPathComponent)", r, secs: Date().timeIntervalSince(t0))
  }
  let warm = min(5, fps.count - 1)
  let tail = Array(fps[warm...])
  // Least-squares slope of footprint over jobs after warm-up.
  let n = Double(tail.count)
  let xs = (0..<tail.count).map(Double.init)
  let mx = xs.reduce(0, +) / n, my = tail.reduce(0, +) / n
  let num = zip(xs, tail).map { ($0 - mx) * ($1 - my) }.reduce(0, +)
  let den = xs.map { ($0 - mx) * ($0 - mx) }.reduce(0, +)
  print(String(format: "BATCH jobs=%d fails=%d fp after job %d=%.0fMB last=%.0fMB max=%.0fMB slope=%.2fMB/job",
               jobs, fails, warm, tail.first ?? 0, fps.last ?? 0, fps.max() ?? 0, den > 0 ? num / den : 0))
  exit(0)
}
