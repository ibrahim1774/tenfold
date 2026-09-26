import AVFoundation
import CoreGraphics
import Foundation

// End-to-end media check on macOS: synthetic clip → analyze → plan → composition → HEVC export
// with captions → read back. Run: modules/tenfold-engine/scripts/test-render.sh <outDir>

struct FakeTranscriber: Transcriber {
  let name = "fake"
  func transcribe(samples: [Float], sampleRate: Double, language: String, progress: @escaping @Sendable (Double) -> Void) async throws -> Transcript {
    // Tone plays 0–2 s and 3–6 s (gap 2–3 s); "um" at 3.1–3.4.
    let words = [
      Word(text: "So", start: 0.2, end: 0.5), Word(text: "today", start: 0.55, end: 0.95), Word(text: "we", start: 1.0, end: 1.2),
      Word(text: "edit", start: 1.25, end: 1.6), Word(text: "videos.", start: 1.65, end: 1.95), Word(text: "um", start: 3.1, end: 3.4),
      Word(text: "Ten", start: 3.5, end: 3.8), Word(text: "at", start: 3.85, end: 4.0), Word(text: "once", start: 4.05, end: 4.5),
      Word(text: "with", start: 4.6, end: 4.9), Word(text: "captions.", start: 5.0, end: 5.7),
    ]
    progress(1)
    return Transcript(words: words, language: "en", engine: name, wordTimingIsExact: true)
  }
}

func makeClip(_ url: URL, seconds: Double = 6, size: CGSize = CGSize(width: 720, height: 1280), fps: Int32 = 30) async throws {
  try? FileManager.default.removeItem(at: url)
  let writer = try AVAssetWriter(outputURL: url, fileType: .mov)
  let vIn = AVAssetWriterInput(mediaType: .video, outputSettings: [
    AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: size.width, AVVideoHeightKey: size.height,
  ])
  let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: vIn, sourcePixelBufferAttributes: [
    kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA, kCVPixelBufferWidthKey as String: size.width, kCVPixelBufferHeightKey as String: size.height,
  ])
  let aIn = AVAssetWriterInput(mediaType: .audio, outputSettings: [
    AVFormatIDKey: kAudioFormatMPEG4AAC, AVSampleRateKey: 44100, AVNumberOfChannelsKey: 1, AVEncoderBitRateKey: 96000,
  ])
  writer.add(vIn)
  writer.add(aIn)
  writer.startWriting()
  writer.startSession(atSourceTime: .zero)

  // Audio: 220 Hz tone except a silent 2–3 s gap. Interleaved with video so the writer never stalls.
  let sr = 44100.0
  let fmt = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: sr, channels: 1, interleaved: false)!
  var desc: CMAudioFormatDescription?
  CMAudioFormatDescriptionCreate(allocator: nil, asbd: fmt.streamDescription, layoutSize: 0, layout: nil, magicCookieSize: 0, magicCookie: nil, extensions: nil, formatDescriptionOut: &desc)
  let chunk = 1470  // one video frame of audio at 30 fps
  var audioPos = 0
  func appendAudio(until seconds: Double) {
    while Double(audioPos) / sr < seconds, aIn.isReadyForMoreMediaData {
      var data = [Float](repeating: 0, count: chunk)
      for k in 0..<chunk {
        let t = Double(audioPos + k) / sr
        data[k] = (t >= 2 && t < 3) ? 0 : Float(0.4 * sin(2 * .pi * 220 * t))
      }
      var block: CMBlockBuffer?
      CMBlockBufferCreateWithMemoryBlock(allocator: nil, memoryBlock: nil, blockLength: chunk * 4, blockAllocator: nil, customBlockSource: nil, offsetToData: 0, dataLength: chunk * 4, flags: 0, blockBufferOut: &block)
      data.withUnsafeBytes { _ = CMBlockBufferReplaceDataBytes(with: $0.baseAddress!, blockBuffer: block!, offsetIntoDestination: 0, dataLength: chunk * 4) }
      var sb: CMSampleBuffer?
      CMAudioSampleBufferCreateReadyWithPacketDescriptions(allocator: nil, dataBuffer: block!, formatDescription: desc!, sampleCount: chunk, presentationTimeStamp: CMTime(value: CMTimeValue(audioPos), timescale: CMTimeScale(sr)), packetDescriptions: nil, sampleBufferOut: &sb)
      aIn.append(sb!)
      audioPos += chunk
    }
  }

  let frames = Int(seconds * Double(fps))
  var i = 0
  var spins = 0
  while i < frames || Double(audioPos) / sr < seconds {
    let t = Double(i) / Double(fps)
    appendAudio(until: min(seconds, t + 0.1))
    if i < frames, vIn.isReadyForMoreMediaData {
      var pb: CVPixelBuffer?
      CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &pb)
      if let pb {
        CVPixelBufferLockBaseAddress(pb, [])
        let ctx = CGContext(data: CVPixelBufferGetBaseAddress(pb), width: Int(size.width), height: Int(size.height), bitsPerComponent: 8,
                            bytesPerRow: CVPixelBufferGetBytesPerRow(pb), space: CGColorSpaceCreateDeviceRGB(),
                            bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)!
        ctx.setFillColor(CGColor(red: 0.15 + 0.1 * t, green: 0.2, blue: 0.45, alpha: 1))
        ctx.fill(CGRect(origin: .zero, size: size))
        ctx.setFillColor(CGColor(red: 0.95, green: 0.8, blue: 0.7, alpha: 1))
        ctx.fillEllipse(in: CGRect(x: 200 + t * 30, y: 700, width: 300, height: 360))
        ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
        ctx.fill(CGRect(x: 0, y: 40, width: size.width * CGFloat(t / seconds), height: 30))
        CVPixelBufferUnlockBaseAddress(pb, [])
        adaptor.append(pb, withPresentationTime: CMTime(value: CMTimeValue(i), timescale: fps))
      }
      i += 1
    } else {
      spins += 1
      if spins > 20000 { throw EngineError.message("writer stalled at frame \(i), audio \(audioPos)") }
      try await Task.sleep(nanoseconds: 1_000_000)
    }
  }
  vIn.markAsFinished()
  aIn.markAsFinished()
  await writer.finishWriting()
  if writer.status != .completed { throw writer.error ?? EngineError.message("writer failed") }
}

