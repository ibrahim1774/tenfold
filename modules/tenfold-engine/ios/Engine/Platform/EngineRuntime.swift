import Foundation

/// Process-wide state shared by the module and the preview views.
/// Analyses are cached per clip; the project analysis for a play order is concatenated on demand
/// (ClipTimeline), which is cheap next to reading and decoding the files.
final class AnalysisCache: @unchecked Sendable {
  static let shared = AnalysisCache()
  private let lock = NSLock()
  private var items: [String: Analysis] = [:]

  private func key(_ projectId: String, _ clipId: String) -> String { "\(projectId)|\(clipId)" }

  /// A clip's own analysis, or nil when it hasn't been analysed yet.
  func clip(_ projectId: String, _ clip: ClipMeta, meta: ProjectMeta) -> Analysis? {
    let k = key(projectId, clip.id)
    lock.lock()
    if let a = items[k] {
      lock.unlock()
      return a
    }
    lock.unlock()
    guard let a = ProjectStore.readClipAnalysis(projectId, clip, meta: meta) else { return nil }
    lock.lock()
    items[k] = a
    lock.unlock()
    return a
  }

  /// The project analysis with the clips in `order` (nil = the order they were added).
  func get(_ id: String, order: [String]? = nil) throws -> Analysis {
    let meta = try ProjectStore.meta(id)
    return try ProjectStore.combinedAnalysis(id, meta: meta, order: order) { self.clip(id, $0, meta: meta) }
  }

  /// Each clip in `order` with its own analysis (for per-clip detection), and the first clip's id.
  func parts(_ id: String, order: [String]?) throws -> (parts: [ClipTimeline.Part], primaryId: String) {
    let meta = try ProjectStore.meta(id)
    guard clip(id, meta.primaryClip, meta: meta) != nil else { throw EngineError.message("Missing analysis.json for project \(id)") }
    let clips = ClipTimeline.ordered(meta.allClips, order: order)
    let parts = clips.map { ClipTimeline.Part(clip: $0, analysis: self.clip(id, $0, meta: meta) ?? ProjectStore.unanalysed($0)) }
    return (parts, meta.primaryClip.id)
  }

  /// Forgets a project's analyses (after analysing again, removing a clip or deleting the project).
  func remove(_ id: String) {
    lock.lock()
    let prefix = "\(id)|"
    for k in items.keys where k.hasPrefix(prefix) { items[k] = nil }
    lock.unlock()
  }
}

/// Which clip an analysis job is on, read by its progress callback.
final class ClipProgress: @unchecked Sendable {
  private let lock = NSLock()
  private var index = 0
  private var count = 1

  func set(_ i: Int, _ n: Int) {
    lock.lock()
    index = i
    count = max(1, n)
    lock.unlock()
  }

  func get() -> (Int, Int) {
    lock.lock()
    defer { lock.unlock() }
    return (index, count)
  }
}

/// Running analysis/export tasks, so JS can cancel them by project id.
final class JobRegistry: @unchecked Sendable {
  static let shared = JobRegistry()
  private let lock = NSLock()
  private var tasks: [String: Task<String, Error>] = [:]

  func run(_ key: String, _ op: @escaping @Sendable () async throws -> String) async throws -> String {
    let task = Task { try await op() }
    lock.lock()
    tasks[key]?.cancel()
    tasks[key] = task
    lock.unlock()
    defer {
      lock.lock()
      if tasks[key] == task { tasks[key] = nil }
      lock.unlock()
    }
    return try await task.value
  }

  func cancel(prefix: String) {
    lock.lock()
    for (k, t) in tasks where k.hasPrefix(prefix) { t.cancel() }
    lock.unlock()
  }
}
