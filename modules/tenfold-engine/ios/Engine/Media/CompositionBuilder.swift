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

  public static func build(source: URL, media: MediaInfo, plan: EditPlan, doc: EditDocument, faces: [FacePoint], quality: RenderQuality, keepHDR: Bool = false) async throws -> BuiltComposition {
    let asset = AVURLAsset(url: source, options: [AVURLAssetPreferPreciseDurationAndTimingKey: true])
    guard let srcVideo = try await asset.loadTracks(withMediaType: .video).first else {
      throw EngineError.message("This clip has no video track.")
    }
    let srcAudio = try await asset.loadTracks(withMediaType: .audio).first
    let (natural, preferred, fps) = try await srcVideo.load(.naturalSize, .preferredTransform, .nominalFrameRate)
    let assetDuration = try await asset.load(.duration)

    let composition = AVMutableComposition()
    guard let video = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid) else {
      throw EngineError.message("Couldn't create the video track.")
    }
    // Where each kept segment landed: its source range and composition start, so the original sound's
    // pieces are placed on exactly the same CMTimes as the picture.
    var slots: [CMTimeRange?] = Array(repeating: nil, count: plan.segments.count)
    var cursor = CMTime.zero
    for (i, seg) in plan.segments.enumerated() {
      let start = time(seg.start)
      var end = time(seg.end)
      if CMTimeCompare(end, assetDuration) > 0 { end = assetDuration }
      guard CMTimeCompare(end, start) > 0 else { continue }
      let range = CMTimeRange(start: start, end: end)
      try video.insertTimeRange(range, of: srcVideo, at: cursor)
      slots[i] = CMTimeRange(start: cursor, duration: range.duration)
      cursor = CMTimeAdd(cursor, range.duration)
    }
    let total = composition.duration
    guard CMTimeCompare(total, .zero) > 0 else { throw EngineError.message("Nothing left after cuts.") }
    let mix = try await buildAudio(
      composition: composition, source: source, srcAudio: srcAudio, plan: plan, doc: doc, placed: slots, total: total)

    // Orientation: preferredTransform maps natural → display (may include a translation).
    let displayRect = CGRect(origin: .zero, size: natural).applying(preferred)
    let display = CGSize(width: abs(displayRect.width), height: abs(displayRect.height))
    let orient = preferred.concatenating(CGAffineTransform(translationX: -displayRect.minX, y: -displayRect.minY))
    let render = renderSize(media: MediaInfo(durationSec: media.durationSec, width: display.width, height: display.height, fps: media.fps, isHDR: media.isHDR, hasAudio: media.hasAudio), crop: doc.crop, quality: quality)
    let fill = max(render.width / display.width, render.height / display.height)

    func transform(zoom: Double, focusX: Double, focusY: Double) -> CGAffineTransform {
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
      return orient.concatenating(CGAffineTransform(scaleX: s, y: s)).concatenating(CGAffineTransform(translationX: tx, y: ty))
    }

    // Manual placement (the user pinched / dragged, or picked a ratio): the video sits where they put it,
    // black shows where it doesn't reach, and punch-ins scale about their anchor. No automatic panning.
    let manual = doc.crop.isManual
    let placed = Framing.place(crop: doc.crop, canvasW: Double(render.width), canvasH: Double(render.height),
                               videoW: Double(display.width), videoH: Double(display.height))
    func manualTransform(zoom: Double, anchorX: Double, anchorY: Double) -> CGAffineTransform {
      let px = placed.originX + anchorX * placed.videoW
      let py = placed.originY + anchorY * placed.videoH
      let s = CGFloat(placed.pixelScale * zoom)
      let tx = CGFloat(px + zoom * (placed.originX - px))
      let ty = CGFloat(py + zoom * (placed.originY - py))
      return orient.concatenating(CGAffineTransform(scaleX: s, y: s)).concatenating(CGAffineTransform(translationX: tx, y: ty))
    }

    // Keyframes: zoom events + (when the frame is reframed automatically) face-follow pans every second.
    let needsPan = !manual && abs(display.width / display.height - render.width / render.height) > 0.02
    let follow = !manual && doc.zoom.faceFollow && !faces.isEmpty
    struct Key { var t: Double; var ramp: Double }
    var keys = plan.zoom.map { Key(t: $0.at, ramp: $0.ramp) }
    if follow && needsPan {
      var t = 1.0
      while t < plan.compDuration { keys.append(Key(t: t, ramp: 0.8)); t += 1 }
    }
    keys.sort { $0.t < $1.t }
    if keys.first?.t != 0 { keys.insert(Key(t: 0, ramp: 0), at: 0) }

    func state(_ t: Double) -> CGAffineTransform {
      let z = plan.zoom.last(where: { $0.at <= t + 1e-6 })?.scale ?? 1
      if manual {
        let e = plan.zoom.last(where: { $0.at <= t + 1e-6 })
        return manualTransform(zoom: z, anchorX: z > 1 ? (e?.anchorX ?? 0.5) : 0.5, anchorY: z > 1 ? (e?.anchorY ?? 0.5) : 0.5)
      }
      var fx = 0.5, fy = needsPan ? 0.42 : 0.5
      if follow, let f = FaceTrackSmoother.face(at: sourceTime(plan.segments, t), in: faces) {
        fx = f.x
        fy = f.y
      } else if let e = plan.zoom.last(where: { $0.at <= t + 1e-6 }), z > 1 {
        fx = e.anchorX
        fy = e.anchorY
      }
      return transform(zoom: z, focusX: fx, focusY: fy)
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
  /// One track holds every original clip (they never overlap); each added sound gets a track of its own.
  /// Nothing is ever placed past `total`, so the video alone decides the output's length.
  static func buildAudio(
    composition: AVMutableComposition, source: URL, srcAudio: AVAssetTrack?, plan: EditPlan, doc: EditDocument,
    placed: [CMTimeRange?], total: CMTime
  ) async throws -> AVMutableAudioMix? {
    let clips = AudioPlanner.clips(doc: doc, compDuration: min(plan.compDuration, total.seconds))
    let originals = srcAudio == nil ? [] : clips.filter(\.isOriginal)
    var inputs: [AVMutableAudioMixInputParameters] = []

    if let srcAudio, !originals.isEmpty,
      let track = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)
    {
      var trackEnd = CMTime.zero
      var curve: [GainPoint] = []
      // Cut boundaries inside the original sound get a 10 ms dip so the join doesn't click.
      let joins = placed.compactMap { $0?.start.seconds }.filter { $0 > 0 }
      for clip in originals {
        var any = false
        for piece in AudioPlanner.originalPieces(clip: clip, segments: plan.segments) {
          guard let slot = placed[piece.segment] else { continue }
          let at = CMTimeAdd(slot.start, time(piece.from))
          var end = CMTimeMinimum(CMTimeAdd(slot.start, time(piece.to)), slot.end)
          end = CMTimeMinimum(end, total)
          guard CMTimeCompare(end, at) > 0, CMTimeCompare(at, trackEnd) >= 0 else { continue }
          if CMTimeCompare(at, trackEnd) > 0 { track.insertEmptyTimeRange(CMTimeRange(start: trackEnd, end: at)) }
          let sourceStart = CMTimeAdd(time(plan.segments[piece.segment].start), time(piece.from))
          try track.insertTimeRange(CMTimeRange(start: sourceStart, duration: CMTimeSubtract(end, at)), of: srcAudio, at: at)
          trackEnd = end
          any = true
        }
        // A split continues the sound: no fade where one original clip ends and the next begins.
        let continuesIn = originals.contains { abs($0.end - clip.start) < 1e-6 }
        let continuesOut = originals.contains { abs($0.start - clip.end) < 1e-6 }
        if any { curve += AudioPlanner.gainCurve(clip: clip, dips: joins, guardStart: !continuesIn, guardEnd: !continuesOut) }
      }
      inputs.append(parameters(track: track, curve: curve))
    }

    let heard = AudioPlanner.audibleSpeech(plan.speech, originals: originals)
    let folder = source.deletingLastPathComponent()
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
