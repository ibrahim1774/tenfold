import AVFoundation
import CoreGraphics

public enum RenderQuality: String, Codable, Sendable {
  case preview, hd, uhd
}

public struct BuiltComposition {
  public let composition: AVMutableComposition
  /// No animation tool; the preview player item uses this directly. Export copies it and adds the tool.
  public let videoComposition: AVMutableVideoComposition
  public let audioMix: AVMutableAudioMix?
  public let renderSize: CGSize
}

/// Cuts + orientation + crop + zoom as one deterministic composition (spec §4.11).
/// Zoom and crop are applied as layer-instruction transforms, so the preview player item and the
/// export share exactly the same pixels.
public enum CompositionBuilder {
  static func time(_ s: Double) -> CMTime { CMTime(seconds: s, preferredTimescale: 600) }

  /// Short side 1080 (or 2160), long side from the chosen aspect ratio or the source's own shape.
  public static func renderSize(media: MediaInfo, crop: CropSettings, quality: RenderQuality) -> CGSize {
    let short: Double = quality == .uhd ? 2160 : 1080
    func even(_ v: Double) -> Double { (v / 2).rounded() * 2 }
    if let r = crop.ratio {
      return r < 1 ? CGSize(width: short, height: even(short / r)) : CGSize(width: even(short * r), height: short)
    }
    let w = media.width, h = media.height
    guard w > 0, h > 0 else { return CGSize(width: 1080, height: 1920) }
    let k = short / min(w, h)
    return CGSize(width: even(w * k), height: even(h * k))
  }

  /// One clip of a project: its file and where it sits on the project source timeline (ClipTimeline).
  public struct ClipSource: Sendable {
    public var id: String
    public var url: URL
    public var start: Double
    public var duration: Double
    public init(id: String, url: URL, start: Double, duration: Double) {
      self.id = id
      self.url = url
      self.start = start
      self.duration = duration
    }
  }

  /// A clip's file, loaded, with how its frames map onto the canvas.
  struct Loaded {
    var source: ClipSource
    /// Held so the tracks stay valid (an asset track doesn't keep its asset alive).
    var asset: AVURLAsset
    var video: AVAssetTrack
    var audio: AVAssetTrack?
    var audioEnd: CMTime
    var duration: CMTime
    var fps: Float
    /// Display (orientation-corrected) size and the transform natural → display.
    var display: CGSize
    var orient: CGAffineTransform
  }

  /// A stretch of one clip placed on the composition: kept segment `segment`, `segFrom` seconds into it.
  struct Piece {
    var segment: Int
    var clip: Int
    var segFrom: Double
    var local: CMTime
    var comp: CMTimeRange
  }

  static func load(_ c: ClipSource) async throws -> Loaded {
    let asset = AVURLAsset(url: c.url, options: [AVURLAssetPreferPreciseDurationAndTimingKey: true])
    guard let v = try await asset.loadTracks(withMediaType: .video).first else {
      throw EngineError.message("This clip has no video track.")
    }
    let a = try await asset.loadTracks(withMediaType: .audio).first
    let (natural, preferred, fps) = try await v.load(.naturalSize, .preferredTransform, .nominalFrameRate)
    let duration = try await asset.load(.duration)
    var audioEnd = CMTime.zero
    if let a {
      let r = try await a.load(.timeRange)
      audioEnd = r.end
    }
    // Orientation: preferredTransform maps natural → display (may include a translation).
    let rect = CGRect(origin: .zero, size: natural).applying(preferred)
    let display = CGSize(width: abs(rect.width), height: abs(rect.height))
    let orient = preferred.concatenating(CGAffineTransform(translationX: -rect.minX, y: -rect.minY))
    return Loaded(source: c, asset: asset, video: v, audio: a, audioEnd: audioEnd, duration: duration, fps: fps, display: display, orient: orient)
  }

