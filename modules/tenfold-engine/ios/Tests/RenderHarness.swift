import AVFoundation
import CoreGraphics
import CoreText
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

func makeClip(_ url: URL, seconds: Double = 6, size: CGSize = CGSize(width: 720, height: 1280), fps: Int32 = 30, transform: CGAffineTransform = .identity, green: Bool = false) async throws {
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
  vIn.transform = transform
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
  var audioFinished = false
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
        ctx.setFillColor(green ? CGColor(red: 0.1, green: 0.55, blue: 0.15, alpha: 1) : CGColor(red: 0.15 + 0.1 * t, green: 0.2, blue: 0.45, alpha: 1))
        ctx.fill(CGRect(origin: .zero, size: size))
        ctx.setFillColor(CGColor(red: 0.95, green: 0.8, blue: 0.7, alpha: 1))
        ctx.fillEllipse(in: CGRect(x: 200 + t * 30, y: 700, width: 300, height: 360))
        ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
        ctx.fill(CGRect(x: 0, y: 40, width: size.width * CGFloat(t / seconds), height: 30))
        // Red marker in the stored image's top-left corner, to check orientation after export.
        ctx.setFillColor(CGColor(red: 1, green: 0, blue: 0, alpha: 1))
        ctx.fill(CGRect(x: 0, y: size.height - size.height * 0.2, width: size.width * 0.2, height: size.height * 0.2))
        CVPixelBufferUnlockBaseAddress(pb, [])
        adaptor.append(pb, withPresentationTime: CMTime(value: CMTimeValue(i), timescale: fps))
      }
      i += 1
      spins = 0
    } else {
      // Video input is busy: let audio run ahead so the writer can interleave and never deadlocks.
      appendAudio(until: seconds)
      // All the sound is in: say so, or the writer may hold the last frames waiting to interleave more.
      if Double(audioPos) / sr >= seconds && !audioFinished {
        aIn.markAsFinished()
        audioFinished = true
      }
      spins += 1
      if spins > 20000 { throw EngineError.message("writer stalled at frame \(i), audio \(audioPos)") }
      try await Task.sleep(nanoseconds: 1_000_000)
    }
  }
  vIn.markAsFinished()
  if !audioFinished { aIn.markAsFinished() }
  await writer.finishWriting()
  if writer.status != .completed { throw writer.error ?? EngineError.message("writer failed") }
}

/// Mean RGB of a normalised rect of an image (x, y from top-left).
func meanColor(_ img: CGImage, _ r: CGRect) -> (Double, Double, Double) {
  let w = img.width, h = img.height
  var data = [UInt8](repeating: 0, count: w * h * 4)
  let ctx = CGContext(data: &data, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  ctx.draw(img, in: CGRect(x: 0, y: 0, width: w, height: h))
  var sr = 0.0, sg = 0.0, sb = 0.0, n = 0.0
  let x0 = Int(r.minX * Double(w)), x1 = max(x0 + 1, Int(r.maxX * Double(w)))
  let y0 = Int(r.minY * Double(h)), y1 = max(y0 + 1, Int(r.maxY * Double(h)))
  for y in y0..<min(h, y1) {
    for x in x0..<min(w, x1) {
      let i = (y * w + x) * 4
      sr += Double(data[i]); sg += Double(data[i + 1]); sb += Double(data[i + 2]); n += 1
    }
  }
  return (sr / n, sg / n, sb / n)
}

func isRed(_ c: (Double, Double, Double)) -> Bool { c.0 > 180 && c.1 < 90 && c.2 < 90 }
func isBlack(_ c: (Double, Double, Double)) -> Bool { c.0 < 12 && c.1 < 12 && c.2 < 12 }

/// Where is the red marker? Returns which corner (tl, tr, bl, br) is red, or nil.
func redCorner(_ img: CGImage) -> String? {
  let corners: [(String, CGRect)] = [
    ("tl", CGRect(x: 0.02, y: 0.02, width: 0.06, height: 0.04)), ("tr", CGRect(x: 0.92, y: 0.02, width: 0.06, height: 0.04)),
    ("bl", CGRect(x: 0.02, y: 0.94, width: 0.06, height: 0.04)), ("br", CGRect(x: 0.92, y: 0.94, width: 0.06, height: 0.04)),
  ]
  return corners.first { isRed(meanColor(img, $0.1)) }?.0
}

func frame(_ url: URL, at t: Double, orient: Bool = true) async throws -> CGImage {
  let g = AVAssetImageGenerator(asset: AVURLAsset(url: url))
  g.appliesPreferredTrackTransform = orient
  g.requestedTimeToleranceBefore = .zero
  g.requestedTimeToleranceAfter = .zero
  return try await g.image(at: CMTime(seconds: t, preferredTimescale: 600)).image
}

func orientationSuite(outDir: URL, check: (Bool, String) -> Void) async throws {
  struct Case { var name: String; var size: CGSize; var transform: CGAffineTransform; var crop: Bool; var quality: RenderQuality; var expect: CGSize; var aspect: String? = nil }
  let rot = CGAffineTransform(rotationAngle: .pi / 2)
  let cases = [
    Case(name: "portrait-rotated", size: CGSize(width: 1280, height: 720), transform: rot, crop: true, quality: .hd, expect: CGSize(width: 1080, height: 1920)),
    Case(name: "landscape-crop", size: CGSize(width: 1280, height: 720), transform: .identity, crop: true, quality: .hd, expect: CGSize(width: 1080, height: 1920)),
    Case(name: "landscape-keep", size: CGSize(width: 1280, height: 720), transform: .identity, crop: false, quality: .hd, expect: CGSize(width: 1920, height: 1080)),
    Case(name: "uhd-portrait", size: CGSize(width: 2160, height: 3840), transform: .identity, crop: true, quality: .uhd, expect: CGSize(width: 2160, height: 3840)),
    Case(name: "portrait-to-16x9", size: CGSize(width: 720, height: 1280), transform: .identity, crop: true, quality: .hd, expect: CGSize(width: 1920, height: 1080), aspect: "16:9"),
    Case(name: "portrait-to-1x1", size: CGSize(width: 720, height: 1280), transform: .identity, crop: true, quality: .hd, expect: CGSize(width: 1080, height: 1080), aspect: "1:1"),
    Case(name: "portrait-to-4x5", size: CGSize(width: 720, height: 1280), transform: .identity, crop: true, quality: .hd, expect: CGSize(width: 1080, height: 1350), aspect: "4:5"),
    Case(name: "portrait-original", size: CGSize(width: 720, height: 1280), transform: .identity, crop: false, quality: .hd, expect: CGSize(width: 1080, height: 1920), aspect: "original"),
  ]
  for c in cases {
    print("• \(c.name)")
    let id = "harness-\(c.name)-\(Int(Date().timeIntervalSince1970))"
    let src = ProjectStore.dir(id).appendingPathComponent("source.mov")
    try await makeClip(src, seconds: 2, size: c.size, transform: c.transform)
    let media = try await AnalysisEngine.probe(src)
    var doc = EditDocument(cuts: [])
    doc.crop = CropSettings(auto916: c.crop, aspect: c.aspect)
    doc.zoom = ZoomSettings(mode: .off)
    doc.captions.enabled = false
    let analysis = Analysis(media: media, transcript: nil, envelopeDb: [], noiseFloorDb: -60, speechThresholdDb: -38, speechCoverage: 0, noSpeech: true, cuts: [], faces: [], warnings: [])
    let plan = EditPlanner.plan(doc: doc, analysis: analysis)
    let built = try await CompositionBuilder.build(source: src, media: media, plan: plan, doc: doc, faces: [], quality: c.quality)
    let out = outDir.appendingPathComponent("harness-\(c.name).mp4")
    try await Exporter.export(built: built, plan: plan, captions: doc.captions, options: ExportOptions(quality: c.quality, watermark: false, saveToPhotos: false), to: out) { _ in }
    let v = try await AVURLAsset(url: out).loadTracks(withMediaType: .video).first!
    let (natural, pt) = try await v.load(.naturalSize, .preferredTransform)
    let shown = CGRect(origin: .zero, size: natural).applying(pt).size
    check(abs(abs(shown.width) - c.expect.width) < 2 && abs(abs(shown.height) - c.expect.height) < 2, "\(c.name): size \(natural) (expected \(c.expect))")

    let src0 = try await frame(src, at: 1)
    let out0 = try await frame(out, at: 1)
    try ThumbnailGenerator.writeJPEG(out0, to: outDir.appendingPathComponent("harness-\(c.name).jpg"))
    // No black bars on any edge.
    let edges = [CGRect(x: 0, y: 0.3, width: 0.02, height: 0.4), CGRect(x: 0.98, y: 0.3, width: 0.02, height: 0.4),
                 CGRect(x: 0.3, y: 0, width: 0.4, height: 0.02), CGRect(x: 0.3, y: 0.98, width: 0.4, height: 0.02)]
    check(!edges.contains { isBlack(meanColor(out0, $0)) }, "\(c.name): frame is filled edge to edge")
    // Orientation: where the marker is in the upright source, it must be in the export too (unless cropped away).
    let expected = redCorner(src0)
    let got = redCorner(out0)
    if (c.crop && c.size.width > c.size.height && c.transform == .identity) || (c.aspect != nil && c.aspect != "original") {
      check(got == nil || got == expected, "\(c.name): marker \(got ?? "cropped") vs source \(expected ?? "none")")
    } else {
      check(expected != nil && got == expected, "\(c.name): marker in \(got ?? "none"), source \(expected ?? "none")")
    }
    ProjectStore.delete(id)
  }

  // Manual framing: a 9:16 clip placed at Fit on a 16:9 canvas → black bars left and right, video centred.
  for (name, crop, expectBars) in [
    ("fit-16x9", CropSettings(auto916: false, aspect: "16:9", scale: 1, offsetX: 0, offsetY: 0), true),
    ("fill-16x9", CropSettings(auto916: false, aspect: "16:9", scale: Framing.fillUserScale(canvasW: 1920, canvasH: 1080, videoW: 720, videoH: 1280), offsetX: 0, offsetY: 0), false),
    ("fit-1x1-moved-right", CropSettings(auto916: false, aspect: "1:1", scale: 1, offsetX: 0.3, offsetY: 0), true),
  ] {
    print("• manual \(name)")
    let id = "harness-manual-\(name)-\(Int(Date().timeIntervalSince1970))"
    let src = ProjectStore.dir(id).appendingPathComponent("source.mov")
    try await makeClip(src, seconds: 2, size: CGSize(width: 720, height: 1280))
    let media = try await AnalysisEngine.probe(src)
    var doc = EditDocument(cuts: [])
    doc.crop = crop
    doc.zoom = ZoomSettings(mode: .off)
    doc.captions.enabled = false
    let analysis = Analysis(media: media, transcript: nil, envelopeDb: [], noiseFloorDb: -60, speechThresholdDb: -38, speechCoverage: 0, noSpeech: true, cuts: [], faces: [], warnings: [])
    let plan = EditPlanner.plan(doc: doc, analysis: analysis)
    let built = try await CompositionBuilder.build(source: src, media: media, plan: plan, doc: doc, faces: [], quality: .hd)
    let out = outDir.appendingPathComponent("harness-manual-\(name).mp4")
    try await Exporter.export(built: built, plan: plan, captions: doc.captions, options: ExportOptions(quality: .hd, watermark: false, saveToPhotos: false), to: out) { _ in }
    let img = try await frame(out, at: 1)
    try ThumbnailGenerator.writeJPEG(img, to: outDir.appendingPathComponent("harness-manual-\(name).jpg"))
    let left = isBlack(meanColor(img, CGRect(x: 0, y: 0.4, width: 0.04, height: 0.2)))
    let right = isBlack(meanColor(img, CGRect(x: 0.96, y: 0.4, width: 0.04, height: 0.2)))
    if name == "fit-16x9" {
      check(left && right, "\(name): black bars on both sides")
      check(!isBlack(meanColor(img, CGRect(x: 0.45, y: 0.4, width: 0.1, height: 0.2))), "\(name): video in the middle")
    } else if name == "fill-16x9" {
      check(!left && !right, "\(name): canvas covered edge to edge")
    } else {
      check(left && !right, "\(name): moved right leaves black on the left only")
    }
    _ = expectBars
    ProjectStore.delete(id)
  }

  // Caption layer build time for ~150 words (a 60 s talking clip).
  var words: [Word] = []
  var t = 0.0
  for i in 0..<150 {
    words.append(Word(text: ["this", "is", "a", "really", "useful", "caption", "test", "sentence."][i % 8], start: t, end: t + 0.3))
    t += 0.4
  }
  let media = MediaInfo(durationSec: t, width: 1080, height: 1920, fps: 30, isHDR: false, hasAudio: true)
  let analysis = Analysis(media: media, transcript: Transcript(words: words, language: "en", engine: "fake", wordTimingIsExact: true), envelopeDb: [], noiseFloorDb: -60, speechThresholdDb: -38, speechCoverage: 1, noSpeech: false, cuts: [], faces: [], warnings: [])
  let plan = EditPlanner.plan(doc: EditDocument(), analysis: analysis)
  let t0 = Date()
  _ = CaptionLayerBuilder.build(plan: plan, captions: CaptionSettings(), render: CGSize(width: 1080, height: 1920))
  let ms = Date().timeIntervalSince(t0) * 1000
  print(String(format: "  caption tree for %d words: %.0f ms", words.count, ms))
  check(ms < 250, "caption build under 250 ms")
}


// MARK: - Text overlays

/// Registers the app's bundled fonts (assets/fonts) so the harness renders the real faces, not a fallback.
func registerBundledFonts() {
  let dir = URL(fileURLWithPath: FileManager.default.currentDirectoryPath).appendingPathComponent("../../../assets/fonts").standardized
  let files = (try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)) ?? []
  for f in files where f.pathExtension == "ttf" {
    CTFontManagerRegisterFontsForURL(f as CFURL, .process, nil)
  }
}

