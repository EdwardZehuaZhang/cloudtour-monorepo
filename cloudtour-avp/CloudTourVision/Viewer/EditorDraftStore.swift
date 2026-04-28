import Foundation
import simd

/// M5.3 — local-disk persistence for in-progress AVP editor sessions.
///
/// Drafts are written to `Application Support/CloudTour/drafts/<sceneId>.json`
/// every 5 s while the immersive editor is open. On reopening the same
/// scene, the SwiftUI layer offers to resume the draft before discarding.
/// On a successful Save, the matching file is deleted.
///
/// The draft format is intentionally a flat snapshot of everything the Save
/// flow would otherwise lose on app crash / cancel: transform + pending
/// waypoints + yaw updates + pending deletions + optional starting view.
struct EditorDraft: Codable, Sendable {
    let sceneId: UUID
    let savedAt: Date
    var transform: SceneTransform
    var hasUserAdjusted: Bool
    var pendingWaypoints: [DraftWaypoint]
    var yawUpdates: [DraftYawUpdate]
    var pendingDeletionSpheres: [DeletionSphere]
    var pendingDeletionBoxes: [DeletionBox]
    var pendingDeletionLassos: [DeletionLasso]
    var startingView: CameraPosition?
    var pendingHotspots: [DraftHotspot]?

    enum CodingKeys: String, CodingKey {
        case sceneId, savedAt, transform, hasUserAdjusted
        case pendingWaypoints, yawUpdates
        case pendingDeletionSpheres, pendingDeletionBoxes, pendingDeletionLassos
        case startingView, pendingHotspots
    }
}

struct DraftWaypoint: Codable, Sendable, Hashable {
    let id: UUID
    let x: Float
    let y: Float
    let z: Float
    let targetYaw: Float?
}

struct DraftYawUpdate: Codable, Sendable, Hashable {
    let waypointId: UUID
    let yaw: Float
}

struct DraftHotspot: Codable, Sendable, Hashable {
    let id: UUID
    let x: Float
    let y: Float
    let z: Float
    let title: String
    let contentType: String
    let contentMarkdown: String?
    let mediaUrl: String?
}

enum EditorDraftStore {
    static var draftsDirectory: URL {
        let base = (try? FileManager.default.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )) ?? FileManager.default.temporaryDirectory
        return base
            .appendingPathComponent("CloudTour", isDirectory: true)
            .appendingPathComponent("drafts", isDirectory: true)
    }

    static func draftURL(for sceneId: UUID) -> URL {
        draftsDirectory.appendingPathComponent("\(sceneId.uuidString).json")
    }

    /// Persist a draft. Failures are swallowed (logged) — autosave is best
    /// effort and must never break the editor.
    static func save(_ draft: EditorDraft) {
        let dir = draftsDirectory
        do {
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            let url = draftURL(for: draft.sceneId)
            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .iso8601
            encoder.outputFormatting = [.sortedKeys]
            let data = try encoder.encode(draft)
            try data.write(to: url, options: .atomic)
        } catch {
            // Best-effort. Swallow.
        }
    }

    /// Read the draft for `sceneId`, or nil if none exists / decode fails.
    static func load(sceneId: UUID) -> EditorDraft? {
        let url = draftURL(for: sceneId)
        guard FileManager.default.fileExists(atPath: url.path) else { return nil }
        do {
            let data = try Data(contentsOf: url)
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            return try decoder.decode(EditorDraft.self, from: data)
        } catch {
            return nil
        }
    }

    /// Drop the draft after a successful Save (or user-confirmed discard).
    static func discard(sceneId: UUID) {
        let url = draftURL(for: sceneId)
        try? FileManager.default.removeItem(at: url)
    }

    static func hasDraft(sceneId: UUID) -> Bool {
        FileManager.default.fileExists(atPath: draftURL(for: sceneId).path)
    }
}
