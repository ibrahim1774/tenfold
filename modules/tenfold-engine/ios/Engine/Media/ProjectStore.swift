import Foundation

public struct ProjectMeta: Codable, Sendable {
  public var id: String
  public var title: String
  public var sourceFile: String
  public var createdAt: Double
  public var media: MediaInfo
  public var posterFile: String?
}

public enum EngineError: LocalizedError {
  case message(String)
  public var errorDescription: String? {
    switch self { case .message(let m): return m }
  }
}

/// On-disk layout: Application Support/Tenfold/projects/<id>/{source.*, meta.json, analysis.json, poster.jpg, thumbs/, exports/}
public enum ProjectStore {
  public static var root: URL {
    let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    var url = base.appendingPathComponent("Tenfold/projects", isDirectory: true)
    if !FileManager.default.fileExists(atPath: url.path) {
      try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
      var values = URLResourceValues()
      values.isExcludedFromBackup = true
      try? url.setResourceValues(values)
    }
    return url
  }

  public static func dir(_ id: String) -> URL {
    let url = root.appendingPathComponent(id, isDirectory: true)
    try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
    return url
  }

  public static func subdir(_ id: String, _ name: String) -> URL {
    let url = dir(id).appendingPathComponent(name, isDirectory: true)
    try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
    return url
  }

  public static func write<T: Encodable>(_ value: T, _ id: String, _ file: String) throws {
    try JSONEncoder.tenfold.encode(value).write(to: dir(id).appendingPathComponent(file), options: .atomic)
  }

  public static func read<T: Decodable>(_ type: T.Type, _ id: String, _ file: String) throws -> T {
    let url = dir(id).appendingPathComponent(file)
    guard FileManager.default.fileExists(atPath: url.path) else { throw EngineError.message("Missing \(file) for project \(id)") }
    return try JSONDecoder.tenfold.decode(type, from: Data(contentsOf: url))
  }

  public static func meta(_ id: String) throws -> ProjectMeta { try read(ProjectMeta.self, id, "meta.json") }
  public static func analysis(_ id: String) throws -> Analysis { try read(Analysis.self, id, "analysis.json") }
  public static func sourceURL(_ id: String) throws -> URL { dir(id).appendingPathComponent(try meta(id).sourceFile) }

  public static func delete(_ id: String) {
    try? FileManager.default.removeItem(at: root.appendingPathComponent(id, isDirectory: true))
  }

  /// Bytes in a file, or in everything under a folder.
  public static func size(of url: URL) -> Int64 {
    var isDir: ObjCBool = false
    guard FileManager.default.fileExists(atPath: url.path, isDirectory: &isDir) else { return 0 }
    if !isDir.boolValue {
      return (try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? NSNumber)?.int64Value ?? 0
    }
    guard let e = FileManager.default.enumerator(at: url, includingPropertiesForKeys: [.fileSizeKey]) else { return 0 }
    var total: Int64 = 0
    for case let f as URL in e {
      total += Int64((try? f.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0)
    }
    return total
  }

  public static func clearExports() {
    guard let ids = try? FileManager.default.contentsOfDirectory(atPath: root.path) else { return }
    for id in ids { try? FileManager.default.removeItem(at: root.appendingPathComponent(id).appendingPathComponent("exports")) }
  }

  public static func freeDiskBytes() -> Int64 {
    let values = try? root.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey])
    return values?.volumeAvailableCapacityForImportantUsage ?? 0
  }
}