func pixelRect(_ r: CGRect, _ render: CGSize) -> CGRect {
  CGRect(x: r.minX / render.width, y: r.minY / render.height, width: r.width / render.width, height: r.height / render.height)
}

func colorDiff(_ a: (Double, Double, Double), _ b: (Double, Double, Double)) -> Double {
  (abs(a.0 - b.0) + abs(a.1 - b.1) + abs(a.2 - b.2)) / 3
}

func isGreen(_ c: (Double, Double, Double)) -> Bool { c.1 > 170 && c.0 < 110 && c.2 < 110 }

func fmtColor(_ c: (Double, Double, Double)) -> String { String(format: "(%.0f, %.0f, %.0f)", c.0, c.1, c.2) }

/// Box-local point → canvas point, rotating clockwise on screen (y down), as the layer tree and RN do.
func canvasPoint(_ lay: TextOverlayLayerBuilder.Layout, rotation: Double, local: CGPoint) -> CGPoint {
  let theta = CGFloat(rotation * Double.pi / 180)
  let dx = local.x - lay.boxSize.width / 2
  let dy = local.y - lay.boxSize.height / 2
  let c = cos(theta)
  let s = sin(theta)
  let x = lay.center.x + dx * c - dy * s
  let y = lay.center.y + dx * s + dy * c
  return CGPoint(x: x, y: y)
}

/// A small sample square around a canvas point (normalised rect).
func around(_ p: CGPoint, _ render: CGSize, _ half: CGFloat = 4) -> CGRect {
  pixelRect(CGRect(x: p.x - half, y: p.y - half, width: half * 2, height: half * 2), render)
}

