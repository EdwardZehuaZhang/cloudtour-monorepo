import Foundation

struct Waypoint: Codable, Identifiable, Hashable {
    let id: UUID
    let sceneId: UUID
    let targetSceneId: UUID?
    var label: String
    var positionX: Double
    var positionY: Double
    var positionZ: Double
    var orientationW: Double
    var orientationX: Double
    var orientationY: Double
    var orientationZ: Double

    enum CodingKeys: String, CodingKey {
        case id
        case sceneId = "scene_id"
        case targetSceneId = "target_scene_id"
        case label
        case positionX = "position_x"
        case positionY = "position_y"
        case positionZ = "position_z"
        case orientationW = "orientation_w"
        case orientationX = "orientation_x"
        case orientationY = "orientation_y"
        case orientationZ = "orientation_z"
    }
}
