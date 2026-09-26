import Foundation

// Codable records shared with JS (mirrored in src/engine/types.ts). Crossing the bridge as JSON.

public enum SilenceLevel: String, Codable, Sendable { case off, light, medium, aggressive }
public enum FillerLevel: String, Codable, Sendable { case off, standard, aggressive }
public enum ZoomMode: String, Codable, Sendable { case off, subtle, dynamic }
public enum AudioMode: String, Codable, Sendable { case original, normalize, mute }
public enum CutReason: String, Codable, Sendable { case silence, filler, manual }

public struct Word: Codable, Sendable, Equatable {
  public var text: String
  public var start: Double
  public var end: Double
  public var confidence: Double
  public var isFiller: Bool

  public init(text: String, start: Double, end: Double, confidence: Double = 1, isFiller: Bool = false) {
    self.text = text
    self.start = start
    self.end = end
    self.confidence = confidence
    self.isFiller = isFiller
  }
}

/// Numbers that tell us whether the Apple engine is good enough (see docs/SPEC.md §12).
public struct TranscriptStats: Codable, Sendable, Equatable {
  public var runCount: Int
  public var singleWordRunRatio: Double
  public var lexicalFillerCount: Int
  public var elapsedSec: Double

  public init(runCount: Int = 0, singleWordRunRatio: Double = 0, lexicalFillerCount: Int = 0, elapsedSec: Double = 0) {
    self.runCount = runCount
    self.singleWordRunRatio = singleWordRunRatio
    self.lexicalFillerCount = lexicalFillerCount
    self.elapsedSec = elapsedSec
  }
}

public struct Transcript: Codable, Sendable, Equatable {
  public var words: [Word]
  public var language: String
  public var engine: String
  public var wordTimingIsExact: Bool
  public var stats: TranscriptStats

  public init(words: [Word], language: String, engine: String, wordTimingIsExact: Bool, stats: TranscriptStats = .init()) {
    self.words = words
    self.language = language
    self.engine = engine
    self.wordTimingIsExact = wordTimingIsExact
    self.stats = stats
  }
}

public struct Cut: Codable, Sendable, Equatable {
  public var id: String
  public var start: Double
  public var end: Double
  public var reason: CutReason
  public var accepted: Bool
  public var confidence: Double

  public init(id: String, start: Double, end: Double, reason: CutReason, accepted: Bool, confidence: Double) {
    self.id = id
    self.start = start
    self.end = end
    self.reason = reason
    self.accepted = accepted
    self.confidence = confidence
  }
}

public struct TimeRange: Codable, Sendable, Equatable {
  public var start: Double
  public var end: Double
  public var duration: Double { end - start }

  public init(start: Double, end: Double) {
    self.start = start
    self.end = end
  }
}

/// Face centre in display orientation, normalised 0..1, y pointing down.
public struct FacePoint: Codable, Sendable, Equatable {
  public var time: Double
  public var x: Double
  public var y: Double

  public init(time: Double, x: Double, y: Double) {
    self.time = time
    self.x = x
    self.y = y
  }
}

public struct MediaInfo: Codable, Sendable, Equatable {
  public var durationSec: Double
  /// Display (orientation-corrected) size.
  public var width: Double
  public var height: Double
  public var fps: Double
  public var isHDR: Bool
  public var hasAudio: Bool

  public init(durationSec: Double, width: Double, height: Double, fps: Double, isHDR: Bool, hasAudio: Bool) {
    self.durationSec = durationSec
    self.width = width
    self.height = height
    self.fps = fps
    self.isHDR = isHDR
    self.hasAudio = hasAudio
  }
}

public struct AnalysisOptions: Codable, Sendable, Equatable {
  public var silence: SilenceLevel
  public var fillers: FillerLevel
  public var language: String

  public init(silence: SilenceLevel = .medium, fillers: FillerLevel = .standard, language: String = "auto") {
    self.silence = silence
    self.fillers = fillers
    self.language = language
  }
}

public struct Analysis: Codable, Sendable {
  public var version: Int
  public var media: MediaInfo
  public var transcript: Transcript?
  /// RMS level in dBFS per 20 ms frame of source audio.
  public var envelopeDb: [Float]
  public var noiseFloorDb: Double
  public var speechThresholdDb: Double
  public var speechCoverage: Double
  public var noSpeech: Bool
  public var cuts: [Cut]
  public var faces: [FacePoint]
  public var warnings: [String]

  public init(
    version: Int = 1, media: MediaInfo, transcript: Transcript?, envelopeDb: [Float], noiseFloorDb: Double,
    speechThresholdDb: Double, speechCoverage: Double, noSpeech: Bool, cuts: [Cut], faces: [FacePoint], warnings: [String]
  ) {
    self.version = version
    self.media = media
    self.transcript = transcript
    self.envelopeDb = envelopeDb
    self.noiseFloorDb = noiseFloorDb
    self.speechThresholdDb = speechThresholdDb
    self.speechCoverage = speechCoverage
    self.noSpeech = noSpeech
    self.cuts = cuts
    self.faces = faces
    self.warnings = warnings
  }
}

// MARK: - Edit document (single source of truth for rendering)

public struct CaptionColors: Codable, Sendable, Equatable {
  public var base: String
  public var active: String
  public var stroke: String
  public var bg: String

  public init(base: String, active: String, stroke: String, bg: String) {
    self.base = base
    self.active = active
    self.stroke = stroke
    self.bg = bg
  }
}

public struct CaptionPosition: Codable, Sendable, Equatable {
  public var y: Double
  public init(y: Double) { self.y = y }
}