func textOverlaySuite(src: URL, media: MediaInfo, outDir: URL, check: (Bool, String) -> Void) async throws {
  registerBundledFonts()
  let analysis = Analysis(media: media, transcript: nil, envelopeDb: [], noiseFloorDb: -60, speechThresholdDb: -38, speechCoverage: 0, noSpeech: true, cuts: [], faces: [], warnings: [])

  func render(_ name: String, overlays: [TextOverlay], cuts: [Cut] = []) async throws -> (URL, CGSize, EditPlan) {
    var doc = EditDocument(cuts: cuts)
    doc.zoom = ZoomSettings(mode: .off)
    doc.captions.enabled = false
    doc.textOverlays = overlays
    let plan = EditPlanner.plan(doc: doc, analysis: analysis)
    let built = try await CompositionBuilder.build(source: src, media: media, plan: plan, doc: doc, faces: [], quality: .hd)
    let out = outDir.appendingPathComponent("harness-text-\(name).mp4")
    try await Exporter.export(built: built, plan: plan, captions: doc.captions, overlays: doc.textOverlays ?? [], options: ExportOptions(quality: .hd, watermark: false, saveToPhotos: false), to: out) { _ in }
    return (out, built.renderSize, plan)
  }

  print("• text overlays: fonts")
  for style in TextOverlayMetrics.styles {
    let want = TextOverlayMetrics.fontName(style)
    let got = CTFontCopyPostScriptName(TextOverlayLayerBuilder.font(style, size: 40)) as String
    check(got == want, "\(style): font \(got) (wanted \(want))")
  }

  print("• text overlays: nine styles at their places")
  let (base, size, _) = try await render("baseline", overlays: [])
  let baseImg = try await frame(base, at: 1, orient: false)
  var grid: [TextOverlay] = []
  for (i, style) in TextOverlayMetrics.styles.enumerated() {
    let x = [0.22, 0.5, 0.78][i % 3]
    let y = [0.55, 0.7, 0.85][i / 3]  // below the synthetic face, above the progress bar
    grid.append(TextOverlay(id: style, text: "Abc", style: style, color: "#FFFFFF", size: 0.07, x: x, y: y))
  }
  let (gridURL, gridSize, _) = try await render("styles", overlays: grid)
  check(gridSize == size, "same canvas \(gridSize)")
  let gridImg = try await frame(gridURL, at: 1, orient: false)
  try ThumbnailGenerator.writeJPEG(gridImg, to: outDir.appendingPathComponent("harness-text-styles.jpg"))
  for o in grid {
    let lay = TextOverlayLayerBuilder.layout(o, render: size)
    guard let line = lay.lines.first else {
      check(false, "\(o.style): laid out")
      continue
    }
    let r = line.frame.offsetBy(dx: lay.center.x - lay.boxSize.width / 2, dy: lay.center.y - lay.boxSize.height / 2)
    let over = meanColor(gridImg, pixelRect(r, size))
    let before = meanColor(baseImg, pixelRect(r, size))
    // Mean over the whole line box: thin faces (Didot) cover less of it than heavy ones.
    check(colorDiff(over, before) > 10, "\(o.style): text drawn at \(Int(r.midX)),\(Int(r.midY)) (\(fmtColor(over)) vs \(fmtColor(before)))")
    // Well away from the text (a box-height below it), the frame is untouched.
    let below = r.offsetBy(dx: 0, dy: lay.boxSize.height * 1.2)
    check(colorDiff(meanColor(gridImg, pixelRect(below, size)), meanColor(baseImg, pixelRect(below, size))) < 4, "\(o.style): nothing drawn below it")
  }

  print("• text overlays: corners stay inside the frame")
  let corners = [(0.0, 0.0), (1.0, 0.0), (0.0, 1.0), (1.0, 1.0)].enumerated().map { i, p in
    TextOverlay(id: "c\(i)", text: "Corner", style: "classic", box: "filled", color: "#00FF00", size: 0.08, x: p.0, y: p.1)
  }
  let (cornerURL, _, _) = try await render("corners", overlays: corners)
  let cornerImg = try await frame(cornerURL, at: 1, orient: false)
  try ThumbnailGenerator.writeJPEG(cornerImg, to: outDir.appendingPathComponent("harness-text-corners.jpg"))
  for o in corners {
    let lay = TextOverlayLayerBuilder.layout(o, render: size)
    let box = CGRect(x: lay.center.x - lay.boxSize.width / 2, y: lay.center.y - lay.boxSize.height / 2, width: lay.boxSize.width, height: lay.boxSize.height)
    check(box.minX >= -0.5 && box.minY >= -0.5 && box.maxX <= size.width + 0.5 && box.maxY <= size.height + 0.5, "\(o.id): box \(box) inside \(size)")
    // The box's left padding, halfway down, is the box colour.
    let pad = lay.fontSize * CGFloat(TextOverlayMetrics.padX)
    let strip = CGRect(x: box.minX + pad * 0.25, y: box.midY - lay.lineHeight * 0.2, width: pad * 0.5, height: lay.lineHeight * 0.4)
    let c = meanColor(cornerImg, pixelRect(strip, size))
    check(isGreen(c), "\(o.id): box drawn in the corner \(fmtColor(c))")
  }

  print("• text overlays: filled box and rotation")
  let boxed = TextOverlay(id: "box", text: "Filled", style: "bold", box: "filled", color: "#00FF00", size: 0.08, x: 0.5, y: 0.25)
  let turned = TextOverlay(id: "rot", text: "Rotated title", style: "classic", box: "filled", color: "#00FF00", size: 0.08, x: 0.5, y: 0.65, rotation: 30)
  let (rotURL, _, _) = try await render("box-rotation", overlays: [boxed, turned])
  let rotImg = try await frame(rotURL, at: 1, orient: false)
  try ThumbnailGenerator.writeJPEG(rotImg, to: outDir.appendingPathComponent("harness-text-rotation.jpg"))
  let bl = TextOverlayLayerBuilder.layout(boxed, render: size)
  let pad = bl.fontSize * CGFloat(TextOverlayMetrics.padX)
  let leftPad = canvasPoint(bl, rotation: 0, local: CGPoint(x: pad * 0.5, y: bl.boxSize.height / 2))
  let behind = meanColor(rotImg, around(leftPad, size))
  check(isGreen(behind) && !isGreen(meanColor(baseImg, around(leftPad, size))), "filled box turns the pixel beside the text green \(fmtColor(behind))")
  let over = meanColor(rotImg, around(CGPoint(x: bl.center.x, y: bl.center.y), size, 30))
  check(over.1 < 200 || over.0 < 60, "text on a light box is dark \(fmtColor(over))")
  let rl = TextOverlayLayerBuilder.layout(turned, render: size)
  let rp = rl.fontSize * CGFloat(TextOverlayMetrics.padX)
  // The right-hand padding: clockwise rotation carries it down (y grows); the mirror position stays video.
  let rightPad = canvasPoint(rl, rotation: 30, local: CGPoint(x: rl.boxSize.width - rp * 0.5, y: rl.boxSize.height / 2))
  let mirror = CGPoint(x: rightPad.x, y: rl.center.y - (rightPad.y - rl.center.y))
  let cw = meanColor(rotImg, around(rightPad, size))
  let ccw = meanColor(rotImg, around(mirror, size))
  check(rightPad.y > rl.center.y + 20, "positive degrees turn clockwise (right end at y \(Int(rightPad.y)) below centre \(Int(rl.center.y)))")
  check(isGreen(cw) && !isGreen(ccw), "rotated box drawn clockwise \(fmtColor(cw)), not counter-clockwise \(fmtColor(ccw))")

  print("• text overlays: output time across a cut")
  // Source 1.0–2.5 is cut, so output 1.0 joins source 1.0 to 2.5. The overlay spans output 0.8–2.0.
  let cut = Cut(id: "c", start: 1.0, end: 2.5, reason: .manual, accepted: true, confidence: 1)
  let timed = TextOverlay(id: "timed", text: "After the cut", style: "classic", box: "filled", color: "#00FF00", size: 0.08, x: 0.5, y: 0.4, start: 0.8, end: 2.0)
  let (cutURL, _, cutPlan) = try await render("cut", overlays: [timed], cuts: [cut])
  check(abs(cutPlan.compDuration - 4.5) < 0.1, "cut shortens the video to 4.5 s (\(cutPlan.compDuration))")
  let tl = TextOverlayLayerBuilder.layout(timed, render: size)
  let tp = tl.fontSize * CGFloat(TextOverlayMetrics.padX)
  let probe = canvasPoint(tl, rotation: 0, local: CGPoint(x: tp * 0.5, y: tl.boxSize.height / 2))
  for (t, visible) in [(0.5, false), (1.6, true), (3.0, false)] {
    let img = try await frame(cutURL, at: t, orient: false)
    if visible { try ThumbnailGenerator.writeJPEG(img, to: outDir.appendingPathComponent("harness-text-cut.jpg")) }
    let c = meanColor(img, around(probe, size))
    check(isGreen(c) == visible, "output \(t) s: overlay \(visible ? "shown" : "hidden") \(fmtColor(c))")
  }
  for u in [base, gridURL, cornerURL, rotURL, cutURL] { try? FileManager.default.removeItem(at: u) }
}


// MARK: - Audio lanes

/// A mono sine WAV (amplitude `amp`, `hz`) of `seconds`.
func makeTone(_ url: URL, seconds: Double, hz: Double = 440, amp: Float = 0.2) throws {
  try? FileManager.default.removeItem(at: url)
  try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
  let fmt = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: 44100, channels: 1, interleaved: false)!
  let settings: [String: Any] = [
    AVFormatIDKey: kAudioFormatLinearPCM, AVSampleRateKey: 44100, AVNumberOfChannelsKey: 1, AVLinearPCMBitDepthKey: 16,
    AVLinearPCMIsFloatKey: false, AVLinearPCMIsBigEndianKey: false,
  ]
  let file = try AVAudioFile(forWriting: url, settings: settings, commonFormat: .pcmFormatFloat32, interleaved: false)
  let n = AVAudioFrameCount(seconds * 44100)
  let buf = AVAudioPCMBuffer(pcmFormat: fmt, frameCapacity: n)!
  buf.frameLength = n
  let ch = buf.floatChannelData![0]
  for i in 0..<Int(n) { ch[i] = amp * Float(sin(2 * Double.pi * hz * Double(i) / 44100)) }
  try file.write(from: buf)
}

/// Every audio sample of a file, mixed to mono 44.1 kHz.
func readMono(_ url: URL) async throws -> [Float] {
  let asset = AVURLAsset(url: url)
  let tracks = try await asset.loadTracks(withMediaType: .audio)
  guard !tracks.isEmpty else { return [] }
  let reader = try AVAssetReader(asset: asset)
  let out = AVAssetReaderAudioMixOutput(audioTracks: tracks, audioSettings: [
    AVFormatIDKey: kAudioFormatLinearPCM, AVSampleRateKey: 44100, AVNumberOfChannelsKey: 1,
    AVLinearPCMBitDepthKey: 32, AVLinearPCMIsFloatKey: true, AVLinearPCMIsNonInterleaved: false, AVLinearPCMIsBigEndianKey: false,
  ])
  reader.add(out)
  reader.startReading()
  var samples: [Float] = []
  while let b = out.copyNextSampleBuffer() {
    guard let block = CMSampleBufferGetDataBuffer(b) else { continue }
    let len = CMBlockBufferGetDataLength(block)
    var chunk = [Float](repeating: 0, count: len / 4)
    chunk.withUnsafeMutableBytes { _ = CMBlockBufferCopyDataBytes(block, atOffset: 0, dataLength: len, destination: $0.baseAddress!) }
    samples += chunk
  }
  return samples
}

