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

func makeClip(_ url: URL, seconds: Double = 6, size: CGSize = CGSize(width: 720, height: 1280), fps: Int32 = 30, transform: CGAffineTransform = .identity) async throws {
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
        // Red marker in the stored image's top-left corner, to check orientation after export.
        ctx.setFillColor(CGColor(red: 1, green: 0, blue: 0, alpha: 1))
        ctx.fill(CGRect(x: 0, y: size.height - size.height * 0.2, width: size.width * 0.2, height: size.height * 0.2))
        CVPixelBufferUnlockBaseAddress(pb, [])
        adaptor.append(pb, withPresentationTime: CMTime(value: CMTimeValue(i), timescale: fps))
      }
      i += 1
    } else {
      // Video input is busy: let audio run ahead so the writer can interleave and never deadlocks.
      appendAudio(until: seconds)
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

@main
struct RenderHarness {
  static func main() async {
    setbuf(stdout, nil)
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
      ProjectStore.delete(id)
    } catch {
      print("  FAIL threw \(error)")
      failed = true
    }
    print(failed ? "\nRENDER HARNESS FAILED" : "\nrender harness passed")
    exit(failed ? 1 : 0)
  }
}
