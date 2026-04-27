import Foundation

struct Scene: Codable, Identifiable, Hashable {
    let id: UUID
    let tourId: UUID
    var title: String
    var description: String?
    var sortOrder: Int
    var splatUrl: String?
    var splatFileFormat: String?
    var thumbnailUrl: String?
    var defaultCameraPosition: CameraPosition?
    var sceneEdits: SceneEdits?

    enum CodingKeys: String, CodingKey {
        case id
        case tourId = "tour_id"
        case title
        case description
        case sortOrder = "sort_order"
        case splatUrl = "splat_url"
        case splatFileFormat = "splat_file_format"
        case thumbnailUrl = "thumbnail_url"
        case defaultCameraPosition = "default_camera_position"
        case sceneEdits = "scene_edits"
    }
}