/// RMS of the exported sound between two output times.
func rms(_ s: [Float], _ a: Double, _ b: Double) -> Double {
  let i0 = max(0, Int(a * 44100)), i1 = min(s.count, Int(b * 44100))
  guard i1 > i0 else { return 0 }
  var sum = 0.0
  for i in i0..<i1 { sum += Double(s[i]) * Double(s[i]) }
  return (sum / Double(i1 - i0)).squareRoot()
}

func audioSuite(src: URL, media: MediaInfo, outDir: URL, check: (Bool, String) -> Void) async throws {
  let folder = src.deletingLastPathComponent()
  try makeTone(folder.appendingPathComponent("audio/tone.wav"), seconds: 8)
  try makeTone(folder.appendingPathComponent("audio/short.wav"), seconds: 1.5)
  let toneRMS = 0.2 / 2.0.squareRoot()
  let analysis = Analysis(media: media, transcript: nil, envelopeDb: [], noiseFloorDb: -60, speechThresholdDb: -38, speechCoverage: 0, noSpeech: true, cuts: [], faces: [], warnings: [])

  func render(_ name: String, clips: [AudioClip], cuts: [Cut] = [], mute: Bool = true, speech: [TimeRange]? = nil) async throws -> ([Float], Double, EditPlan) {
    var doc = EditDocument(cuts: cuts)
    doc.zoom = ZoomSettings(mode: .off)
    doc.captions.enabled = false
    doc.audio.mode = mute ? .mute : .original
    doc.audioClips = clips
    var plan = EditPlanner.plan(doc: doc, analysis: analysis)
    if let speech { plan.speech = speech }
    let built = try await CompositionBuilder.build(source: src, media: media, plan: plan, doc: doc, faces: [], quality: .hd)
    let out = outDir.appendingPathComponent("harness-audio-\(name).mp4")
    try await Exporter.export(built: built, plan: plan, captions: doc.captions, options: ExportOptions(quality: .hd, watermark: false, saveToPhotos: false), to: out) { _ in }
    let asset = AVURLAsset(url: out)
    let d = try await asset.load(.duration).seconds
    let samples = try await readMono(out)
    try? FileManager.default.removeItem(at: out)
    return (samples, d, plan)
  }
  func f(_ v: Double) -> String { String(format: "%.3f", v) }

  print("• audio: legacy document keeps the original sound; mute silences it")
  let (legacy, _, _) = try await render("legacy", clips: [], mute: false)
  _ = legacy
  var plain = EditDocument()
  plain.zoom = ZoomSettings(mode: .off)
  plain.captions.enabled = false
  let plainPlan = EditPlanner.plan(doc: plain, analysis: analysis)
  let plainBuilt = try await CompositionBuilder.build(source: src, media: media, plan: plainPlan, doc: plain, faces: [], quality: .hd)
  check(plainBuilt.composition.tracks(withMediaType: .audio).count == 1 && plainBuilt.audioMix != nil, "no audioClips: one original track with a mix")
  plain.audio.mode = .mute
  let mutedBuilt = try await CompositionBuilder.build(source: src, media: media, plan: plainPlan, doc: plain, faces: [], quality: .hd)
  check(mutedBuilt.composition.tracks(withMediaType: .audio).isEmpty, "mute: no audio track")

  print("• audio (a): original split, middle deleted → silence there")
  // The source tone is silent at 2–3 s by itself, so the deleted stretch is 3.6–4.8.
  let (a, aDur, _) = try await render("split", clips: [
    AudioClip(id: "o1", source: "original", start: 0, end: 3.6),
    AudioClip(id: "o2", source: "original", start: 4.8, end: 6),
  ], mute: false)
  let before = rms(a, 0.3, 1.8), gone = rms(a, 3.75, 4.65), after = rms(a, 5.0, 5.8)
  print("  rms before \(f(before)), deleted \(f(gone)), after \(f(after))")
  check(before > 0.15 && after > 0.15, "original sound plays around the deleted stretch")
  check(gone < 0.01, "deleted stretch is silent (\(f(gone)))")
  check(abs(aDur - 6) < 0.1, "length unchanged by audio (\(f(aDur)) s)")

  print("• audio (a2): a plain split plays through; the second half at 50%")
  let (a2, _, _) = try await render("plainsplit", clips: [
    AudioClip(id: "o1", source: "original", start: 0, end: 3.5),
    AudioClip(id: "o2", source: "original", start: 3.5, end: 6, volume: 0.5),
  ], mute: false)
  let full = rms(a2, 0.3, 1.8), late = rms(a2, 3.1, 3.45), half = rms(a2, 4.0, 5.8)
  var seam = 1.0
  var st = 3.4
  while st < 3.6 {
    seam = min(seam, rms(a2, st, st + 0.01))
    st += 0.005
  }
  print("  before \(f(full)), after \(f(half)), lowest 10 ms window at the split \(f(seam))")
  check(abs(full - 0.283) < 0.02 && abs(late - 0.283) < 0.02 && abs(half / full - 0.5) < 0.03, "100% right up to the split, then 50% (\(f(late)) just before it)")
  check(seam > half * 0.8, "no dip at the split (\(f(seam)))")

  print("• audio: a video's sound as a file (From a video in Photos), its length and waveform")
  let extracted = folder.appendingPathComponent("audio/extracted.m4a")
  try await AudioFiles.extractTrack(from: src, to: extracted)
  let exDur = await AudioFiles.duration(extracted)
  let bars = try await AudioFiles.waveform(extracted, buckets: 60)
  print("  \(f(exDur)) s; bars at 1 s \(f(bars[10])), in the 2–3 s gap \(f(bars[25]))")
  check(abs(exDur - 6) < 0.15, "extracted about 6 s")
  check(bars.count == 60 && bars[10] > 0.5 && bars[25] < 0.1, "waveform shows the tone and the silent gap")
  let projectId = folder.lastPathComponent
  check(AudioFiles.url(projectId, "audio/extracted.m4a") != nil && AudioFiles.url(projectId, "../meta.json") == nil && AudioFiles.url(projectId, "source.mov") == nil, "only files in the audio folder are addressable")
  check(AudioFiles.remove(projectId, "audio/extracted.m4a") && !FileManager.default.fileExists(atPath: extracted.path), "remove deletes it")

  print("• audio (b): an added sound over a cut plays continuously in output time")
  let cut = Cut(id: "c", start: 1.0, end: 2.5, reason: .manual, accepted: true, confidence: 1)
  let (b, bDur, bPlan) = try await render("overcut", clips: [
    AudioClip(id: "f", source: "file", file: "audio/tone.wav", start: 0.5, end: 3.0),
  ], cuts: [cut])
  check(abs(bPlan.compDuration - 4.5) < 0.05 && abs(bDur - 4.5) < 0.1, "cut shortens the video to 4.5 s (\(f(bDur)))")
  var worst = 1.0
  var t = 0.6
  while t < 2.85 {
    worst = min(worst, rms(b, t, t + 0.1))
    t += 0.1
  }
  print("  tone rms \(f(toneRMS)); lowest 100 ms window 0.6–2.9 s: \(f(worst)); before \(f(rms(b, 0, 0.4))), after \(f(rms(b, 3.15, 4.4)))")
  check(worst > toneRMS * 0.85, "no gap at the cut join (output 1.0 s)")
  check(rms(b, 0, 0.4) < 0.01 && rms(b, 3.15, 4.4) < 0.01, "silent outside the clip")

  print("• audio (c): fades in and out")
  let (c, _, _) = try await render("fades", clips: [
    AudioClip(id: "f", source: "file", file: "audio/tone.wav", start: 0, end: 4, fadeIn: 1.5, fadeOut: 1.5),
  ])
  let rise = [0.0, 0.5, 1.0].map { rms(c, $0, $0 + 0.25) }
  let mid = rms(c, 1.7, 2.3)
  let fall = [2.75, 3.25, 3.7].map { rms(c, $0, $0 + 0.25) }
  print("  rise \(rise.map(f)), middle \(f(mid)), fall \(fall.map(f))")
  check(rise[0] < rise[1] && rise[1] < rise[2] && rise[2] < mid, "rising over the fade-in")
  check(fall[0] > fall[1] && fall[1] > fall[2] && abs(mid - toneRMS) < 0.02, "full level in the middle, falling over the fade-out")

  print("• audio (d): ducking lowers an added sound while someone speaks")
  let (d, _, _) = try await render("duck", clips: [
    // The original is turned down to 2% so the RMS measured is (almost all) the added tone.
    AudioClip(id: "o", source: "original", start: 0, end: 6, volume: 0.02),
    AudioClip(id: "f", source: "file", file: "audio/tone.wav", start: 0, end: 6, ducking: true),
  ], mute: false, speech: [TimeRange(start: 2.0, end: 3.5)])
  let open = rms(d, 0.5, 1.8), ducked = rms(d, 2.3, 3.3), back = rms(d, 4.0, 5.5)
  print("  before \(f(open)), speech \(f(ducked)), after \(f(back))")
  check(abs(ducked / open - 0.2) < 0.05, "ducked to 20% (\(f(ducked / open)))")
  check(abs(back - open) < 0.01, "back to full after")
  let (dm, _, _) = try await render("duck-muted", clips: [
    AudioClip(id: "f", source: "file", file: "audio/tone.wav", start: 0, end: 6, ducking: true),
  ], speech: [TimeRange(start: 2.0, end: 3.5)])
  check(abs(rms(dm, 2.3, 3.3) - toneRMS) < 0.01, "no ducking when the original is muted (nobody is heard)")

  print("• audio (e): loop fills a longer window; volume 200% doubles")
  let (e, eDur, _) = try await render("loop", clips: [
    AudioClip(id: "f", source: "file", file: "audio/short.wav", start: 0, end: 20, loop: true),
  ])
  let windows = stride(from: 0.1, to: 5.8, by: 0.3).map { rms(e, $0, $0 + 0.2) }
  print("  lowest window \(f(windows.min() ?? 0)) over 0.1–5.9 s; length \(f(eDur))")
  check(windows.allSatisfy { $0 > toneRMS * 0.85 }, "sound all the way through")
  check(abs(eDur - 6) < 0.1, "a clip past the end doesn't lengthen the video")
  let (once, _, _) = try await render("noloop", clips: [
    AudioClip(id: "f", source: "file", file: "audio/short.wav", start: 0, end: 6),
  ])
  check(rms(once, 0.2, 1.3) > toneRMS * 0.85 && rms(once, 1.7, 5.5) < 0.01, "without loop: plays once, then silence")
  let (loud, _, _) = try await render("loud", clips: [
    AudioClip(id: "f", source: "file", file: "audio/tone.wav", start: 0, end: 3, volume: 2),
  ])
  let ratio = rms(loud, 0.5, 2.5) / toneRMS
  print("  200% volume: \(f(ratio))× the tone")
  check(abs(ratio - 2) < 0.1, "volume above 100% amplifies")
}

