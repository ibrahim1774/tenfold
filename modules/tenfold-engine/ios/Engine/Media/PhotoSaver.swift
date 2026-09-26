import Photos

/// Saves to the camera roll with add-only access (spec §4.12). Add-only can't create or look up
/// albums, so the "Tenfold" album is not created.
public enum PhotoSaver {
  /// Returns false when the user denied access (caller offers the share sheet instead).
  public static func save(_ url: URL) async throws -> Bool {
    let status = await PHPhotoLibrary.requestAuthorization(for: .addOnly)
    guard status == .authorized || status == .limited else { return false }
    try await PHPhotoLibrary.shared().performChanges {
      _ = PHAssetChangeRequest.creationRequestForAssetFromVideo(atFileURL: url)
    }
    return true
  }
}
