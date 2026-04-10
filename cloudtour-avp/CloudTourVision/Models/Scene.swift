import Foundation

struct Scene: Codable, Identifiable, Hashable {
    let id: UUID
    let tourId: UUID
    var name: String
    var description: String?
    var order: Int
    var splatFileExtension: String?

    enum CodingKeys: String, CodingKey {
        case id
        case tourId = "tour_id"
        case name
        case description
        case order
        case splatFileExtension = "splat_file_extension"
    }
}