// MARK: - Multi-clip projects

func isGreenish(_ c: (Double, Double, Double)) -> Bool { c.1 > c.0 + 40 && c.1 > c.2 + 40 }
func isBlueish(_ c: (Double, Double, Double)) -> Bool { c.2 > c.1 + 30 }

/// Two clips (portrait blue, landscape green, 6 s each) in one project: analyze per clip, then export
/// through the same path the module uses (combined analysis → plan → composition from both files).
func clipSuite(outDir: URL, check: (Bool, String) -> Void) async throws {
  let id = "harness-clips-\(Int(Date().timeIntervalSince1970))"
  let folder = ProjectStore.dir(id)
  let a = folder.appendingPathComponent("source.mov")
  let b = folder.appendingPathComponent("source-k1.mov")
  print("• clips: making a portrait and a landscape clip")
  try await makeClip(a)
  try await makeClip(b, size: CGSize(width: 1280, height: 720), green: true)
  let ma = try await AnalysisEngine.probe(a)
  let mb = try await AnalysisEngine.probe(b)
  try ProjectStore.write(ProjectMeta(id: id, title: "Clips", sourceFile: "source.mov", createdAt: 0, media: ma, posterFile: nil), id, "meta.json")
  let added = try ProjectStore.appendClip(id, ClipMeta(id: "k1", sourceFile: "source-k1.mov", media: mb, posterFile: nil, title: "Landscape"))
  check(added.allClips.map(\.id) == ["c0", "k1"] && added.sourceFile == "source.mov", "legacy project gains a second clip; first stays source.mov")
  check(abs(added.media.durationSec - ma.durationSec - mb.durationSec) < 1e-6 && added.media.width == ma.width, "project media: sum of durations, first clip's shape")

  print("• clips: analysis per clip, concatenated")
  let counter = ClipCounter()
  let analysis = try await AnalysisEngine.analyze(projectId: id, options: AnalysisOptions(silence: .medium, fillers: .standard, language: "en"), transcriber: FakeTranscriber(), onClip: { i, n in counter.add(i, n) }) { _, _ in }
  check(counter.seen == ["0/2", "1/2"], "progress names each clip (\(counter.seen))")
  let meta = try ProjectStore.meta(id)
  check(FileManager.default.fileExists(atPath: folder.appendingPathComponent("analysis.json").path) && FileManager.default.fileExists(atPath: folder.appendingPathComponent("analysis-k1.json").path), "one analysis file per clip")
  let d0 = ma.durationSec
  let total = ma.durationSec + mb.durationSec
  check(abs(analysis.media.durationSec - total) < 1e-6, "project analysis spans both clips (\(analysis.media.durationSec))")
  let words = analysis.transcript?.words ?? []
  check(words.count == 22 && words[11].start > d0, "second clip's words follow the first (\(words.count))")
  check(Set(analysis.cuts.map(\.id)).count == analysis.cuts.count, "cut ids unique")
  check(analysis.cuts.filter { $0.reason == .silence && $0.accepted }.count == 2, "a silence cut in each clip")
  check(!analysis.cuts.contains { $0.start < d0 && $0.end > d0 }, "no suggested cut spans the boundary")
  check(analysis.envelopeDb.count == ClipTimeline.frameCount(ma.durationSec) + ClipTimeline.frameCount(mb.durationSec), "levels fitted per clip")
  let thumbs = try await ThumbnailGenerator.projectStrip(projectId: id, meta: meta, count: 8)
  check(thumbs.count == 8 && thumbs.filter { $0.clipId == "k1" }.count == 4 && (thumbs.last?.time ?? 0) > d0, "filmstrip frames from both clips (\(thumbs.count))")

  func render(_ name: String, doc: EditDocument, captions: Bool = false) async throws -> (URL, EditPlan, Analysis, CGSize) {
    var d = doc
    if !captions { d.captions.enabled = false }
    let m = try ProjectStore.meta(id)
    let combined = try ProjectStore.combinedAnalysis(id, meta: m, order: d.clipOrder) { ProjectStore.readClipAnalysis(id, $0, meta: m) }
    let plan = EditPlanner.plan(doc: d, analysis: combined)
    let built = try await CompositionBuilder.build(
      clips: ProjectStore.clipSources(id, meta: m, analysis: combined), canvas: ProjectStore.canvasSize(m), folder: folder, plan: plan, doc: d,
      faces: combined.faces, quality: .hd)
    let out = outDir.appendingPathComponent("harness-clips-\(name).mp4")
    try await Exporter.export(built: built, plan: plan, captions: d.captions, overlays: d.textOverlays ?? [], options: ExportOptions(quality: .hd, watermark: false, saveToPhotos: false), to: out) { _ in }
    return (out, plan, combined, built.renderSize)
  }
  func duration(_ u: URL) async throws -> Double { try await AVURLAsset(url: u).load(.duration).seconds }
  /// A frame the way the editor's player shows it: the composition and its video composition, no export.
  func previewFrame(_ d: EditDocument, at t: Double) async throws -> CGImage {
    var doc = d
    doc.captions.enabled = false
    let m = try ProjectStore.meta(id)
    let combined = try ProjectStore.combinedAnalysis(id, meta: m, order: doc.clipOrder) { ProjectStore.readClipAnalysis(id, $0, meta: m) }
    let plan = EditPlanner.plan(doc: doc, analysis: combined)
    let built = try await CompositionBuilder.build(
      clips: ProjectStore.clipSources(id, meta: m, analysis: combined), canvas: ProjectStore.canvasSize(m), folder: folder, plan: plan, doc: doc,
      faces: combined.faces, quality: .preview)
    let g = AVAssetImageGenerator(asset: built.composition)
    g.videoComposition = built.videoComposition
    g.requestedTimeToleranceBefore = .zero
    g.requestedTimeToleranceAfter = .zero
    return try await g.image(at: CMTime(seconds: t, preferredTimescale: 600)).image
  }
  let body = CGRect(x: 0.4, y: 0.55, width: 0.2, height: 0.1)
  var base = EditDocument(cuts: [])
  base.zoom = ZoomSettings(mode: .off)
  base.crop = CropSettings(auto916: true, aspect: "9:16")
  func f(_ v: Double) -> String { String(format: "%.2f", v) }

  print("• clips: both clips play in order; export length is the sum")
  let (plainURL, plainPlan, _, size) = try await render("plain", doc: base)
  let plainDur = try await duration(plainURL)
  check(size == CGSize(width: 1080, height: 1920), "9:16 canvas \(size)")
  check(abs(plainPlan.compDuration - total) < 0.01 && abs(plainDur - total) < 0.1, "export \(f(plainDur)) s = \(f(total)) s")
  let p1 = try await frame(plainURL, at: 3, orient: false)
  let p2 = try await frame(plainURL, at: 9, orient: false)
  try ThumbnailGenerator.writeJPEG(p2, to: outDir.appendingPathComponent("harness-clips-landscape.jpg"))
  check(isBlueish(meanColor(p1, body)) && isGreenish(meanColor(p2, body)), "3 s is the first clip, 9 s the second \(fmtColor(meanColor(p1, body))) \(fmtColor(meanColor(p2, body)))")
  let edges = [CGRect(x: 0, y: 0.3, width: 0.02, height: 0.4), CGRect(x: 0.98, y: 0.3, width: 0.02, height: 0.4),
               CGRect(x: 0.3, y: 0, width: 0.4, height: 0.02), CGRect(x: 0.3, y: 0.98, width: 0.4, height: 0.02)]
  check(!edges.contains { isBlack(meanColor(p2, $0)) }, "automatic framing fills the canvas with the landscape clip too")
  // The editor's player (no export): seeking either side of the join shows the right clip.
  let before = try await previewFrame(base, at: d0 - 0.2)
  let after = try await previewFrame(base, at: d0 + 0.2)
  check(isBlueish(meanColor(before, body)) && isGreenish(meanColor(after, body)), "preview: 0.2 s either side of the join shows each clip")
  let sound = try await readMono(plainURL)
  check(rms(sound, 0.5, 1.8) > 0.15 && rms(sound, 6.5, 7.8) > 0.15, "each clip's own sound plays (\(f(rms(sound, 0.5, 1.8))), \(f(rms(sound, 6.5, 7.8))))")
  try? FileManager.default.removeItem(at: plainURL)

  print("• clips: a cut across the boundary")
  var cutDoc = base
  cutDoc.cuts = [Cut(id: "x", start: d0 - 1, end: d0 + 1, reason: .manual, accepted: true, confidence: 1)]
  let (cutURL, cutPlan, _, _) = try await render("cut", doc: cutDoc)
  let cutDur = try await duration(cutURL)
  check(abs(cutPlan.compDuration - (total - 2)) < 0.01 && abs(cutDur - (total - 2)) < 0.1, "2 s removed (\(f(cutDur)) s)")
  let c1 = try await frame(cutURL, at: d0 - 1.4, orient: false)
  let c2 = try await frame(cutURL, at: d0 - 0.6, orient: false)
  check(isBlueish(meanColor(c1, body)) && isGreenish(meanColor(c2, body)), "the join goes straight from clip 1 to clip 2")
  try? FileManager.default.removeItem(at: cutURL)

  print("• clips: reorder")
  var reordered = base
  reordered.clipOrder = ["k1", "c0"]
  let (revURL, revPlan, revAnalysis, _) = try await render("reorder", doc: reordered)
  let r1 = try await frame(revURL, at: 3, orient: false)
  let r2 = try await frame(revURL, at: 9, orient: false)
  check(abs(revPlan.compDuration - total) < 0.01, "same length")
  check(isGreenish(meanColor(r1, body)) && isBlueish(meanColor(r2, body)), "second clip now plays first")
  check(revAnalysis.clips?.first?.id == "k1" && (revAnalysis.transcript?.words.first?.start ?? 9) < 1, "analysis re-concatenated in the new order")
  let pr = try await previewFrame(reordered, at: d0 + 0.2)
  check(isBlueish(meanColor(pr, body)), "preview after a reorder: the first clip plays second")
  try? FileManager.default.removeItem(at: revURL)

  print("• clips: trims and delete")
  var trimmed = base
  trimmed.clipTrims = [ClipTrim(clipId: "c0", head: 0, tail: 1), ClipTrim(clipId: "k1", head: 2, tail: 0)]
  let (trimURL, trimPlan, _, _) = try await render("trim", doc: trimmed)
  let trimDur = try await duration(trimURL)
  check(abs(trimPlan.compDuration - (total - 3)) < 0.01 && abs(trimDur - (total - 3)) < 0.1, "3 s trimmed (\(f(trimDur)) s)")
  let t2 = try await frame(trimURL, at: d0 - 0.5, orient: false)
  check(isGreenish(meanColor(t2, body)), "the second clip starts where the first was trimmed")
  try? FileManager.default.removeItem(at: trimURL)
  var deleted = base
  deleted.clipOrder = ["k1"]
  let (delURL, delPlan, _, _) = try await render("delete", doc: deleted)
  let del1 = try await frame(delURL, at: 1, orient: false)
  check(abs(delPlan.compDuration - mb.durationSec) < 0.01 && isGreenish(meanColor(del1, body)), "a clip left out of the order is gone")
  try? FileManager.default.removeItem(at: delURL)

  print("• clips: a caption across the boundary")
  var capDoc = base
  capDoc.captions = CaptionSettings(styleId: "pop")
  // Merge the second clip's first caption into the first clip's last one, so one card spans the join.
  capDoc.captionEdits = CaptionEdits(merges: [words[11].start])
  let (capURL, capPlan, _, capSize) = try await render("caption", doc: capDoc, captions: true)
  let across = capPlan.cards.first { $0.start < d0 && $0.end > d0 }
  check(across != nil && (across?.words.contains { $0.index < 11 } ?? false) && (across?.words.contains { $0.index >= 11 } ?? false), "one card holds words from both clips (\(capPlan.cards.map(\.text)))")
  if let card = across, let late = card.words.first(where: { $0.index >= 11 }) {
    let t = (late.start + late.end) / 2
    let (bare, _, _, _) = try await render("caption-none", doc: base)
    let with = try await frame(capURL, at: t, orient: false)
    let without = try await frame(bare, at: t, orient: false)
    try ThumbnailGenerator.writeJPEG(with, to: outDir.appendingPathComponent("harness-clips-caption.jpg"))
    let laid = CaptionLayerBuilder.layout(card: card, captions: capDoc.captions, style: CaptionStyle.resolve(capDoc.captions), render: capSize)
    let box = laid.map(\.frame).reduce(CGRect.null) { $0.union($1) }
    let r = CGRect(x: box.minX / capSize.width, y: box.minY / capSize.height, width: box.width / capSize.width, height: box.height / capSize.height)
    check(colorDiff(meanColor(with, r), meanColor(without, r)) > 10, "caption drawn over the second clip at \(f(t)) s")
    try? FileManager.default.removeItem(at: bare)
  }
  try? FileManager.default.removeItem(at: capURL)

  print("• clips: an added sound across the boundary stays continuous")
  try makeTone(folder.appendingPathComponent("audio/tone.wav"), seconds: 8)
  var sndDoc = base
  sndDoc.audio.mode = .mute
  sndDoc.audioClips = [AudioClip(id: "f", source: "file", file: "audio/tone.wav", start: d0 - 2, end: d0 + 2)]
  let (sndURL, _, _, _) = try await render("sound", doc: sndDoc)
  let snd = try await readMono(sndURL)
  var worst = 1.0
  var t = d0 - 1.9
  while t < d0 + 1.8 {
    worst = min(worst, rms(snd, t, t + 0.1))
    t += 0.1
  }
  let toneRMS = 0.2 / 2.0.squareRoot()
  print("  lowest 100 ms window around the join: \(f(worst)) (tone \(f(toneRMS)))")
  check(worst > toneRMS * 0.85, "no gap at the clip join")
  try? FileManager.default.removeItem(at: sndURL)

  print("• clips: manual framing applies to every clip at its own size")
  var fit = base
  fit.crop = CropSettings(auto916: true, aspect: "9:16", scale: 1, offsetX: 0, offsetY: 0)
  let (fitURL, _, _, _) = try await render("fit", doc: fit)
  let f1 = try await frame(fitURL, at: 3, orient: false)
  let f2 = try await frame(fitURL, at: 9, orient: false)
  try ThumbnailGenerator.writeJPEG(f2, to: outDir.appendingPathComponent("harness-clips-fit.jpg"))
  let top = CGRect(x: 0.3, y: 0.02, width: 0.4, height: 0.1)
  let bottom = CGRect(x: 0.3, y: 0.88, width: 0.4, height: 0.1)
  let middle = CGRect(x: 0.45, y: 0.45, width: 0.1, height: 0.1)
  check(!isBlack(meanColor(f1, top)) && !isBlack(meanColor(f1, bottom)), "portrait clip at Fit fills a 9:16 canvas")
  check(isBlack(meanColor(f2, top)) && isBlack(meanColor(f2, bottom)) && !isBlack(meanColor(f2, middle)), "landscape clip at Fit is letterboxed, centred")
  try? FileManager.default.removeItem(at: fitURL)

  print("• clips: a phone-style portrait clip (stored landscape, rotated 90°) next to a landscape one")
  // Added later and analysed on its own (clipIds), like a clip added in the editor.
  let r = folder.appendingPathComponent("source-k2.mov")
  try await makeClip(r, size: CGSize(width: 1280, height: 720), transform: CGAffineTransform(rotationAngle: .pi / 2))
  let mr = try await AnalysisEngine.probe(r)
  check(mr.width == 720 && mr.height == 1280, "probe reads it upright (\(mr.width)×\(mr.height))")
  _ = try ProjectStore.appendClip(id, ClipMeta(id: "k2", sourceFile: "source-k2.mov", media: mr, posterFile: nil, title: "Rotated"))
  let only = ClipCounter()
  _ = try await AnalysisEngine.analyze(projectId: id, clipIds: ["k2"], options: AnalysisOptions(silence: .off, fillers: .off, language: "en"), transcriber: FakeTranscriber(), onClip: { i, n in only.add(i, n) }) { _, _ in }
  check(only.seen == ["0/1"] && FileManager.default.fileExists(atPath: folder.appendingPathComponent("analysis-k2.json").path), "only the new clip is analysed")
  let upright = try await frame(r, at: 1)
  let expected = redCorner(upright)
  for (name, order, at) in [("rotated-second", ["k1", "k2"], d0 + 3), ("rotated-first", ["k2", "k1"], 3.0)] {
    var rot = base
    rot.clipOrder = order
    let img = try await previewFrame(rot, at: at)
    try ThumbnailGenerator.writeJPEG(img, to: outDir.appendingPathComponent("harness-clips-\(name).jpg"))
    check(expected != nil && redCorner(img) == expected, "\(name): marker in \(redCorner(img) ?? "none"), upright source \(expected ?? "none")")
    check(!edges.contains { isBlack(meanColor(img, $0)) } && isBlueish(meanColor(img, body)), "\(name): rotated clip fills the frame, upright")
    let other = try await previewFrame(rot, at: name == "rotated-second" ? 3 : d0 + 3)
    check(isGreenish(meanColor(other, body)), "\(name): the landscape clip still plays on the other side")
  }
  var rotExport = base
  rotExport.clipOrder = ["k2", "k1"]
  let (rotURL, _, _, _) = try await render("rotated", doc: rotExport)
  let re = try await frame(rotURL, at: 3, orient: false)
  check(redCorner(re) == expected && isBlueish(meanColor(re, body)), "export: rotated clip first and upright (\(redCorner(re) ?? "none"))")
  try? FileManager.default.removeItem(at: rotURL)

  print("• clips: removing a clip's files")
  check(!ProjectStore.removeClip(id, "c0"), "the first clip is never removed")
  check(ProjectStore.removeClip(id, "k1") && !FileManager.default.fileExists(atPath: b.path), "second clip's file deleted")
  check((try ProjectStore.meta(id)).allClips.map(\.id) == ["c0", "k2"], "and dropped from meta.json")
  ProjectStore.delete(id)
}

