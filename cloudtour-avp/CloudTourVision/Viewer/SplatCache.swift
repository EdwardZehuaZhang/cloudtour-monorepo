import Foundation

actor SplatCache {
    static let shared = SplatCache()

    private let cacheDirectory: URL
    private let maxAge: TimeInterval = 24 * 60 * 60 // 24 hours

    private init() {
        let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first!
        cacheDirectory = caches.appendingPathComponent("SplatFiles", isDirectory: true)
        try? FileManager.default.createDirectory(at: cacheDirectory, withIntermediateDirectories: true)
    }

    func cachedFileURL(for sceneId: UUID, extension ext: String) -> URL {
        cacheDirectory.appendingPathComponent("\(sceneId.uuidString).\(ext)")
    }

    func getCachedFile(for sceneId: UUID, extension ext: String) -> URL? {
        let fileURL = cachedFileURL(for: sceneId, extension: ext)
        guard FileManager.default.fileExists(atPath: fileURL.path) else { return nil }

        if let attrs = try? FileManager.default.attributesOfItem(atPath: fileURL.path),
           let modDate = attrs[.modificationDate] as? Date,
           Date().timeIntervalSince(modDate) < maxAge {
            return fileURL
        }

        try? FileManager.default.removeItem(at: fileURL)
        return nil
    }

    func cacheFile(data: Data, for sceneId: UUID, extension ext: String) throws -> URL {
        let fileURL = cachedFileURL(for: sceneId, extension: ext)
        try data.write(to: fileURL)
        return fileURL
    }
}