public struct CaptionSettings: Codable, Sendable, Equatable {
  public var styleId: String
  public var font: String
  public var sizeScale: Double
  public var colors: CaptionColors
  public var position: CaptionPosition
  public var uppercase: Bool
  public var maxWords: Int
  public var enabled: Bool

  public init(
    styleId: String = "pop", font: String = "poppins", sizeScale: Double = 1,
    colors: CaptionColors = .init(base: "#FFFFFF", active: "#FFE14D", stroke: "#000000", bg: "transparent"),
    position: CaptionPosition = .init(y: 0.66), uppercase: Bool = false, maxWords: Int = 4, enabled: Bool = true
  ) {
    self.styleId = styleId
    self.font = font
    self.sizeScale = sizeScale
    self.colors = colors
    self.position = position
    self.uppercase = uppercase
    self.maxWords = maxWords
    self.enabled = enabled
  }
}

public struct WordOverride: Codable, Sendable, Equatable {
  public var wordIndex: Int
  public var text: String
  public init(wordIndex: Int, text: String) {
    self.wordIndex = wordIndex
    self.text = text
  }
}

public struct ZoomSettings: Codable, Sendable, Equatable {
  public var mode: ZoomMode
  public var intensity: Int
  public var faceFollow: Bool
  public init(mode: ZoomMode = .subtle, intensity: Int = 2, faceFollow: Bool = true) {
    self.mode = mode
    self.intensity = intensity
    self.faceFollow = faceFollow
  }
}

public struct CropSettings: Codable, Sendable, Equatable {
  /// Legacy switch, used when `aspect` is absent (documents saved before aspect ratios existed).
  public var auto916: Bool
  /// "original", "9:16", "1:1", "4:5" or "16:9".
  public var aspect: String?
  /// Manual placement on the canvas: 1 = Fit (whole video visible). Absent = automatic framing
  /// (fill the canvas and follow the speaker's face).
  public var scale: Double?
  /// Video centre offset from the canvas centre, in fractions of the canvas width / height.
  public var offsetX: Double?
  public var offsetY: Double?

  public init(auto916: Bool = true, aspect: String? = nil, scale: Double? = nil, offsetX: Double? = nil, offsetY: Double? = nil) {
    self.auto916 = auto916
    self.aspect = aspect
    self.scale = scale
    self.offsetX = offsetX
    self.offsetY = offsetY
  }

  public var isManual: Bool { scale != nil }

  /// Output width / height, or nil to keep the source's shape.
  public var ratio: Double? {
    switch aspect ?? (auto916 ? "9:16" : "original") {
    case "9:16": return 9.0 / 16
    case "1:1": return 1
    case "4:5": return 4.0 / 5
    case "16:9": return 16.0 / 9
    default: return nil
    }
  }
}

public struct AudioSettings: Codable, Sendable, Equatable {
  public var mode: AudioMode
  public init(mode: AudioMode = .original) { self.mode = mode }
}

public struct EditDocument: Codable, Sendable, Equatable {
  public var version: Int
  public var cuts: [Cut]
  public var wordOverrides: [WordOverride]
  public var captions: CaptionSettings
  public var zoom: ZoomSettings
  public var crop: CropSettings
  public var audio: AudioSettings

  public init(
    version: Int = 1, cuts: [Cut] = [], wordOverrides: [WordOverride] = [], captions: CaptionSettings = .init(),
    zoom: ZoomSettings = .init(), crop: CropSettings = .init(), audio: AudioSettings = .init()
  ) {
    self.version = version
    self.cuts = cuts
    self.wordOverrides = wordOverrides
    self.captions = captions
    self.zoom = zoom
    self.crop = crop
    self.audio = audio
  }
}

// MARK: - Plan (derived, deterministic from EditDocument + Analysis)

public struct CompSegment: Codable, Sendable, Equatable {
  public var start: Double
  public var end: Double
  public var compStart: Double
  public var compEnd: Double
}

public struct ZoomEvent: Codable, Sendable, Equatable {
  /// Composition time.
  public var at: Double
  public var scale: Double
  public var anchorX: Double
  public var anchorY: Double
  /// 0 = instant (used at cuts to hide the jump), otherwise eased over this many seconds.
  public var ramp: Double
}

public struct CardWord: Codable, Sendable, Equatable {
  public var index: Int
  public var text: String
  public var start: Double
  public var end: Double
  public var emphasis: Bool
}

public struct CaptionCard: Codable, Sendable, Equatable {
  public var start: Double
  public var end: Double
  public var words: [CardWord]
  public var text: String { words.map(\.text).joined(separator: " ") }
}

public struct EditPlan: Codable, Sendable, Equatable {
  public var segments: [CompSegment]
  public var compDuration: Double
  public var zoom: [ZoomEvent]
  public var cards: [CaptionCard]
  public var removedSec: Double
}

public extension JSONEncoder {
  static let tenfold: JSONEncoder = {
    let e = JSONEncoder()
    e.nonConformingFloatEncodingStrategy = .convertToString(positiveInfinity: "Infinity", negativeInfinity: "-Infinity", nan: "NaN")
    return e
  }()
}

public extension JSONDecoder {
  static let tenfold: JSONDecoder = {
    let d = JSONDecoder()
    d.nonConformingFloatDecodingStrategy = .convertFromString(positiveInfinity: "Infinity", negativeInfinity: "-Infinity", nan: "NaN")
    return d
  }()
}

public func encodeJSON<T: Encodable>(_ value: T) throws -> String {
  String(decoding: try JSONEncoder.tenfold.encode(value), as: UTF8.self)
}

public func decodeJSON<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
  try JSONDecoder.tenfold.decode(type, from: Data(json.utf8))
}