  /// One video file (a project saved before multi-clip projects, and the harness).
  public static func build(source: URL, media: MediaInfo, plan: EditPlan, doc: EditDocument, faces: [FacePoint], quality: RenderQuality, keepHDR: Bool = false) async throws -> BuiltComposition {
    let clip = ClipSource(id: ClipTimeline.legacyClipId, url: source, start: 0, duration: media.durationSec)
    return try await build(clips: [clip], canvas: nil, folder: source.deletingLastPathComponent(), plan: plan, doc: doc, faces: faces, quality: quality, keepHDR: keepHDR)
  }

  /// The clips in play order, cut by the plan (which runs over the clips concatenated). `canvas` is the
  /// project's shape for the "original" aspect (its first clip); nil = the first clip here. `folder` is the
  /// project folder (added sounds live in it).
  public static func build(
    clips: [ClipSource], canvas: CGSize?, folder: URL, plan: EditPlan, doc: EditDocument, faces: [FacePoint], quality: RenderQuality,
    keepHDR: Bool = false
  ) async throws -> BuiltComposition {
    guard !clips.isEmpty else { throw EngineError.message("This video has no clips.") }
    var loaded: [Loaded] = []
    for c in clips { loaded.append(try await load(c)) }

    let composition = AVMutableComposition()
    guard let video = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid) else {
      throw EngineError.message("Couldn't create the video track.")
    }
    // Each kept segment, split where it crosses from one clip into the next. Pieces record where they
    // landed so the original sound is placed on exactly the same CMTimes as the picture.
    var pieces: [Piece] = []
    var cursor = CMTime.zero
    for (i, seg) in plan.segments.enumerated() {
      for (k, c) in loaded.enumerated() {
        let clipStart = c.source.start
        let clipEnd = c.source.start + c.source.duration
        let a = max(seg.start, clipStart)
        let b = min(seg.end, clipEnd)
        guard b - a > 0.0005 else { continue }
        let localStart = time(a - clipStart)
        var localEnd = time(b - clipStart)
        if CMTimeCompare(localEnd, c.duration) > 0 { localEnd = c.duration }
        guard CMTimeCompare(localEnd, localStart) > 0 else { continue }
        let range = CMTimeRange(start: localStart, end: localEnd)
        try video.insertTimeRange(range, of: c.video, at: cursor)
        pieces.append(Piece(segment: i, clip: k, segFrom: a - seg.start, local: localStart, comp: CMTimeRange(start: cursor, duration: range.duration)))
        cursor = CMTimeAdd(cursor, range.duration)
      }
    }
    let total = composition.duration
    guard CMTimeCompare(total, .zero) > 0 else { throw EngineError.message("Nothing left after cuts.") }
    let mix = try await buildAudio(composition: composition, folder: folder, loaded: loaded, pieces: pieces, plan: plan, doc: doc, total: total)

    let first = loaded[0]
    let shape = canvas ?? first.display
    let render = renderSize(media: MediaInfo(durationSec: plan.compDuration, width: shape.width, height: shape.height, fps: Double(first.fps), isHDR: false, hasAudio: false), crop: doc.crop, quality: quality)
    let manual = doc.crop.isManual

    // Per clip: how its frames fill the canvas (automatic framing) or where the user placed them (manual,
    // the same placement for every clip, each at its own size).
    struct Geometry {
      var display: CGSize
      var orient: CGAffineTransform
      var fill: CGFloat
      var placed: Framing.Placement
      var needsPan: Bool
    }
    var geos: [Geometry] = []
    for c in loaded {
      let d = c.display
      let fill = max(render.width / d.width, render.height / d.height)
      let placed = Framing.place(crop: doc.crop, canvasW: Double(render.width), canvasH: Double(render.height), videoW: Double(d.width), videoH: Double(d.height))
      let shapeGap = abs(d.width / d.height - render.width / render.height)
      geos.append(Geometry(display: d, orient: c.orient, fill: fill, placed: placed, needsPan: !manual && shapeGap > 0.02))
    }

