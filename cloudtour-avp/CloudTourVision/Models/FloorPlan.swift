import Foundation

/// Normalized scene position on a 2D floor-plan canvas. x and y are in
/// the [0..1] unit square; the editor maps them onto the displayed
/// canvas size at render time.
struct ScenePosition: Codable, Hashable {
    let sceneId: UUID
    var x: Double
    var y: Double

    enum CodingKeys: String, CodingKey {
        case sceneId = "scene_id"
        case x
        case y
    }
}

struct FloorPlan: Codable, Identifiable, Hashable {
    let id: UUID
    let tourId: UUID
    var imageUrl: String?
    var scenePositions: [ScenePosition]
    let createdAt: String?
    let updatedAt: String?

    enum CodingKeys: String, CodingKey {
        case id
        case tourId = "tour_id"
        case imageUrl = "image_url"
        case scenePositions = "scene_positions"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
}