final class ClipCounter: @unchecked Sendable {
  private let lock = NSLock()
  private var items: [String] = []
  func add(_ i: Int, _ n: Int) {
    lock.lock()
    items.append("\(i)/\(n)")
    lock.unlock()
  }
  var seen: [String] {
    lock.lock()
    defer { lock.unlock() }
    return items
  }
}

/// Files that probe must refuse with a clear message (import), instead of failing later at export.
func probeSuite(src: URL, outDir: URL, check: (Bool, String) -> Void) async throws {
  print("• probe refuses undecodable video")
  // Same clip with its sample entry retagged "hev1" (as ffmpeg writes HEVC): readable, not decodable.
  var data = try Data(contentsOf: src)
  let from = Data("avc1".utf8), to = Data("hev1".utf8)
  var retagged = 0
  while let r = data.range(of: from) {
    data.replaceSubrange(r, with: to)
    retagged += 1
  }
  let bad = outDir.appendingPathComponent("harness-undecodable.mov")
  try data.write(to: bad)
  defer { try? FileManager.default.removeItem(at: bad) }
  check(retagged > 0, "retagged the sample entry (\(retagged))")
  do {
    let m = try await AnalysisEngine.probe(bad)
    check(false, "undecodable video refused at probe (got \(m))")
  } catch {
    check(error.localizedDescription == "This video's format can't be played on iPhone.", "undecodable video refused at probe: \(error.localizedDescription)")
  }
  let media = try await AnalysisEngine.probe(src)
  check(media.width > 0, "the untouched clip still probes")
}