    func transform(_ g: Geometry, zoom: Double, focusX: Double, focusY: Double) -> CGAffineTransform {
      let fill = g.fill
      let display = g.display
      let s = fill * CGFloat(zoom)
      let fx = CGFloat(focusX) * display.width, fy = CGFloat(focusY) * display.height
      // Base placement centres the focus point (clamped so the frame stays covered), then zoom keeps it fixed.
      var bx = render.width / 2 - fx * fill, by = render.height / 2 - fy * fill
      bx = min(0, max(render.width - display.width * fill, bx))
      by = min(0, max(render.height - display.height * fill, by))
      let px = fx * fill + bx, py = fy * fill + by
      var tx = px - fx * s, ty = py - fy * s
      tx = min(0, max(render.width - display.width * s, tx))
      ty = min(0, max(render.height - display.height * s, ty))
      return g.orient.concatenating(CGAffineTransform(scaleX: s, y: s)).concatenating(CGAffineTransform(translationX: tx, y: ty))
    }

    // Manual placement (the user pinched / dragged, or picked a ratio): the video sits where they put it,
    // black shows where it doesn't reach, and punch-ins scale about their anchor. No automatic panning.
    func manualTransform(_ g: Geometry, zoom: Double, anchorX: Double, anchorY: Double) -> CGAffineTransform {
      let placed = g.placed
      let px = placed.originX + anchorX * placed.videoW
      let py = placed.originY + anchorY * placed.videoH
      let s = CGFloat(placed.pixelScale * zoom)
      let tx = CGFloat(px + zoom * (placed.originX - px))
      let ty = CGFloat(py + zoom * (placed.originY - py))
      return g.orient.concatenating(CGAffineTransform(scaleX: s, y: s)).concatenating(CGAffineTransform(translationX: tx, y: ty))
    }

    /// The clip on screen at composition time t.
    func clipAt(_ t: Double) -> Int {
      var k = pieces.first?.clip ?? 0
      for p in pieces {
        if p.comp.start.seconds <= t + 1e-6 { k = p.clip } else { break }
      }
      return k
    }

    // Keyframes: zoom events, face-follow pans every second (when the frame is reframed automatically),
    // and an instant change wherever the picture moves to another clip, so no ramp ever spans two clips.
    let anyPan = geos.contains { $0.needsPan }
    let follow = !manual && doc.zoom.faceFollow && !faces.isEmpty
    struct Key { var t: Double; var ramp: Double }
    var raw = plan.zoom.map { Key(t: $0.at, ramp: $0.ramp) }
    if follow && anyPan {
      var t = 1.0
      while t < plan.compDuration {
        raw.append(Key(t: t, ramp: 0.8))
        t += 1
      }
    }
    for i in pieces.indices.dropFirst() where pieces[i].clip != pieces[i - 1].clip {
      raw.append(Key(t: pieces[i].comp.start.seconds, ramp: 0))
    }
    raw.append(Key(t: 0, ramp: 0))
    raw.sort { $0.t < $1.t }
    // Strictly increasing times; where two keys meet, the instant one wins.
    var keys: [Key] = []
    for k in raw {
      if let last = keys.last, k.t - last.t < 1e-4 {
        keys[keys.count - 1].ramp = min(last.ramp, k.ramp)
      } else {
        keys.append(k)
      }
    }

    func state(_ t: Double) -> CGAffineTransform {
      let g = geos[clipAt(t)]
      let e = plan.zoom.last(where: { $0.at <= t + 1e-6 })
      let z = e?.scale ?? 1
      if manual {
        return manualTransform(g, zoom: z, anchorX: z > 1 ? (e?.anchorX ?? 0.5) : 0.5, anchorY: z > 1 ? (e?.anchorY ?? 0.5) : 0.5)
      }
      var fx = 0.5, fy = g.needsPan ? 0.42 : 0.5
      if follow, let f = FaceTrackSmoother.face(at: sourceTime(plan.segments, t), in: faces) {
        fx = f.x
        fy = f.y
      } else if let e, z > 1 {
        fx = e.anchorX
        fy = e.anchorY
      }
      return transform(g, zoom: z, focusX: fx, focusY: fy)
    }

