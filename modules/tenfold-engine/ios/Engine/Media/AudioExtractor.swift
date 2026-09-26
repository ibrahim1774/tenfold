import AVFoundation

/// AVAssetReader → 16 kHz mono Float32 PCM (spec §4.3).
public enum AudioExtractor {
  public static let sampleRate = 16_000.0

  public static func extract(url: URL, progress: (@Sendable (Double) -> Void)? = nil) async throws -> [Float] {
    let asset = AVURLAsset(url: url)
    let tracks = try await asset.loadTracks(withMediaType: .audio)
    guard !tracks.isEmpty else { return [] }
    let duration = try await asset.load(.duration).seconds

    let reader = try AVAssetReader(asset: asset)
    let settings: [String: Any] = [
      AVFormatIDKey: kAudioFormatLinearPCM,
      AVSampleRateKey: sampleRate,
      AVNumberOfChannelsKey: 1,
      AVLinearPCMBitDepthKey: 32,
      AVLinearPCMIsFloatKey: true,
      AVLinearPCMIsNonInterleaved: false,
      AVLinearPCMIsBigEndianKey: false,
    ]
    let output = AVAssetReaderAudioMixOutput(audioTracks: tracks, audioSettings: settings)
    output.alwaysCopiesSampleData = false
    guard reader.canAdd(output) else { throw EngineError.message("Can't read this clip's audio.") }
    reader.add(output)
    guard reader.startReading() else { throw reader.error ?? EngineError.message("Can't read this clip's audio.") }

    var samples: [Float] = []
    samples.reserveCapacity(Int(max(1, duration) * sampleRate) + 4096)
    while let buffer = output.copyNextSampleBuffer() {
      try Task.checkCancellation()
      guard let block = CMSampleBufferGetDataBuffer(buffer) else { continue }
      let length = CMBlockBufferGetDataLength(block)
      let count = length / MemoryLayout<Float>.size
      guard count > 0 else { continue }
      var chunk = [Float](repeating: 0, count: count)
      let status = chunk.withUnsafeMutableBytes { raw in
        CMBlockBufferCopyDataBytes(block, atOffset: 0, dataLength: length, destination: raw.baseAddress!)
      }
      if status == kCMBlockBufferNoErr { samples.append(contentsOf: chunk) }
      if duration > 0 { progress?(min(1, Double(samples.count) / sampleRate / duration)) }
    }
    if reader.status == .failed { throw reader.error ?? EngineError.message("Audio extraction failed.") }
    return samples
  }
}
