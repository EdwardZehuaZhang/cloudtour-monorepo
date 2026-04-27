import Foundation

struct Position3D: Codable, Hashable, Sendable {
    var x: Double
    var y: Double
    var z: Double
}

struct CameraPosition: Codable, Hashable, Sendable {
    var position: Position3D
    var target: Position3D
}

struct Waypoint: Codable, Identifiable, Hashable {
    let id: UUID
    let sceneId: UUID
    let targetSceneId: UUID
    var label: String
    var icon: String?
    var position3D: Position3D
    var targetPosition3D: Position3D?
    var targetYaw: Float?

    enum CodingKeys: String, CodingKey {
        case id
        case sceneId = "scene_id"
        case targetSceneId = "target_scene_id"
        case label
        case icon
        case position3D = "position_3d"
        case targetPosition3D = "target_position_3d"
        case targetYaw = "target_yaw"
    }
}