    let layer = AVMutableVideoCompositionLayerInstruction(assetTrack: video)
    var previous = state(0)
    layer.setTransform(previous, at: .zero)
    for (i, k) in keys.enumerated() where k.t > 0 {
      let next = state(k.t)
      let limit = i + 1 < keys.count ? keys[i + 1].t : plan.compDuration
      let ramp = min(k.ramp, max(0, limit - k.t))
      if ramp > 0.02 {
        layer.setTransformRamp(fromStart: previous, toEnd: next, timeRange: CMTimeRange(start: time(k.t), duration: time(ramp)))
      } else {
        layer.setTransform(next, at: time(k.t))
      }
      previous = next
    }

    let instruction = AVMutableVideoCompositionInstruction()
    instruction.timeRange = CMTimeRange(start: .zero, duration: total)
    instruction.layerInstructions = [layer]
    instruction.backgroundColor = ColorParser.black

    let vc = AVMutableVideoComposition()
    vc.instructions = [instruction]
    vc.renderSize = render
    let fps = first.fps
    let rate = fps > 1 ? min(60, max(24, Double(fps).rounded())) : 30
    vc.frameDuration = CMTime(value: 1, timescale: CMTimeScale(rate))
    vc.renderScale = 1
    if !keepHDR {
      // Captions are drawn by Core Animation, which isn't colour managed over HDR (spec §4.11).
      vc.colorPrimaries = AVVideoColorPrimaries_ITU_R_709_2
      vc.colorTransferFunction = AVVideoTransferFunction_ITU_R_709_2
      vc.colorYCbCrMatrix = AVVideoYCbCrMatrix_ITU_R_709_2
    }