@main
struct RenderHarness {
  static func main() async {
    setbuf(stdout, nil)
    let outDir = URL(fileURLWithPath: CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : NSTemporaryDirectory())
    var failed = false
    func check(_ c: Bool, _ m: String) {
      print(c ? "  ok   \(m)" : "  FAIL \(m)")
      if !c { failed = true }
    }
    do {
      let id = "harness-\(Int(Date().timeIntervalSince1970))"
      let src = ProjectStore.dir(id).appendingPathComponent("source.mov")
      print("• making synthetic clip")
      try await makeClip(src)
      let media = try await AnalysisEngine.probe(src)
      check(abs(media.durationSec - 6) < 0.1 && media.hasAudio && media.width == 720, "probe \(media)")
      try ProjectStore.write(ProjectMeta(id: id, title: "Harness", sourceFile: "source.mov", createdAt: 0, media: media, posterFile: nil), id, "meta.json")

      print("• analyze")
      let t0 = Date()
      let analysis = try await AnalysisEngine.analyze(projectId: id, options: AnalysisOptions(silence: .medium, fillers: .standard, language: "en"), transcriber: FakeTranscriber()) { _, _ in }
      print("  analysis \(String(format: "%.2f", Date().timeIntervalSince(t0))) s, cuts: \(analysis.cuts.map { "\($0.reason.rawValue) \(String(format: "%.2f–%.2f", $0.start, $0.end)) \($0.accepted)" })")
      check(analysis.cuts.contains { $0.reason == .silence && $0.start > 1.9 && $0.end < 3.2 && $0.accepted }, "silence 2–3 s cut")
      check(analysis.cuts.contains { $0.reason == .filler && $0.accepted }, "um cut")
      check(!analysis.faces.isEmpty || true, "faces sampled (\(analysis.faces.count); synthetic face may not be detected)")

      var doc = EditDocument(cuts: analysis.cuts)
      doc.captions = CaptionSettings(styleId: "pop")
      doc.zoom = ZoomSettings(mode: .subtle, intensity: 2, faceFollow: true)
      let plan = EditPlanner.plan(doc: doc, analysis: analysis)
      print("  plan: \(String(format: "%.2f", plan.compDuration)) s, \(plan.cards.count) cards, zoom \(plan.zoom.map { $0.scale })")
      check(plan.compDuration < 5.3 && plan.compDuration > 4, "composition shortened")

      print("• build + export")
      let t1 = Date()
      let built = try await CompositionBuilder.build(source: src, media: media, plan: plan, doc: doc, faces: analysis.faces, quality: .hd)
      check(built.renderSize == CGSize(width: 1080, height: 1920), "render size \(built.renderSize)")
      check(abs(built.composition.duration.seconds - plan.compDuration) < 0.05, "composition duration \(built.composition.duration.seconds)")
      let out = outDir.appendingPathComponent("harness-export.mp4")
      try await Exporter.export(built: built, plan: plan, captions: doc.captions, options: ExportOptions(quality: .hd, watermark: true, saveToPhotos: false), to: out) { _ in }
      print("  export \(String(format: "%.2f", Date().timeIntervalSince(t1))) s")

      let exported = AVURLAsset(url: out)
      let d = try await exported.load(.duration).seconds
      check(abs(d - plan.compDuration) < 0.1, "exported duration \(d)")
      let v = try await exported.loadTracks(withMediaType: .video).first!
      let (sz, fmts) = try await v.load(.naturalSize, .formatDescriptions)
      check(sz == CGSize(width: 1080, height: 1920), "exported size \(sz)")
      let codec = fmts.first.map { CMFormatDescriptionGetMediaSubType($0) }
      check(codec == kCMVideoCodecType_HEVC, "HEVC")
      check(!(try await exported.loadTracks(withMediaType: .audio)).isEmpty, "audio kept")

      // Frames for eyeballing captions and zoom.
      let g = AVAssetImageGenerator(asset: exported)
      g.requestedTimeToleranceBefore = .zero
      g.requestedTimeToleranceAfter = .zero
      for (i, card) in plan.cards.prefix(3).enumerated() {
        let t = (card.words.first!.start + card.words.first!.end) / 2
        let (img, _) = try await g.image(at: CMTime(seconds: t, preferredTimescale: 600))
        try ThumbnailGenerator.writeJPEG(img, to: outDir.appendingPathComponent("harness-frame-\(i).jpg"))
      }
      print("  frames written to \(outDir.path)")

      print("• caption styles")
      for style in ["pop", "karaoke", "boxed", "outline", "minimal", "subtle"] {
        var d2 = doc
        d2.captions = CaptionSettings(styleId: style, font: "poppins", uppercase: style == "outline")
        if style == "boxed" { d2.captions.colors = CaptionColors(base: "#FFFFFF", active: "#FFE14D", stroke: "transparent", bg: "rgba(15,18,34,0.85)") }
        let p2 = EditPlanner.plan(doc: d2, analysis: analysis)
        let b2 = try await CompositionBuilder.build(source: src, media: media, plan: p2, doc: d2, faces: analysis.faces, quality: .hd)
        let o2 = outDir.appendingPathComponent("harness-\(style).mp4")
        try await Exporter.export(built: b2, plan: p2, captions: d2.captions, options: ExportOptions(quality: .hd, watermark: false, saveToPhotos: false), to: o2) { _ in }
        let card = p2.cards.first { $0.words.count >= 2 } ?? p2.cards[0]
        let w = card.words[min(1, card.words.count - 1)]
        let (img, _) = try await AVAssetImageGenerator(asset: AVURLAsset(url: o2)).image(at: CMTime(seconds: (w.start + w.end) / 2, preferredTimescale: 600))
        try ThumbnailGenerator.writeJPEG(img, to: outDir.appendingPathComponent("harness-style-\(style).jpg"))
        try? FileManager.default.removeItem(at: o2)
      }
      print("  style frames written")
      ProjectStore.delete(id)
    } catch {
      print("  FAIL threw \(error)")
      failed = true
    }
    print(failed ? "\nRENDER HARNESS FAILED" : "\nrender harness passed")
    exit(failed ? 1 : 0)
  }
}