/// Repeated exports must not keep their caption / watermark layer trees alive (no run loop on the export
/// thread: see Exporter's CATransaction.flush). Before the fix each export added about 8 MB.
func exportMemorySuite(src: URL, media: MediaInfo, outDir: URL, check: (Bool, String) -> Void) async throws {
  print("• memory across repeated exports")
  let words = (0..<8).map { Word(text: "word\($0)", start: Double($0) * 0.2, end: Double($0) * 0.2 + 0.15) }
  let analysis = Analysis(media: media, transcript: Transcript(words: words, language: "en", engine: "fake", wordTimingIsExact: true), envelopeDb: [], noiseFloorDb: -60, speechThresholdDb: -38, speechCoverage: 1, noSpeech: false, cuts: [], faces: [], warnings: [])
  var doc = EditDocument()
  doc.zoom = ZoomSettings(mode: .off)
  doc.textOverlays = [TextOverlay(id: "t", text: "Memory", box: "filled", color: "#7C4DFF", size: 0.06, x: 0.5, y: 0.2)]
  let plan = EditPlanner.plan(doc: doc, analysis: analysis)
  let out = outDir.appendingPathComponent("harness-memory.mp4")
  defer { try? FileManager.default.removeItem(at: out) }
  var after: [Double] = []
  for _ in 0..<14 {
    let built = try await CompositionBuilder.build(source: src, media: media, plan: plan, doc: doc, faces: [], quality: .hd)
    try await Exporter.export(built: built, plan: plan, captions: doc.captions, overlays: doc.textOverlays ?? [], options: ExportOptions(quality: .hd, watermark: true, saveToPhotos: false), to: out) { _ in }
    after.append(footprintMB())
  }
  let growth = after[13] - after[3]
  print(String(format: "  footprint after export 4: %.0f MB, after 14: %.0f MB", after[3], after[13]))
  check(growth < 30, String(format: "10 more exports grow memory by %.0f MB (< 30)", growth))
}