    return BuiltComposition(composition: composition, videoComposition: vc, audioMix: mix, renderSize: render)
  }

  /// Audio tracks for the document's audio clips (AudioPlanner) and the mix that sets their volume curves.
  /// One track holds every original clip (they never overlap), taking each piece from the video clip it
  /// plays over; each added sound gets a track of its own. Nothing is ever placed past `total`, so the
  /// video alone decides the output's length.
  static func buildAudio(
    composition: AVMutableComposition, folder: URL, loaded: [Loaded], pieces: [Piece], plan: EditPlan, doc: EditDocument,
    total: CMTime
  ) async throws -> AVMutableAudioMix? {
    let clips = AudioPlanner.clips(doc: doc, compDuration: min(plan.compDuration, total.seconds))
    let anySound = loaded.contains { $0.audio != nil }
    let originals = anySound ? clips.filter(\.isOriginal) : []
    var inputs: [AVMutableAudioMixInputParameters] = []

    if !originals.isEmpty, let track = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid) {
      var trackEnd = CMTime.zero
      var curve: [GainPoint] = []
      // Cut boundaries and joins between clips get a 10 ms dip so the join doesn't click.
      let joins = pieces.map { $0.comp.start.seconds }.filter { $0 > 0 }
      for clip in originals {
        var any = false
        for op in AudioPlanner.originalPieces(clip: clip, segments: plan.segments) {
          for vp in pieces where vp.segment == op.segment {
            guard let srcAudio = loaded[vp.clip].audio else { continue }
            let vpFrom = vp.segFrom
            let vpTo = vp.segFrom + vp.comp.duration.seconds
            let a = max(op.from, vpFrom)
            let b = min(op.to, vpTo)
            guard b - a > 1e-6 else { continue }
            let at = CMTimeAdd(vp.comp.start, time(a - vpFrom))
            var end = CMTimeMinimum(CMTimeAdd(vp.comp.start, time(b - vpFrom)), vp.comp.end)
            end = CMTimeMinimum(end, total)
            guard CMTimeCompare(end, at) > 0, CMTimeCompare(at, trackEnd) >= 0 else { continue }
            let sourceStart = CMTimeAdd(vp.local, time(a - vpFrom))
            // A clip whose sound stops before its picture leaves silence there.
            let available = CMTimeSubtract(loaded[vp.clip].audioEnd, sourceStart)
            guard CMTimeCompare(available, .zero) > 0 else { continue }
            let length = CMTimeMinimum(CMTimeSubtract(end, at), available)
            if CMTimeCompare(at, trackEnd) > 0 { track.insertEmptyTimeRange(CMTimeRange(start: trackEnd, end: at)) }
            try track.insertTimeRange(CMTimeRange(start: sourceStart, duration: length), of: srcAudio, at: at)
            trackEnd = CMTimeAdd(at, length)
            any = true
          }
        }
        // A split continues the sound: no fade where one original clip ends and the next begins.
        let continuesIn = originals.contains { abs($0.end - clip.start) < 1e-6 }
        let continuesOut = originals.contains { abs($0.start - clip.end) < 1e-6 }
        if any { curve += AudioPlanner.gainCurve(clip: clip, dips: joins, guardStart: !continuesIn, guardEnd: !continuesOut) }
      }
      inputs.append(parameters(track: track, curve: curve))
    }

    let heard = AudioPlanner.audibleSpeech(plan.speech, originals: originals)
    for clip in clips where clip.isFile {
      // A missing or unreadable file is skipped, so the preview never breaks over one sound.
      guard let file = clip.file, AudioPlanner.isSafeFile(file) else { continue }
      let url = folder.appendingPathComponent(file)
      guard FileManager.default.fileExists(atPath: url.path) else { continue }
      let asset = AVURLAsset(url: url, options: [AVURLAssetPreferPreciseDurationAndTimingKey: true])
      guard let srcTrack = try? await asset.loadTracks(withMediaType: .audio).first,
        let fileDuration = try? await asset.load(.duration), fileDuration.seconds > 0
      else { continue }
      let pieces = AudioPlanner.filePieces(
        offset: clip.offset, fileDuration: fileDuration.seconds, start: clip.start, end: clip.end, loop: clip.loop ?? false)
      guard !pieces.isEmpty,
        let track = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)
      else { continue }
      var trackEnd = CMTime.zero
      var lastEnd = clip.start
      for p in pieces {
        let at = time(p.at)
        var end = CMTimeMinimum(time(p.at + p.length), total)
        let fileStart = time(p.fileStart)
        end = CMTimeMinimum(end, CMTimeAdd(at, CMTimeSubtract(fileDuration, fileStart)))
        guard CMTimeCompare(end, at) > 0, CMTimeCompare(at, trackEnd) >= 0 else { continue }
        if CMTimeCompare(at, trackEnd) > 0 { track.insertEmptyTimeRange(CMTimeRange(start: trackEnd, end: at)) }
        try track.insertTimeRange(CMTimeRange(start: fileStart, duration: CMTimeSubtract(end, at)), of: srcTrack, at: at)
        trackEnd = end
        lastEnd = end.seconds
      }
      // The curve ends where the sound does (a short file that doesn't loop fades out at its own end).
      var heardClip = clip
      heardClip.end = min(clip.end, lastEnd)
      let ducking = (clip.ducking ?? false) ? heard : []
      inputs.append(parameters(track: track, curve: AudioPlanner.gainCurve(clip: heardClip, ducking: ducking, guardStart: true, guardEnd: true)))
    }

    guard !inputs.isEmpty else { return nil }
    let m = AVMutableAudioMix()
    m.inputParameters = inputs
    return m
  }

  static func parameters(track: AVMutableCompositionTrack, curve: [GainPoint]) -> AVMutableAudioMixInputParameters {
    let params = AVMutableAudioMixInputParameters(track: track)
    let ramps = AudioPlanner.ramps(curve)
    let first: Double = ramps.first?.from ?? 1
    let startsLater: Bool = ramps.first.map { $0.t > 0 } ?? true
    if startsLater { params.setVolume(Float(first), at: .zero) }
    for r in ramps {
      if let until = r.until {
        params.setVolumeRamp(
          fromStartVolume: Float(r.from), toEndVolume: Float(r.to), timeRange: CMTimeRange(start: time(r.t), end: time(until)))
      } else {
        params.setVolume(Float(r.from), at: time(r.t))
      }
    }
    return params
  }

  static func sourceTime(_ segs: [CompSegment], _ comp: Double) -> Double {
    for s in segs where comp <= s.compEnd { return s.start + max(0, comp - s.compStart) }
    return segs.last?.end ?? 0
  }
}
