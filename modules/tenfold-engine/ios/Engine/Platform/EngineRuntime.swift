import Foundation

/// Process-wide state shared by the module and the preview views.
final class AnalysisCache: @unchecked Sendable {
  static let shared = AnalysisCache()
  private let lock = NSLock()
  private var items: [String: Analysis] = [:]

  func get(_ id: String) throws -> Analysis {
    lock.lock()
    if let a = items[id] {
      lock.unlock()
      return a
    }
    lock.unlock()
    let a = try ProjectStore.analysis(id)
    set(id, a)
    return a
  }

  func set(_ id: String, _ a: Analysis) {
    lock.lock()
    items[id] = a
    lock.unlock()
  }

  func remove(_ id: String) {
    lock.lock()
    items[id] = nil
    lock.unlock()
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
