import Foundation

/// `comments` row from migration 018. Body is markdown-rendered by the
/// SwiftUI thread popover; `parentId` nil = top-level, otherwise threads
/// under another comment. Position is splat-local (same convention as
/// waypoints / hotspots).
struct Comment: Codable, Identifiable, Hashable {
    let id: UUID
    let sceneId: UUID
    let authorId: UUID
    var parentId: UUID?
    var body: String
    var position3D: Position3D
    var resolved: Bool
    let createdAt: String
    let updatedAt: String

    enum CodingKeys: String, CodingKey {
        case id
        case sceneId = "scene_id"
        case authorId = "author_id"
        case parentId = "parent_id"
        case body
        case position3D = "position_3d"
        case resolved
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
}