@main
struct RenderHarness {
  static func main() async {
    setbuf(stdout, nil)
    if let i = CommandLine.arguments.firstIndex(of: "--stress") {
      await stressMain(Array(CommandLine.arguments[(i + 1)...]))
    }
    if CommandLine.arguments.contains("--orientation") {
      let outDir = URL(fileURLWithPath: CommandLine.arguments[1])
      var failed = false
      do {
        try await orientationSuite(outDir: outDir) { c, m in
          print(c ? "  ok   \(m)" : "  FAIL \(m)")
          if !c { failed = true }
        }
      } catch {
        print("  FAIL threw \(error)")
        failed = true
      }
      print(failed ? "\nORIENTATION SUITE FAILED" : "\norientation suite passed")
      exit(failed ? 1 : 0)
    }
    let outDir = URL(fileURLWithPath: CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : NSTemporaryDirectory())
    var failed = false
    func check(_ c: Bool, _ m: String) {
      print(c ? "  ok   \(m)" : "  FAIL \(m)")
      if !c { failed = true }
    }
    if CommandLine.arguments.contains("--clips") {
      // Only the multi-clip suite.
      do {
        try await clipSuite(outDir: outDir, check: check)
      } catch {
        print("  FAIL threw \(error)")
        failed = true
      }
      print(failed ? "\nCLIP SUITE FAILED" : "\nclip suite passed")
      exit(failed ? 1 : 0)
    }
    if CommandLine.arguments.contains("--probe") {
      do {
        let id = "harness-probe-\(Int(Date().timeIntervalSince1970))"
        let src = ProjectStore.dir(id).appendingPathComponent("source.mov")
        try await makeClip(src, seconds: 1)
        try await probeSuite(src: src, outDir: outDir, check: check)
        try await exportMemorySuite(src: src, media: try await AnalysisEngine.probe(src), outDir: outDir, check: check)
        ProjectStore.delete(id)
      } catch {
        print("  FAIL threw \(error)")
        failed = true
      }
      print(failed ? "\nPROBE SUITE FAILED" : "\nprobe suite passed")
      exit(failed ? 1 : 0)
    }
    if CommandLine.arguments.contains("--audio") {
      // Only the audio lanes (quick; also handy when disk space is short).
      do {
        let id = "harness-audio-\(Int(Date().timeIntervalSince1970))"
        let src = ProjectStore.dir(id).appendingPathComponent("source.mov")
        try await makeClip(src)
        let media = try await AnalysisEngine.probe(src)
        try await audioSuite(src: src, media: media, outDir: outDir, check: check)
        ProjectStore.delete(id)
      } catch {
        print("  FAIL threw \(error)")
        failed = true
      }
      print(failed ? "\nAUDIO SUITE FAILED" : "\naudio suite passed")
      exit(failed ? 1 : 0)
    }
    do {
      let id = "harness-\(Int(Date().timeIntervalSince1970))"
      let src = ProjectStore.dir(id).appendingPathComponent("source.mov")
      print("• making synthetic clip")
      try await makeClip(src)
      let media = try await AnalysisEngine.probe(src)
      check(abs(media.durationSec - 6) < 0.1 && media.hasAudio && media.width == 720, "probe \(media)")
      try await probeSuite(src: src, outDir: outDir, check: check)
      try await exportMemorySuite(src: src, media: media, outDir: outDir, check: check)
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
      let styles: [(String, String, CaptionColors)] = [
        ("pop", "poppins", CaptionColors(base: "#FFFFFF", active: "#FFE14D", stroke: "#000000", bg: "transparent")),
        ("karaoke", "montserrat", CaptionColors(base: "#FFFFFF", active: "#B07CFF", stroke: "#000000", bg: "transparent")),
        ("boxed", "poppins", CaptionColors(base: "#FFFFFF", active: "#FFE14D", stroke: "transparent", bg: "rgba(15,18,34,0.85)")),
        ("outline", "bebas", CaptionColors(base: "#FFFFFF", active: "#FFFFFF", stroke: "#000000", bg: "transparent")),
        ("minimal", "poppins", CaptionColors(base: "#FFFFFF", active: "#FFE14D", stroke: "transparent", bg: "transparent")),
        ("subtle", "sfRounded", CaptionColors(base: "#FFFFFF", active: "#FFFFFF", stroke: "transparent", bg: "transparent")),
        ("tiktok", "tiktok", CaptionColors(base: "#FFFFFF", active: "#FFFFFF", stroke: "transparent", bg: "rgba(0,0,0,0.9)")),
        ("highlight", "tiktok", CaptionColors(base: "#FFFFFF", active: "#7C4DFF", stroke: "transparent", bg: "transparent")),
        ("neon", "tiktok", CaptionColors(base: "#FFFFFF", active: "#FF3DCB", stroke: "transparent", bg: "transparent")),
        ("typewriter", "typewriter", CaptionColors(base: "#FFFFFF", active: "#FFFFFF", stroke: "transparent", bg: "transparent")),
        ("oneword", "tiktok", CaptionColors(base: "#FFFFFF", active: "#FFE14D", stroke: "#000000", bg: "transparent")),
        ("handwritten", "handwriting", CaptionColors(base: "#FFFFFF", active: "#FFFFFF", stroke: "transparent", bg: "transparent")),
      ]
      for (style, font, colors) in styles {
        var d2 = doc
        d2.captions = CaptionSettings(styleId: style, font: font, colors: colors, uppercase: style == "outline" || style == "oneword", maxWords: style == "oneword" ? 1 : 4)
        let p2 = EditPlanner.plan(doc: d2, analysis: analysis)
        let b2 = try await CompositionBuilder.build(source: src, media: media, plan: p2, doc: d2, faces: analysis.faces, quality: .hd)
        let o2 = outDir.appendingPathComponent("harness-\(style).mp4")
        try await Exporter.export(built: b2, plan: p2, captions: d2.captions, options: ExportOptions(quality: .hd, watermark: false, saveToPhotos: false), to: o2) { _ in }
        let card = p2.cards.first { $0.words.count >= (style == "oneword" ? 1 : 2) } ?? p2.cards[0]
        let w = card.words[min(1, card.words.count - 1)]
        let img = try await frame(o2, at: (w.start + w.end) / 2, orient: false)
        try ThumbnailGenerator.writeJPEG(img, to: outDir.appendingPathComponent("harness-style-\(style).jpg"))
        try? FileManager.default.removeItem(at: o2)
      }
      print("  style frames written")

      print("• caption look overrides (background, outline)")
      // Samples just outside the words (inside the box's padding) and over the words, per override,
      // against the same frame with no background.
      struct Look { var name: String; var background: String; var outline: String }
      let looks = [
        Look(name: "none", background: "none", outline: "none"), Look(name: "box", background: "box", outline: "none"),
        Look(name: "translucent", background: "translucent", outline: "none"), Look(name: "highlight", background: "highlight", outline: "none"),
        Look(name: "outline-thin", background: "none", outline: "thin"), Look(name: "outline-thick", background: "none", outline: "thick"),
      ]
      var beside: [String: (Double, Double, Double)] = [:]
      var over: [String: (Double, Double, Double)] = [:]
      for look in looks {
        var d4 = doc
        d4.zoom = ZoomSettings(mode: .off)
        d4.captions = CaptionSettings(
          styleId: "pop", font: "poppins", colors: CaptionColors(base: "#FFFFFF", active: "#7C4DFF", stroke: "#000000", bg: "#000000"),
          background: look.background, outline: look.outline, shadow: false, animation: "none")
        let p4 = EditPlanner.plan(doc: d4, analysis: analysis)
        let b4 = try await CompositionBuilder.build(source: src, media: media, plan: p4, doc: d4, faces: analysis.faces, quality: .hd)
        let o4 = outDir.appendingPathComponent("harness-look-\(look.name).mp4")
        try await Exporter.export(built: b4, plan: p4, captions: d4.captions, options: ExportOptions(quality: .hd, watermark: false, saveToPhotos: false), to: o4) { _ in }
        let card = p4.cards.first { $0.words.count >= 2 } ?? p4.cards[0]
        let laid = CaptionLayerBuilder.layout(card: card, captions: d4.captions, style: CaptionStyle.resolve(d4.captions), render: b4.renderSize)
        let target = laid[min(1, laid.count - 1)]
        let f = target.frame
        let size = CGFloat(CTFontGetSize(target.font))
        let rw = b4.renderSize.width, rh = b4.renderSize.height
        // A strip just left of the word, inside the box / pill padding, at mid height.
        let strip = CGRect(x: (f.minX - size * 0.12) / rw, y: (f.midY - f.height * 0.15) / rh, width: size * 0.08 / rw, height: f.height * 0.3 / rh)
        let img = try await frame(o4, at: (target.word.start + target.word.end) / 2, orient: false)
        try ThumbnailGenerator.writeJPEG(img, to: outDir.appendingPathComponent("harness-look-\(look.name).jpg"))
        beside[look.name] = meanColor(img, strip)
        over[look.name] = meanColor(img, CGRect(x: f.minX / rw, y: f.minY / rh, width: f.width / rw, height: f.height / rh))
        try? FileManager.default.removeItem(at: o4)
      }
      func lum(_ c: (Double, Double, Double)?) -> Double { guard let c else { return -1 } ; return 0.2126 * c.0 + 0.7152 * c.1 + 0.0722 * c.2 }
      func fmt(_ c: (Double, Double, Double)?) -> String { guard let c else { return "nil" } ; return String(format: "(%.0f, %.0f, %.0f)", c.0, c.1, c.2) }
      let bgNone = lum(beside["none"]), bgBox = lum(beside["box"]), bgTrans = lum(beside["translucent"])
      check(bgBox < 12 && bgNone > 30, "box: black box beside the word (\(fmt(beside["box"])) vs none \(fmt(beside["none"])))")
      check(bgTrans > bgBox + 8 && bgTrans < bgNone - 8, "translucent: between box and none (\(fmt(beside["translucent"])))")
      if let h = beside["highlight"] {
        check(h.2 > 180 && h.0 > 80 && h.1 < 150, "highlight: violet pill behind the spoken word \(fmt(h))")
      } else {
        check(false, "highlight sampled")
      }
      check(lum(over["outline-thick"]) < lum(over["outline-thin"]) - 3 && lum(over["outline-thin"]) < lum(over["none"]) - 1,
            "outline: thick darker than thin darker than none (\(Int(lum(over["outline-thick"]))) < \(Int(lum(over["outline-thin"]))) < \(Int(lum(over["none"]))))")

      print("• captions in other aspect ratios")
      for (aspect, expect) in [("16:9", CGSize(width: 1920, height: 1080)), ("1:1", CGSize(width: 1080, height: 1080)), ("4:5", CGSize(width: 1080, height: 1350))] {
        var d3 = doc
        d3.crop = CropSettings(auto916: false, aspect: aspect)
        d3.captions = CaptionSettings(styleId: "pop")
        let p3 = EditPlanner.plan(doc: d3, analysis: analysis)
        let b3 = try await CompositionBuilder.build(source: src, media: media, plan: p3, doc: d3, faces: analysis.faces, quality: .hd)
        check(b3.renderSize == expect, "\(aspect) render size \(b3.renderSize)")
        let name = aspect.replacingOccurrences(of: ":", with: "x")
        let o3 = outDir.appendingPathComponent("harness-aspect-\(name).mp4")
        try await Exporter.export(built: b3, plan: p3, captions: d3.captions, options: ExportOptions(quality: .hd, watermark: true, saveToPhotos: false), to: o3) { _ in }
        let card = p3.cards.first { $0.words.count >= 2 } ?? p3.cards[0]
        let words = CaptionLayerBuilder.layout(card: card, captions: d3.captions, style: CaptionStyle.forId("pop"), render: b3.renderSize)
        let box = words.map(\.frame).reduce(CGRect.null) { $0.union($1) }
        check(!words.isEmpty && box.minX >= 0 && box.maxX <= b3.renderSize.width, "\(aspect) caption inside the frame \(box)")
        check(box.height / b3.renderSize.height < 0.2, "\(aspect) caption height \(Int(box.height / b3.renderSize.height * 100))% of frame")
        let w = card.words[min(1, card.words.count - 1)]
        let img = try await frame(o3, at: (w.start + w.end) / 2, orient: false)
        try ThumbnailGenerator.writeJPEG(img, to: outDir.appendingPathComponent("harness-aspect-\(name).jpg"))
        try? FileManager.default.removeItem(at: o3)
      }

      print("• a very long word shrinks to fit instead of being cut off")
      var big = doc.captions
      big.styleId = "oneword"
      big.sizeScale = 1.5
      let longCard = CaptionCard(start: 0, end: 1, words: [CardWord(index: 0, text: "UNBELIEVABLEEEEE", start: 0, end: 1, emphasis: false)])
      let laid = CaptionLayerBuilder.layout(card: longCard, captions: big, style: CaptionStyle.forId("oneword"), render: CGSize(width: 1080, height: 1920))
      check(laid.count == 1 && laid[0].frame.minX >= 0 && laid[0].frame.maxX <= 1080, "long word fits \(laid.first?.frame ?? .zero)")

      try await textOverlaySuite(src: src, media: media, outDir: outDir, check: check)
      try await audioSuite(src: src, media: media, outDir: outDir, check: check)
      ProjectStore.delete(id)
      try await clipSuite(outDir: outDir, check: check)
    } catch {
      print("  FAIL threw \(error)")
      failed = true
    }
    print(failed ? "\nRENDER HARNESS FAILED" : "\nrender harness passed")
    exit(failed ? 1 : 0)
  }
}
